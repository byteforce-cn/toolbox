/**
 * FileTreeView: recursive rendering of the file tree.
 */

import { useState, useCallback, useEffect } from 'react';
import React from 'react';
import { useExplorerStore } from '../store/explorer-store';
import { FileTreeNode } from '../components/FileTreeNode';
import { InlineRenameInput } from '../components/InlineRenameInput';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../../components/ui/context-menu';
import type { FileNode } from '../store/types';
import { useExplorerProjectedTree } from '../hooks/useExplorerProjectedTree';
import {
  createExplorerFile,
  createExplorerDir,
  renameExplorerNode,
  moveExplorerNode,
  toggleExplorerExpand,
} from '../explorer-controller';

interface NewNodeInputProps {
  parentPath: string;
  kind: 'file' | 'dir';
  depth: number;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

function NewNodeInput({ parentPath: _parentPath, kind, depth, onConfirm, onCancel }: NewNodeInputProps) {
  return (
    <div
      style={{ paddingLeft: `${depth * 12 + 28}px` }}
      className="flex h-6 items-center pr-2"
    >
      <InlineRenameInput
        initialName={kind === 'file' ? 'newfile.txt' : 'newfolder'}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </div>
  );
}

interface PendingNew {
  parentPath: string;
  kind: 'file' | 'dir';
  depth: number;
}

interface FileTreeViewProps {
  onOpenFile: (node: FileNode) => void;
  onOpenReview: (path: string) => void;
  onCopyPath: (path: string) => void;
  onOpenInSystemExplorer: (path: string) => void;
  onDeleteRequest: (path: string) => void;
  pendingNewAtRoot?: 'file' | 'dir' | null;
  pendingNewParent?: string | null;
  onPendingNewAtRootDone?: () => void;
  /** 剪贴板中是否有可粘贴的外部文件（从 VSCode/Finder 复制） */
  clipboardHasPaste?: boolean;
  /** 粘贴外部文件到指定目录 */
  onPasteToDir?: (destDirAbsolute: string) => void;
  /** 右键菜单打开时主动刷新剪贴板状态 */
  onCheckClipboard?: () => void;
  /** 将文件/目录复制到系统剪贴板 */
  onCopyFile?: (path: string) => void;
}

export function FileTreeView({
  onOpenFile,
  onOpenReview,
  onCopyPath,
  onOpenInSystemExplorer,
  onDeleteRequest,
  pendingNewAtRoot,
  pendingNewParent,
  onPendingNewAtRootDone,
  clipboardHasPaste = false,
  onPasteToDir,
  onCheckClipboard,
  onCopyFile,
}: FileTreeViewProps) {
  const expandedPaths = useExplorerStore((s) => s.expandedPaths);
  const selectedPath = useExplorerStore((s) => s.selectedPath);
  const selectNode = useExplorerStore((s) => s.selectNode);
  const rootPath = useExplorerStore((s) => s.rootPath);
  const tree = useExplorerProjectedTree();

  const [pendingNew, setPendingNew] = useState<PendingNew | null>(null);

  useEffect(() => {
    if (pendingNewAtRoot && rootPath) {
      const targetDir = pendingNewParent ?? rootPath;
      const depth =
        targetDir === rootPath
          ? 0
          : targetDir.split('/').length - (rootPath.split('/').length ?? 0);
      setPendingNew({ parentPath: targetDir, kind: pendingNewAtRoot, depth });
      if (targetDir !== rootPath && !expandedPaths.has(targetDir)) {
        toggleExplorerExpand(targetDir);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNewAtRoot, pendingNewParent]);

  const handleNewFile = useCallback(
    (parentPath: string) => {
      const depth =
        parentPath === rootPath
          ? 0
          : parentPath.split('/').length - (rootPath?.split('/').length ?? 0);
      setPendingNew({ parentPath, kind: 'file', depth });
    },
    [rootPath],
  );

  const handleNewFolder = useCallback(
    (parentPath: string) => {
      const depth =
        parentPath === rootPath
          ? 0
          : parentPath.split('/').length - (rootPath?.split('/').length ?? 0);
      setPendingNew({ parentPath, kind: 'dir', depth });
    },
    [rootPath],
  );

  const handleNewConfirm = useCallback(
    async (name: string) => {
      if (!pendingNew) return;
      if (pendingNew.kind === 'file') {
        await createExplorerFile(pendingNew.parentPath, name);
      } else {
        await createExplorerDir(pendingNew.parentPath, name);
      }
      setPendingNew(null);
      onPendingNewAtRootDone?.();
    },
    [pendingNew, onPendingNewAtRootDone],
  );

  const handleRename = useCallback(async (oldPath: string, newName: string) => {
    const parent = oldPath.split('/').slice(0, -1).join('/');
    const newPath = `${parent}/${newName}`;
    await renameExplorerNode(oldPath, newPath);
  }, []);

  const handleMove = useCallback(async (sourcePath: string, targetDirPath: string) => {
    await moveExplorerNode(sourcePath, targetDirPath);
  }, []);

  const renderNodes = (nodes: FileNode[], depth: number): React.ReactNode[] => {
    const items: React.ReactNode[] = [];

    for (const node of nodes) {
      const isExpanded = expandedPaths.has(node.path);
      const isSelected = selectedPath === node.path;

      items.push(
        <FileTreeNode
          key={node.path}
          node={node}
          depth={depth}
          isExpanded={isExpanded}
          isSelected={isSelected}
          rootPath={rootPath}
          onToggle={toggleExplorerExpand}
          onSelect={selectNode}
          onOpen={onOpenFile}
          onOpenReview={onOpenReview}
          onRename={handleRename}
          onDelete={onDeleteRequest}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onCopyPath={onCopyPath}
          onOpenInSystemExplorer={onOpenInSystemExplorer}
          onMove={handleMove}
          clipboardHasPaste={clipboardHasPaste}
          onPasteToDir={onPasteToDir}
          onCheckClipboard={onCheckClipboard}
          onCopyFile={onCopyFile}
        />,
      );

      if (pendingNew && pendingNew.parentPath === node.path) {
        items.push(
          <NewNodeInput
            key={`new:${node.path}`}
            parentPath={pendingNew.parentPath}
            kind={pendingNew.kind}
            depth={depth + 1}
            onConfirm={handleNewConfirm}
            onCancel={() => setPendingNew(null)}
          />,
        );
      }

      if (node.kind === 'dir' && isExpanded && node.children) {
        items.push(...renderNodes(node.children, depth + 1));
      }
    }

    return items;
  };

  if (tree.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
        <p>点击"打开文件夹"选择项目目录</p>
      </div>
    );
  }

  return (
    <ContextMenu onOpenChange={(open) => { if (open) onCheckClipboard?.(); }}>
      <ContextMenuTrigger asChild>
        <div role="tree" className="flex-1 overflow-auto py-0.5">
          {pendingNew && pendingNew.parentPath === rootPath && (
            <NewNodeInput
              key="new:root"
              parentPath={pendingNew.parentPath}
              kind={pendingNew.kind}
              depth={0}
              onConfirm={handleNewConfirm}
              onCancel={() => {
                setPendingNew(null);
                onPendingNewAtRootDone?.();
              }}
            />
          )}
          {renderNodes(tree, 0)}
        </div>
      </ContextMenuTrigger>
      {rootPath && (
        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={() => handleNewFile(rootPath)}>新建文件</ContextMenuItem>
          <ContextMenuItem onClick={() => handleNewFolder(rootPath)}>新建文件夹</ContextMenuItem>
          {clipboardHasPaste && onPasteToDir && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onPasteToDir(rootPath)}>粘贴</ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}
