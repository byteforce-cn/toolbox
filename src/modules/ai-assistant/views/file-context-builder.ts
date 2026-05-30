/**
 * file-context-builder.ts — 文件上下文构建工具。
 * 基于 draft/jinhe 精简适配，使用 toolbox FileBuffer 接口。
 */
import { invoke } from '@tauri-apps/api/core';
import type { FileBuffer } from '../../../store/file-buffer-store';
import { invokeAI } from '../services/invoke-ai';

// ── 常量 ──────────────────────────────────────────────────────────────────

export const MAX_FILE_CONTEXT_TOKENS = 3200;
export const ACTIVE_FILE_MAX_FULL_TOKENS = 1400;
export const ACTIVE_FILE_HEAD_LINES = 120;
export const ACTIVE_FILE_TAIL_LINES = 120;
export const OTHER_FILE_MAX_FULL_TOKENS = 500;
export const OTHER_FILE_PREVIEW_LINES = 36;

// ── 辅助 ──────────────────────────────────────────────────────────────────

export function estimateTokens(text: string): number {
  let cjk = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x4e00 && code <= 0x9fff) cjk++;
  }
  return Math.ceil((text.length - cjk) / 4) + Math.ceil(cjk / 2);
}

// ── 工作区上下文 ───────────────────────────────────────────────────────────

interface WorkspaceContextOptions {
  rootPath: string | null;
  activeFilePath: string | null;
  openFiles: string[];
  dirtyFiles: string[];
}

export function buildWorkspaceContext(options: WorkspaceContextOptions): string {
  const { rootPath, activeFilePath, openFiles, dirtyFiles } = options;
  const parts: string[] = ['## 工作区上下文\n'];

  if (rootPath) {
    const projectName = rootPath.split('/').pop() ?? rootPath;
    parts.push(`- **项目**: ${projectName}`);
    parts.push(`- **工作区根目录**: ${rootPath}`);
  }
  if (activeFilePath) {
    const relPath = rootPath ? activeFilePath.replace(rootPath + '/', '') : activeFilePath;
    parts.push(`- **当前编辑文件**: ${relPath}`);
  }
  if (openFiles.length > 0) {
    const list = openFiles
      .map((f) => {
        const rel = rootPath ? f.replace(rootPath + '/', '') : f;
        const dirty = dirtyFiles.includes(f) ? ' (已修改)' : '';
        const active = f === activeFilePath ? ' ← 当前' : '';
        return `  - ${rel}${dirty}${active}`;
      })
      .join('\n');
    parts.push(`- **打开的文件** (${openFiles.length}):\n${list}`);
  }
  return parts.join('\n') + '\n';
}

export async function buildFileTreeContext(rootPath: string | null): Promise<string> {
  if (!rootPath) return '';
  try {
    const tree = await invokeAI<string>('workspace_file_tree', { dir: rootPath });
    if (!tree?.trim()) return '';
    const name = rootPath.split('/').pop() ?? rootPath;
    return `## 项目文件结构\n\n\`\`\`\n${name}/\n${tree}\`\`\`\n`;
  } catch {
    return '';
  }
}

interface DirEntry { path: string; name: string; is_directory: boolean }

/**
 * 读取 `{rootPath}/.claude/memory/` 目录下所有 `.md` 文件并注入为系统 prompt 约束块。
 *
 * - 按文件名排序，最多读取 20 个文件，每个文件 token 超 800 时截断。
 * - 文件或目录不存在时静默返回空字符串，不影响 agent 启动。
 * - 使用 workspace broker 读取（不调用 navigator.clipboard 等 Web API）。
 */
export async function buildMemoryContext(
  rootPath: string | null,
  workspaceId: string,
): Promise<string> {
  if (!rootPath || !workspaceId) return '';
  const memDir = `${rootPath}/.claude/memory`;
  try {
    const entries = await invoke<DirEntry[]>('workspace_read_dir', {
      workspaceId,
      path: memDir,
    });
    const mdFiles = entries
      .filter((e) => !e.is_directory && e.name.toLowerCase().endsWith('.md'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 20);
    if (mdFiles.length === 0) return '';

    const MAX_FILE_TOKENS = 800;
    const parts: string[] = ['## 项目记忆与约束（.claude/memory）\n'];
    for (const file of mdFiles) {
      try {
        const raw = await invoke<string>('workspace_read_text_file', {
          workspaceId,
          path: file.path,
        });
        if (!raw?.trim()) continue;
        const body =
          estimateTokens(raw) <= MAX_FILE_TOKENS
            ? raw.trim()
            : raw
                .split('\n')
                .slice(0, 60)
                .join('\n')
                .trim() + '\n...(截断)';
        parts.push(`### ${file.name}\n${body}\n`);
      } catch {
        // 单文件读取失败不影响其他文件
      }
    }
    return parts.length > 1 ? parts.join('\n') : '';
  } catch {
    return '';
  }
}

// ── Symbol index ───────────────────────────────────────────────────────────

export interface WorkspaceSymbol {
  name: string;
  kind: string;
  file: string;
  line: number;
}

let _symbolCache: WorkspaceSymbol[] | null = null;
let _symbolFetch: Promise<WorkspaceSymbol[]> | null = null;

export function invalidateSymbolCache(): void {
  _symbolCache = null;
  _symbolFetch = null;
}

export async function loadSymbolIndex(rootPath: string | null): Promise<WorkspaceSymbol[]> {
  if (!rootPath) return [];
  if (_symbolCache !== null) return _symbolCache;
  if (_symbolFetch) return _symbolFetch;
  _symbolFetch = invokeAI<WorkspaceSymbol[]>('workspace_symbol_index', { dir: rootPath })
    .then((s) => { _symbolCache = s ?? []; _symbolFetch = null; return _symbolCache; })
    .catch(() => { _symbolFetch = null; return []; });
  return _symbolFetch;
}

export async function buildTopSymbolsContext(rootPath: string | null): Promise<string> {
  const symbols = await loadSymbolIndex(rootPath);
  if (!symbols.length) return '';
  const byKind = new Map<string, WorkspaceSymbol[]>();
  for (const sym of symbols) {
    const b = byKind.get(sym.kind) ?? [];
    b.push(sym);
    byKind.set(sym.kind, b);
  }
  const order = ['class', 'interface', 'type', 'struct', 'enum', 'trait', 'function', 'impl'];
  const parts: string[] = [`## 工作区符号总览 (共 ${symbols.length} 个)\n`];
  for (const kind of order) {
    const entries = byKind.get(kind);
    if (!entries?.length) continue;
    parts.push(`**${kind}**: ${entries.slice(0, 20).map((s) => `\`${s.name}\``).join(', ')}`);
  }
  return parts.join('\n') + '\n';
}

// ── 文件内容上下文 ─────────────────────────────────────────────────────────

function previewContent(
  content: string,
  maxFullTokens: number,
  headLines: number,
  tailLines = 0,
): { body: string; full: boolean } {
  const text = content.replace(/\r\n/g, '\n');
  if (estimateTokens(text) <= maxFullTokens) return { body: text, full: true };
  const lines = text.split('\n');
  const head = lines.slice(0, headLines);
  const tail = tailLines > 0 ? lines.slice(Math.max(head.length, lines.length - tailLines)) : [];
  const parts = [`${head.join('\n')}\n...(${lines.length - head.length - tail.length} lines omitted)...`];
  if (tail.length) parts.push(tail.join('\n'));
  return { body: parts.join('\n'), full: false };
}

export function buildFileContext(
  buffers: Record<string, FileBuffer>,
  activeFilePath: string | null,
  pinnedPaths: Set<string>,
): { context: string; included: { path: string; full: boolean }[] } {
  const included: { path: string; full: boolean }[] = [];
  if (!Object.keys(buffers).length) return { context: '', included };

  const skip = (p: string) => /[/\\]\.claude[/\\]/.test(p) || /\.instructions\.md$/i.test(p);

  const activeBuffer = activeFilePath && !skip(activeFilePath) ? buffers[activeFilePath] : null;
  const pinned = Object.values(buffers).filter(
    (b) => b.filePath !== activeFilePath && pinnedPaths.has(b.filePath) && !skip(b.filePath),
  );

  const parts: string[] = ['## 当前工作区文件上下文\n'];
  let tokenUsed = estimateTokens(parts[0]);

  const appendFile = (buf: FileBuffer, maxFull: number, head: number, tail = 0) => {
    const { body, full } = previewContent(buf.content, maxFull, head, tail);
    const isDirty = buf.isModified;
    const label = buf.filePath === activeFilePath
      ? `### 当前编辑文件: ${buf.filePath}${isDirty ? ' (已修改)' : ''}`
      : `### 附加文件: ${buf.filePath}${isDirty ? ' (已修改)' : ''}`;
    const hint = full ? '' : '\n> 仅注入预算内片段，请优先结合搜索/读取工具获取完整内容。';
    const section = `${label}${hint}\n\`\`\`\n${body}\n\`\`\`\n\n`;
    const tokens = estimateTokens(section);
    if (tokenUsed + tokens > MAX_FILE_CONTEXT_TOKENS) return;
    tokenUsed += tokens;
    parts.push(section);
    included.push({ path: buf.filePath, full });
  };

  if (activeBuffer) appendFile(activeBuffer, ACTIVE_FILE_MAX_FULL_TOKENS, ACTIVE_FILE_HEAD_LINES, ACTIVE_FILE_TAIL_LINES);
  for (const buf of pinned) appendFile(buf, OTHER_FILE_MAX_FULL_TOKENS, OTHER_FILE_PREVIEW_LINES);

  if (!included.length) return { context: '', included };
  return { context: parts.join(''), included };
}
