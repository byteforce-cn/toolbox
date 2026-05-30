/// workspace_fs.rs — Workspace-scoped file system broker.
///
/// 所有文件操作都由此模块代理，而非直接暴露 tauri-plugin-fs 权限给前端。
/// 安全策略：
///   1. 只允许操作已注册的 workspace root 及其子目录。
///   2. 拒绝访问系统敏感目录（.ssh / .gnupg / .aws / .kube 等）。
///   3. 路径规范化后检查前缀，防止 path traversal（../../ 等）。
use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime};

// ── 敏感路径 deny list ──────────────────────────────────────────────────────

/// 用户 home 下禁止访问的顶层目录名。
const HOME_SENSITIVE_DIRS: &[&str] = &[
    ".ssh",
    ".gnupg",
    ".gpg",
    ".aws",
    ".kube",
    ".config/gcloud",
    ".azure",
    ".docker",
    "Library/Keychains",
    "Library/Application Support/Google/Chrome",
    "Library/Application Support/Firefox",
    "Library/Application Support/1Password",
    "Library/Application Support/Keychain",
];

/// 系统绝对路径 deny list（精确前缀匹配）。
const SYSTEM_DENY_PREFIXES: &[&str] = &[
    "/etc",
    "/private/etc",
    "/var",
    "/private/var",
    "/System",
    "/usr/bin",
    "/usr/sbin",
    "/sbin",
    "/bin",
    "/boot",
    "/proc",
    "/sys",
    "/dev",
];

// ── Workspace 注册状态 ─────────────────────────────────────────────────────

pub struct WorkspaceBrokerState {
    /// workspace_id -> 规范化后的绝对路径
    pub workspaces: Mutex<HashMap<String, PathBuf>>,
}

impl Default for WorkspaceBrokerState {
    fn default() -> Self {
        Self {
            workspaces: Mutex::new(HashMap::new()),
        }
    }
}

// ── 路径安全校验 ─────────────────────────────────────────────────────────

fn canonicalize_strict(raw: &str) -> Result<PathBuf, String> {
    let p = Path::new(raw);
    // 先尝试 canonicalize；若文件尚不存在则手动清理 ../ 并构造绝对路径
    match p.canonicalize() {
        Ok(c) => Ok(c),
        Err(e) if e.kind() == ErrorKind::NotFound => {
            // 文件不存在时仍需规范化路径（写入前校验）
            let mut components: Vec<std::path::Component> = Vec::new();
            for comp in p.components() {
                match comp {
                    std::path::Component::ParentDir => {
                        if components.last().map_or(false, |c| {
                            !matches!(c, std::path::Component::RootDir)
                        }) {
                            components.pop();
                        }
                    }
                    std::path::Component::CurDir => {}
                    other => components.push(other),
                }
            }
            let resolved: PathBuf = components.iter().collect();
            Ok(resolved)
        }
        Err(e) => Err(format!("path resolution error: {e}")),
    }
}

fn deny_sensitive(path: &Path) -> Result<(), String> {
    let path_str = path.to_string_lossy();

    // 系统路径 deny
    for prefix in SYSTEM_DENY_PREFIXES {
        if path_str.starts_with(prefix) {
            return Err(format!("access to system path denied: {path_str}"));
        }
    }

    // home 下敏感目录 deny
    if let Some(home) = dirs_home() {
        for sensitive in HOME_SENSITIVE_DIRS {
            let sensitive_path = home.join(sensitive);
            if path.starts_with(&sensitive_path) {
                return Err(format!("access to sensitive directory denied: {path_str}"));
            }
        }
    }

    Ok(())
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var("HOME")
        .ok()
        .map(PathBuf::from)
        .or_else(|| std::env::var("USERPROFILE").ok().map(PathBuf::from))
}

fn assert_within_workspace(workspace_root: &Path, target: &Path) -> Result<(), String> {
    if !target.starts_with(workspace_root) {
        return Err(format!(
            "path '{}' is outside workspace root '{}'",
            target.display(),
            workspace_root.display()
        ));
    }
    deny_sensitive(target)
}

// ── IPC Commands ──────────────────────────────────────────────────────────

/// 注册 workspace root。前端打开目录后调用此命令，后续所有 broker 操作都在此范围内。
#[tauri::command]
pub fn workspace_register(
    workspace_id: String,
    root_path: String,
    state: tauri::State<WorkspaceBrokerState>,
) -> Result<(), String> {
    let canonical = canonicalize_strict(&root_path)?;
    deny_sensitive(&canonical)?;

    state
        .workspaces
        .lock()
        .map_err(|e| format!("state lock poisoned: {e}"))?
        .insert(workspace_id, canonical);
    Ok(())
}

/// 取消注册 workspace root。
#[tauri::command]
pub fn workspace_unregister(
    workspace_id: String,
    state: tauri::State<WorkspaceBrokerState>,
) -> Result<(), String> {
    state
        .workspaces
        .lock()
        .map_err(|e| format!("state lock poisoned: {e}"))?
        .remove(&workspace_id);
    Ok(())
}

fn get_workspace_root(
    workspace_id: &str,
    state: &tauri::State<WorkspaceBrokerState>,
) -> Result<PathBuf, String> {
    state
        .workspaces
        .lock()
        .map_err(|e| format!("state lock poisoned: {e}"))?
        .get(workspace_id)
        .cloned()
        .ok_or_else(|| format!("workspace '{workspace_id}' not registered"))
}

#[derive(serde::Serialize)]
pub struct BrokerDirEntry {
    pub path: String,
    pub name: String,
    pub is_directory: bool,
}

/// 读取目录内容（限 workspace 范围）。
#[tauri::command]
pub fn workspace_read_dir(
    workspace_id: String,
    path: String,
    state: tauri::State<WorkspaceBrokerState>,
) -> Result<Vec<BrokerDirEntry>, String> {
    let root = get_workspace_root(&workspace_id, &state)?;
    let target = canonicalize_strict(&path)?;
    assert_within_workspace(&root, &target)?;

    let entries = std::fs::read_dir(&target)
        .map_err(|e| format!("read_dir failed: {e}"))?;

    let mut result = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("dir entry error: {e}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let is_directory = entry
            .file_type()
            .map(|ft| ft.is_dir())
            .unwrap_or(false);
        let full_path = entry.path().to_string_lossy().to_string();
        result.push(BrokerDirEntry {
            path: full_path,
            name,
            is_directory,
        });
    }
    Ok(result)
}

/// 读取文本文件（限 workspace 范围，100 KB 限制）。
#[tauri::command]
pub fn workspace_read_text_file(
    workspace_id: String,
    path: String,
    state: tauri::State<WorkspaceBrokerState>,
) -> Result<String, String> {
    const MAX_BYTES: u64 = 100 * 1024; // 100 KB guard

    let root = get_workspace_root(&workspace_id, &state)?;
    let target = canonicalize_strict(&path)?;
    assert_within_workspace(&root, &target)?;

    let metadata = std::fs::metadata(&target)
        .map_err(|e| format!("stat failed: {e}"))?;
    if metadata.len() > MAX_BYTES {
        return Err(format!(
            "file size {} bytes exceeds {} byte read limit; use a streaming API for large files",
            metadata.len(),
            MAX_BYTES
        ));
    }

    std::fs::read_to_string(&target).map_err(|e| format!("read failed: {e}"))
}

/// 写入文本文件（限 workspace 范围）。
#[tauri::command]
pub fn workspace_write_text_file(
    workspace_id: String,
    path: String,
    content: String,
    state: tauri::State<WorkspaceBrokerState>,
) -> Result<(), String> {
    let root = get_workspace_root(&workspace_id, &state)?;
    let target = canonicalize_strict(&path)?;
    assert_within_workspace(&root, &target)?;

    std::fs::write(&target, content).map_err(|e| format!("write failed: {e}"))
}

/// 创建目录（限 workspace 范围，recursive）。
#[tauri::command]
pub fn workspace_mkdir(
    workspace_id: String,
    path: String,
    state: tauri::State<WorkspaceBrokerState>,
) -> Result<(), String> {
    let root = get_workspace_root(&workspace_id, &state)?;
    let target = canonicalize_strict(&path)?;
    assert_within_workspace(&root, &target)?;

    std::fs::create_dir_all(&target).map_err(|e| format!("mkdir failed: {e}"))
}

/// 重命名/移动文件（源与目标都必须在同一 workspace 范围内）。
#[tauri::command]
pub fn workspace_rename(
    workspace_id: String,
    old_path: String,
    new_path: String,
    state: tauri::State<WorkspaceBrokerState>,
) -> Result<(), String> {
    let root = get_workspace_root(&workspace_id, &state)?;
    let src = canonicalize_strict(&old_path)?;
    let dst = canonicalize_strict(&new_path)?;
    assert_within_workspace(&root, &src)?;
    assert_within_workspace(&root, &dst)?;

    std::fs::rename(&src, &dst).map_err(|e| format!("rename failed: {e}"))
}

/// 删除文件或目录（限 workspace 范围）。
#[tauri::command]
pub fn workspace_remove(
    workspace_id: String,
    path: String,
    recursive: bool,
    state: tauri::State<WorkspaceBrokerState>,
) -> Result<(), String> {
    let root = get_workspace_root(&workspace_id, &state)?;
    let target = canonicalize_strict(&path)?;
    assert_within_workspace(&root, &target)?;

    if recursive {
        std::fs::remove_dir_all(&target).map_err(|e| format!("remove_dir_all failed: {e}"))
    } else {
        // 先尝试删除文件，若是目录则删除空目录
        if target.is_dir() {
            std::fs::remove_dir(&target).map_err(|e| format!("remove_dir failed: {e}"))
        } else {
            std::fs::remove_file(&target).map_err(|e| format!("remove_file failed: {e}"))
        }
    }
}

/// 检查路径是否存在（限 workspace 范围）。
#[tauri::command]
pub fn workspace_exists(
    workspace_id: String,
    path: String,
    state: tauri::State<WorkspaceBrokerState>,
) -> Result<bool, String> {
    let root = get_workspace_root(&workspace_id, &state)?;
    let target = canonicalize_strict(&path)?;
    assert_within_workspace(&root, &target)?;

    Ok(target.exists())
}

/// 从 workspace 外部复制文件到 workspace 内指定目录。
/// 场景：从系统剪贴板粘贴 VSCode / Finder 复制的文件。
///
/// 安全校验：
/// - dest_dir_absolute 必须在已注册的 workspace root 内
/// - 源路径通过 deny_sensitive 检查，拒绝凭据/系统敏感目录
/// - 自动处理文件名冲突（追加 _copy、_copy2 … _copy99）
/// - 仅支持单文件；不递归复制目录
/// - 返回写入后目标文件的绝对路径
#[tauri::command]
pub fn workspace_copy_external_file(
    workspace_id: String,
    src_absolute: String,
    dest_dir_absolute: String,
    state: tauri::State<WorkspaceBrokerState>,
) -> Result<String, String> {
    let root = get_workspace_root(&workspace_id, &state)?;

    // ① 源路径：不要求在 workspace 内，但不能是敏感路径
    let src = canonicalize_strict(&src_absolute)?;
    deny_sensitive(&src)?;
    if !src.is_file() {
        return Err(format!("源路径不是文件: {}", src.display()));
    }

    // ② 目标目录：必须在 workspace 内
    let dest_dir = canonicalize_strict(&dest_dir_absolute)?;
    assert_within_workspace(&root, &dest_dir)?;
    if !dest_dir.is_dir() {
        return Err(format!("目标路径不是目录: {}", dest_dir.display()));
    }

    // ③ 解析无冲突文件名
    let file_name = src
        .file_name()
        .ok_or_else(|| "源路径无文件名".to_string())?
        .to_string_lossy()
        .into_owned();
    let dest_path = resolve_non_conflicting_dest(&dest_dir, &file_name)?;

    // ④ 复制
    std::fs::copy(&src, &dest_path).map_err(|e| format!("复制失败: {e}"))?;

    Ok(dest_path.to_string_lossy().into_owned())
}

/// 生成无冲突目标路径：若目标文件已存在，追加 _copy、_copy2 … _copy99 后缀。
fn resolve_non_conflicting_dest(dir: &Path, file_name: &str) -> Result<PathBuf, String> {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return Ok(candidate);
    }

    let path = Path::new(file_name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(file_name);
    let ext = path.extension().and_then(|s| s.to_str());

    for i in 1u32..=99 {
        let new_name = match ext {
            Some(e) if i == 1 => format!("{stem}_copy.{e}"),
            Some(e) => format!("{stem}_copy{i}.{e}"),
            None if i == 1 => format!("{stem}_copy"),
            None => format!("{stem}_copy{i}"),
        };
        let candidate = dir.join(&new_name);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("无法生成无冲突文件名（已存在 99 个副本）".to_string())
}

// ── Unit tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_canonicalize_strict_existing() {
        let p = canonicalize_strict("/tmp").unwrap();
        assert!(p.is_absolute());
    }

    #[test]
    fn test_canonicalize_strict_nonexistent_resolves() {
        let p = canonicalize_strict("/tmp/does_not_exist_xyz/file.txt").unwrap();
        assert!(p.is_absolute());
        assert!(p.to_string_lossy().contains("does_not_exist_xyz"));
    }

    #[test]
    fn test_canonicalize_strips_traversal() {
        let p = canonicalize_strict("/tmp/foo/../bar").unwrap();
        // Should resolve to /tmp/bar (or /private/tmp/bar on macOS)
        let s = p.to_string_lossy();
        assert!(!s.contains(".."));
        assert!(s.ends_with("bar"));
    }

    #[test]
    fn test_deny_sensitive_system_paths() {
        assert!(deny_sensitive(Path::new("/etc/passwd")).is_err());
        assert!(deny_sensitive(Path::new("/System/Library/foo")).is_err());
    }

    #[test]
    fn test_assert_within_workspace_outside() {
        let root = PathBuf::from("/Users/user/workspace");
        let outside = PathBuf::from("/Users/user/other");
        assert!(assert_within_workspace(&root, &outside).is_err());
    }

    #[test]
    fn test_assert_within_workspace_inside() {
        let root = PathBuf::from("/Users/user/workspace");
        let inside = PathBuf::from("/Users/user/workspace/src/main.rs");
        assert!(assert_within_workspace(&root, &inside).is_ok());
    }
}
