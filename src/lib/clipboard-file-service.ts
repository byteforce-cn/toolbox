/**
 * clipboard-file-service.ts — 从系统剪贴板读取文件路径。
 *
 * WKWebView 中 navigator.clipboard 读取任何内容时，macOS 13+ 会弹出原生
 * "Paste" 浮动气泡，遮挡 Radix UI ContextMenu。因此所有剪贴板读取均
 * 通过 Tauri Rust 命令完成，不再使用 navigator.clipboard API。
 *
 * Rust 侧 `clipboard_read_file_paths` 按优先级依次尝试：
 *   macOS: ① code/file-list (VSCode Electron)
 *          ② readObjectsForClasses:[NSURL] (Finder)
 *          ③ NSFilenamesPboardType (legacy)
 *          ④ public.file-url string (single file)
 *          ⑤ NSPasteboardTypeString 纯文本路径 (VSCode "Copy Path")
 *   Windows: ① CF_HDROP ② CF_UNICODETEXT 纯文本路径
 */
import { invoke } from '@tauri-apps/api/core';

/** 剪贴板中检测到的文件路径及其来源 */
export interface ClipboardFileResult {
  /** 绝对路径列表（可能多个，如 Finder 多选复制） */
  paths: string[];
  /** 来源：native = Rust NSPasteboard/CF_HDROP 读取 */
  source: 'native';
}

/**
 * 从系统剪贴板读取文件路径。
 *
 * 全部通过 Rust `clipboard_read_file_paths` 完成，不调用 navigator.clipboard，
 * 不触发 macOS paste 气泡。
 *
 * 无文件内容时返回 `null`。
 */
export async function readClipboardFilePaths(): Promise<ClipboardFileResult | null> {
  if (!(window as Window & { __TAURI__?: unknown }).__TAURI__) {
    return null;
  }
  try {
    const paths = await invoke<string[]>('clipboard_read_file_paths');
    if (paths.length > 0) {
      return { paths, source: 'native' };
    }
  } catch {
    // invoke 失败（权限问题）静默忽略
  }
  return null;
}

/**
 * 将文件绝对路径列表写入系统剪贴板（NSFilenamesPboardType / CF_HDROP）。
 * 写入后可在 Finder、VSCode 等应用中粘贴。
 */
export async function writeClipboardFilePaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  if ((window as Window & { __TAURI__?: unknown }).__TAURI__) {
    await invoke('clipboard_write_file_paths', { paths });
  }
}

/**
 * 从系统剪贴板读取纯文本内容（不触发 macOS paste 气泡）。
 * 通过 Rust `clipboard_read_text` 读取，不使用 navigator.clipboard API。
 */
export async function readClipboardText(): Promise<string> {
  if (!(window as Window & { __TAURI__?: unknown }).__TAURI__) return '';
  try {
    return await invoke<string>('clipboard_read_text');
  } catch {
    return '';
  }
}

/**
 * 从 paste 事件的 clipboardData 中同步读取文件路径文本。
 * 仅处理 "Copy Path" 产生的纯文本路径；native 文件类型需异步 `readClipboardFilePaths`。
 */
export function readPasteEventFilePath(e: ClipboardEvent): string | null {
  const text = e.clipboardData?.getData('text/plain')?.trim() ?? '';
  return isAbsolutePath(text) ? text : null;
}

/** 判断字符串是否为绝对文件路径（Unix 或 Windows） */
function isAbsolutePath(s: string): boolean {
  if (!s) return false;
  // Unix: 以 / 开头
  if (s.startsWith('/')) return true;
  // Windows: C:\... 或 \\server\...
  if (/^[A-Za-z]:[/\\]/.test(s)) return true;
  if (s.startsWith('\\\\')) return true;
  return false;
}
