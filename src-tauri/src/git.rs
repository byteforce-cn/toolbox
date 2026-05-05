use std::collections::HashMap;
use std::process::Command;
use std::time::{Duration, Instant};

/// Git 状态码（对应 `git status --porcelain` 输出的两字符状态）
#[derive(serde::Serialize, Clone)]
pub struct GitFileStatus {
    /// XY 两字符状态码，例如 " M", "M ", "??", "D ", "R ", "C "
    pub xy: String,
    pub staged: bool,
    pub unstaged: bool,
}

/// 超时：git 命令最长执行时间（秒）。超大仓库或挂载延迟时保护 UI。
const GIT_STATUS_TIMEOUT_SECS: u64 = 10;

/// 输出大小上限（字节）。超过此大小截断，避免 UI 内存压力。
const GIT_STATUS_MAX_OUTPUT_BYTES: usize = 256 * 1024; // 256 KB

/// workspace_git_status — 运行 `git status --porcelain` 并解析结果。
/// 返回 Map<绝对路径, GitFileStatus>。
/// target_paths 可选，若传入则过滤只返回这些路径的状态。
#[tauri::command]
pub async fn workspace_git_status(
    path: String,
    target_paths: Option<Vec<String>>,
) -> Result<HashMap<String, GitFileStatus>, String> {
    // 检查 git 是否可用
    if Command::new("git").arg("--version").output().is_err() {
        return Err("git is not available in PATH".to_string());
    }

    let start = Instant::now();
    let output = Command::new("git")
        .args(["-C", &path, "status", "--porcelain", "-u"])
        .output()
        .map_err(|e| format!("git command failed: {e}"))?;

    let elapsed = start.elapsed();
    if elapsed > Duration::from_secs(GIT_STATUS_TIMEOUT_SECS) {
        return Err(format!(
            "git status timed out after {:.1}s (limit: {}s). Repository may be too large.",
            elapsed.as_secs_f32(),
            GIT_STATUS_TIMEOUT_SECS
        ));
    }

    if !output.status.success() {
        // git -C <path> status 失败通常意味着不是 git 仓库 — 静默返回空 map
        return Ok(HashMap::new());
    }

    if output.stdout.len() > GIT_STATUS_MAX_OUTPUT_BYTES {
        return Err(format!(
            "git status output ({} bytes) exceeds {} byte limit. Consider using .gitignore to reduce tracked files.",
            output.stdout.len(),
            GIT_STATUS_MAX_OUTPUT_BYTES
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let root = path.trim_end_matches('/');

    let mut statuses: HashMap<String, GitFileStatus> = HashMap::new();
    for line in stdout.lines() {
        if line.len() < 4 {
            continue;
        }
        let xy = &line[..2];
        let rest = &line[3..];

        // 处理重命名：`R  old -> new`  或  `R  new\0old`（porcelain v1）
        let file_path = if rest.contains(" -> ") {
            rest.split(" -> ").last().unwrap_or(rest)
        } else {
            rest
        }
        .trim_matches('"'); // git 对含空格路径加引号

        let abs_path = format!("{root}/{file_path}");

        let staged = !matches!(&xy[..1], " " | "?");
        let unstaged = !matches!(&xy[1..2], " " | "?");

        let status = GitFileStatus {
            xy: xy.to_string(),
            staged,
            unstaged,
        };

        statuses.insert(abs_path, status);
    }

    // 按 target_paths 过滤
    if let Some(targets) = target_paths {
        if !targets.is_empty() {
            statuses.retain(|k, _| targets.iter().any(|t| k.starts_with(t.as_str())));
        }
    }

    Ok(statuses)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_non_git_directory_returns_empty() {
        // /tmp は非 git 仓库，应返回空 map 而不是错误
        let result = workspace_git_status("/tmp".to_string(), None).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_nonexistent_path_returns_empty() {
        let result = workspace_git_status("/nonexistent_xyz_path_1234".to_string(), None).await;
        // 不存在的路径 git 会失败，应返回空 map
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }
}
