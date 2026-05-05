/**
 * ExplorerSidebarView: the main Explorer left-panel view.
 */

import { useCallback, useState } from 'react';
import { useExplorerStore } from '../store/explorer-store';
import { FileTreeToolbar } from '../components/FileTreeToolbar';
import { FileTreeView } from './FileTreeView';
import { useExplorerProjectedTree } from '../hooks/useExplorerProjectedTree';
import type { FileNode } from '../store/types';
import { refreshExplorer, setExplorerRootPath, deleteExplorerNode } from '../explorer-controller';
import { tauriFsService } from '../tauri-fs-service';
import { useFileBufferStore } from '../../../store/file-buffer-store';
import { useWorkspaceStore } from '../../../store/workspace-store';
import { useLayoutStore } from '@byteforce/shell';
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
    </div>
  );
}
