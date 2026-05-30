/**
 * ExplorerSidebarView: the main Explorer left-panel view.
 */

import { useCallback, useEffect, useState } from 'react';
import { useExplorerStore } from '../store/explorer-store';
import { FileTreeToolbar } from '../components/FileTreeToolbar';
import { FileTreeView } from './FileTreeView';
import { useExplorerProjectedTree } from '../hooks/useExplorerProjectedTree';
import type { FileNode } from '../store/types';
import { refreshExplorer, setExplorerRootPath, deleteExplorerNode, pasteExternalFilesToDir } from '../explorer-controller';
import { tauriFsService } from '../tauri-fs-service';
import { useFileBufferStore } from '../../../store/file-buffer-store';
import { useWorkspaceStore } from '../../../store/workspace-store';
import { useLayoutStore } from '@byteforce/shell';
import { readClipboardFilePaths, readClipboardText, writeClipboardFilePaths } from '../../../lib/clipboard-file-service';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';

export function ExplorerSidebarView() {
  const rootPath = useExplorerStore((s) => s.rootPath);
  const isLoading = useExplorerStore((s) => s.isLoading);
  const error = useExplorerStore((s) => s.error);

  // ── 剪贴板文件感知 ───────────────────────────────────────────────────
  // 不使用异步条件渲染控制菜单项显隐（菜单打开时 state 来不及更新）
  // 改为：粘贴项始终显示，handlePasteToDir 内部读剪贴板，无内容时静默返回
  const selectedPath = useExplorerStore((s) => s.selectedPath);
  const tree = useExplorerProjectedTree();

  const handleCollapseAll = useCallback(() => {
    useExplorerStore.setState({ expandedPaths: new Set() });
  }, []);

  const handleOpenFolder = useCallback(async () => {
    const dir = await tauriFsService.openDirectoryDialog();
    if (dir) {
      await setExplorerRootPath(dir);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    await refreshExplorer();
  }, []);

  const getTargetDir = useCallback((): string | null => {
    if (!rootPath) return null;
    if (!selectedPath) return rootPath;

    const findNode = (nodes: typeof tree, path: string): typeof tree[0] | null => {
      for (const node of nodes) {
        if (node.path === path) return node;
        if (node.children) {
          const found = findNode(node.children, path);
          if (found) return found;
        }
      }
      return null;
    };

    const node = findNode(tree, selectedPath);
    if (node?.kind === 'dir') return selectedPath;
    const parent = selectedPath.split('/').slice(0, -1).join('/');
    return parent || rootPath;
  }, [rootPath, selectedPath, tree]);

  // ── 文本粘贴新建文件对话框 ──────────────────────────────────────────────
  // 当剪贴板为纯文本（非文件路径）时，提示用户以该文本内容新建文件。
  const [textPasteDialog, setTextPasteDialog] = useState<{
    destDir: string;
    text: string;
    fileName: string;
  } | null>(null);

  // ── 粘贴外部文件 ─────────────────────────────────────────────────────────
  const handlePasteToDir = useCallback(async (destDir: string) => {
    const result = await readClipboardFilePaths();
    if (result && result.paths.length > 0) {
      await pasteExternalFilesToDir(destDir, result.paths);
      return;
    }
    // 剪贴板中无文件路径 → 尝试读取文本，提示以文本内容新建文件
    const text = await readClipboardText();
    if (text.trim()) {
      // 从文本首行推断文件名（去掉非路径安全字符，最长 40 字符）
      const firstLine = text.split('\n')[0].trim();
      const suggested = firstLine
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .slice(0, 40)
        .trim() || 'clipboard';
      setTextPasteDialog({ destDir, text, fileName: suggested + '.txt' });
    }
  }, []);

  // ── 复制文件到系统剪贴板 ───────────────────────────────────────────────
  const handleCopyFile = useCallback(async (path: string) => {
    await writeClipboardFilePaths([path]);
  }, []);

  // Cmd+V / Ctrl+V → 粘贴到当前选中目录（或 workspace 根目录）
  // 监听 window 而非容器 div，避免 WKWebView 对 tabIndex 元素弹出系统原生 Paste 气泡
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.key === 'v')) return;

      // 当焦点在任何可编辑区域（输入框、textarea、CodeMirror、contenteditable 等）时
      // 放行，让原生粘贴行为正常工作，不进入文件粘贴逻辑
      const el = e.target as HTMLElement | null;
      if (el) {
        if (
          el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable ||
          el.closest('[contenteditable="true"]') !== null ||
          el.closest('.cm-content') !== null  // CodeMirror editor surface
        ) {
          return;
        }
      }

      const target = getTargetDir();
      if (!target) return;
      e.preventDefault();
      void handlePasteToDir(target);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [getTargetDir, handlePasteToDir]);

  const [pendingNewKind, setPendingNewKind] = useState<'file' | 'dir' | null>(null);
  const [pendingNewParent, setPendingNewParent] = useState<string | null>(null);

  const handleNewFile = useCallback(() => {
    if (!rootPath) { handleOpenFolder(); return; }
    setPendingNewParent(getTargetDir());
    setPendingNewKind('file');
  }, [rootPath, handleOpenFolder, getTargetDir]);

  const handleNewFolder = useCallback(() => {
    if (!rootPath) { handleOpenFolder(); return; }
    setPendingNewParent(getTargetDir());
    setPendingNewKind('dir');
  }, [rootPath, handleOpenFolder, getTargetDir]);

  const handleOpenFile = useCallback(async (node: FileNode) => {
    if (node.kind !== 'file') return;
    // 已在缓冲区则直接激活 tab
    const existing = useFileBufferStore.getState().buffers[node.path];
    if (existing) {
      useFileBufferStore.getState().setActiveTab(node.path);
      return;
    }
    try {
      const wsId = useWorkspaceStore.getState().workspaceId ?? '';
      const content = await tauriFsService.readTextFile(wsId, node.path);
      useFileBufferStore.getState().openFile(node.path, content);
    } catch (err) {
      console.error('Failed to open file', err);
    }
  }, []);

  const handleOpenReview = useCallback((path: string) => {
    useLayoutStore.getState().setRightPanelOpen(true);
    window.dispatchEvent(new CustomEvent('ai-assistant:focus-review', { detail: { focusPath: path } }));
  }, []);

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path).catch(() => {});
  }, []);

  const handleOpenInSystemExplorer = useCallback((path: string) => {
    tauriFsService.openInSystemExplorer(path).catch(() => {});
  }, []);

  // ── Delete with confirmation ────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);

  const handleDeleteRequest = useCallback((path: string) => {
    const name = path.split('/').pop() ?? path;
    setDeleteTarget({ path, name });
  }, []);

  const deleteTargetNode = deleteTarget
    ? (function findNode(nodes: typeof tree, path: string): typeof tree[0] | null {
        for (const node of nodes) {
          if (node.path === path) return node;
          if (node.children) {
            const found = findNode(node.children, path);
            if (found) return found;
          }
        }
        return null;
      })(tree, deleteTarget.path)
    : null;
  const isDraftDeleteTarget =
    deleteTargetNode?.virtualSource === 'draft-file' ||
    deleteTargetNode?.virtualSource === 'draft-dir';

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteExplorerNode(deleteTarget.path);
    setDeleteTarget(null);
  }, [deleteTarget]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <FileTreeToolbar
        hasRoot={!!rootPath}
        onOpenFolder={handleOpenFolder}
        onRefresh={handleRefresh}
        onCollapseAll={handleCollapseAll}
        onNewFile={handleNewFile}
        onNewFolder={handleNewFolder}
      />

      {error && (
        <div className="mx-2 mb-1 rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="px-3 py-2 text-xs text-muted-foreground">正在加载...</div>
      )}

      <FileTreeView
        onOpenFile={handleOpenFile}
        onOpenReview={handleOpenReview}
        onCopyPath={handleCopyPath}
        onOpenInSystemExplorer={handleOpenInSystemExplorer}
        onDeleteRequest={handleDeleteRequest}
        pendingNewAtRoot={pendingNewKind}
        pendingNewParent={pendingNewParent}
        onPendingNewAtRootDone={() => {
          setPendingNewKind(null);
          setPendingNewParent(null);
        }}
        clipboardHasPaste={true}
        onPasteToDir={handlePasteToDir}
        onCopyFile={handleCopyFile}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isDraftDeleteTarget ? '放弃草稿' : '确认删除'}</AlertDialogTitle>
            <AlertDialogDescription>
              {isDraftDeleteTarget ? (
                <>
                  确定要放弃{' '}
                  <span className="font-medium text-foreground">
                    "{deleteTarget?.name}"
                  </span>{' '}
                  的未落盘草稿吗？此操作会移除对应的 Explorer 虚拟节点。
                </>
              ) : (
                <>
                  确定要删除{' '}
                  <span className="font-medium text-foreground">
                    "{deleteTarget?.name}"
                  </span>{' '}
                  吗？此操作无法撤销。
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDraftDeleteTarget ? '放弃草稿' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 从剪贴板文本新建文件 */}
      <AlertDialog
        open={!!textPasteDialog}
        onOpenChange={(open) => { if (!open) setTextPasteDialog(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>从剪贴板新建文件</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-3 text-sm text-muted-foreground">
                  剪贴板中包含文本内容，将在{' '}
                  <span className="font-mono text-xs text-foreground">
                    {textPasteDialog?.destDir.split('/').pop() ?? '目录'}
                  </span>{' '}
                  中新建文件并写入内容。
                </p>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={textPasteDialog?.fileName ?? ''}
                  onChange={(e) =>
                    setTextPasteDialog((prev) =>
                      prev ? { ...prev, fileName: e.target.value } : null,
                    )
                  }
                  onKeyDown={(e) => { e.stopPropagation(); }}
                  autoFocus
                  spellCheck={false}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!textPasteDialog) return;
                const { destDir, text, fileName } = textPasteDialog;
                const name = fileName.trim() || 'clipboard.txt';
                const wsId = useWorkspaceStore.getState().workspaceId ?? '';
                const path = `${destDir}/${name}`;
                try {
                  await tauriFsService.writeTextFile(wsId, path, text);
                  await refreshExplorer(destDir);
                  const content = await tauriFsService.readTextFile(wsId, path);
                  useFileBufferStore.getState().openFile(path, content);
                } catch (err) {
                  console.error('[paste-text] create file failed', err);
                }
                setTextPasteDialog(null);
              }}
            >
              新建
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
