/**
 * FileTreeNode: renders a single file or directory node in the Explorer tree.
 */

import { ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { cn } from '../../../lib/utils';
import { FileIcon } from './FileIcon';
import { InlineRenameInput } from './InlineRenameInput';
import { dirname } from '../utils/file-utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../../components/ui/context-menu';
import type { FileNode } from '../store/types';
import { useExplorerNodeDecorations } from '../hooks/useExplorerNodeDecorations';
import { buildGitDecorationBadges } from '../utils/git-decoration';

/**
 * Pointer-based drag state.
 *
 * Using HTML5 drag-and-drop API (`draggable` attribute) in Tauri/WKWebView on
 * macOS triggers a *native* OS drag session.  If the drag ends outside the
 * WebView window the `dragend` event may never fire, which freezes all mouse
 * events system-wide until the stuck session is cleared.  We avoid this by
 * using Pointer Events + setPointerCapture instead, which stays entirely
 * within the WebView and never starts a native drag session.
 */
interface PointerDragState {
  sourcePath: string;
  sourceName: string;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  preview: HTMLDivElement | null;
  currentTargetEl: HTMLElement | null;
}
let _pd: PointerDragState | null = null;
const DRAG_THRESHOLD = 4;

function _createPreview(label: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;pointer-events:none;z-index:9999;padding:1px 8px;' +
    'background:hsl(var(--background));border:1px solid hsl(var(--border));' +
    'border-radius:4px;font-size:12px;color:hsl(var(--foreground));' +
    'white-space:nowrap;opacity:0.9;box-shadow:0 2px 8px rgba(0,0,0,.2);';
  el.textContent = label;
  document.body.appendChild(el);
  return el;
}

function _setDropHighlight(el: HTMLElement | null) {
  if (_pd?.currentTargetEl && _pd.currentTargetEl !== el) {
    _pd.currentTargetEl.style.outline = '';
    _pd.currentTargetEl.style.backgroundColor = '';
  }
  if (el) {
    el.style.outline = '1px solid hsl(var(--primary) / 0.5)';
    el.style.outlineOffset = '-1px';
    el.style.backgroundColor = 'hsl(var(--primary) / 0.08)';
  }
  if (_pd) _pd.currentTargetEl = el;
}

function _findDropTarget(x: number, y: number): HTMLElement | null {
  const preview = _pd?.preview;
  if (preview) preview.style.display = 'none';
  let el = document.elementFromPoint(x, y) as HTMLElement | null;
  while (el && !el.dataset.explorerDir) el = el.parentElement;
  if (preview) preview.style.display = '';
  return el;
}

function _endDrag(onMove?: (src: string, tgt: string) => void, x?: number, y?: number) {
  if (!_pd) return;
  _setDropHighlight(null);
  if (_pd.preview) document.body.removeChild(_pd.preview);
  if (_pd.active && onMove && x !== undefined && y !== undefined) {
    const targetEl = _findDropTarget(x, y);
    const targetPath = targetEl?.dataset.explorerDir;
    if (targetPath && targetPath !== _pd.sourcePath) {
      onMove(_pd.sourcePath, targetPath);
    }
  }
  _pd = null;
}

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  rootPath: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onOpen: (node: FileNode) => void;
  onOpenReview: (path: string) => void;
  onRename: (oldPath: string, newName: string) => void;
  onDelete: (path: string) => void;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onCopyPath: (path: string) => void;
  onOpenInSystemExplorer: (path: string) => void;
  onMove: (sourcePath: string, targetDirPath: string) => void;
  /** 将文件/目录复制到系统剪贴板（可粘贴到 Finder/VSCode） */
  onCopyFile?: (path: string) => void;
  /** 剪贴板中是否有可粘贴的外部文件 */
  clipboardHasPaste?: boolean;
  /** 粘贴外部文件到指定目录 */
  onPasteToDir?: (destDirAbsolute: string) => void;
  /** 右键菜单打开时主动刷新剪贴板状态 */
  onCheckClipboard?: () => void;
}

export function FileTreeNode({
  node,
  depth,
  isExpanded,
  isSelected,
  rootPath,
  onToggle,
  onSelect,
  onOpen,
  onOpenReview,
  onRename,
  onDelete,
  onNewFile,
  onNewFolder,
  onCopyPath,
  onOpenInSystemExplorer,
  onMove,
  onCopyFile,
  clipboardHasPaste = false,
  onPasteToDir,
  onCheckClipboard,
}: FileTreeNodeProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const decorations = useExplorerNodeDecorations(node.path, node.kind);
  const isVirtualNode = Boolean(node.virtualSource);
  const isDraftVirtualNode =
    node.virtualSource === 'draft-file' || node.virtualSource === 'draft-dir';
  const canOpenReview =
    node.virtualSource === 'review-file'
    || node.virtualSource === 'review-dir'
    || decorations.reviewCount > 0;

  const handleClick = useCallback(() => {
    onSelect(node.path);
    if (node.kind === 'dir') {
      onToggle(node.path);
      return;
    }

    if (node.virtualSource === 'review-file') {
      onOpenReview(node.path);
      return;
    }

    onOpen(node);
  }, [node, onOpen, onOpenReview, onSelect, onToggle]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      } else if (e.key === 'F2') {
        if (!isVirtualNode) setIsRenaming(true);
      } else if (e.key === 'Delete' && (!isVirtualNode || isDraftVirtualNode)) {
        onDelete(node.path);
      }
    },
    [handleClick, isDraftVirtualNode, isVirtualNode, onDelete, node.path],
  );

  const handleRenameConfirm = (newName: string) => {
    setIsRenaming(false);
    onRename(node.path, newName);
  };

  // --- Pointer-based drag (avoids native macOS drag session) ----------------
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isVirtualNode || e.button !== 0) return;
      _pd = {
        sourcePath: node.path,
        sourceName: node.name,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        preview: null,
        currentTargetEl: null,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [isVirtualNode, node.path, node.name],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!_pd || _pd.sourcePath !== node.path) return;
      const dx = e.clientX - _pd.startX;
      const dy = e.clientY - _pd.startY;
      if (!_pd.active) {
        if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
        _pd.active = true;
        _pd.preview = _createPreview(_pd.sourceName);
      }
      const p = _pd.preview!;
      p.style.left = `${e.clientX + 14}px`;
      p.style.top = `${e.clientY - 10}px`;
      const targetEl = _findDropTarget(e.clientX, e.clientY);
      const targetPath = targetEl?.dataset.explorerDir;
      _setDropHighlight(
        targetPath && targetPath !== _pd.sourcePath ? targetEl : null,
      );
    },
    [node.path],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!_pd || _pd.sourcePath !== node.path) return;
      _endDrag(onMove, e.clientX, e.clientY);
    },
    [node.path, onMove],
  );

  const handlePointerCancel = useCallback(() => {
    if (!_pd || _pd.sourcePath !== node.path) return;
    _endDrag();
  }, [node.path]);
  // --------------------------------------------------------------------------

  const indentStyle = { paddingLeft: `${depth * 12 + 4}px` };

  const gitDecorationBadges = buildGitDecorationBadges({
    gitModifiedCount: decorations.gitModifiedCount,
    gitUntrackedCount: decorations.gitUntrackedCount,
    gitDeletedCount: decorations.gitDeletedCount,
    gitRenamedCount: decorations.gitRenamedCount,
    gitConflictedCount: decorations.gitConflictedCount,
    gitStagedCount: decorations.gitStagedCount,
    gitUnstagedCount: decorations.gitUnstagedCount,
  });

  const virtualBadge = isVirtualNode
    ? node.virtualSource === 'draft-file'
      ? {
          key: 'virtual-node',
          label: '新',
          title: '本地草稿新文件（尚未落盘）',
          className:
            'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        }
      : node.virtualSource === 'draft-dir'
        ? {
            key: 'virtual-node',
            label: '新',
            title: '本地草稿目录（由未落盘文件路径投影）',
            className:
              'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
          }
        : {
            key: 'virtual-node',
            label: '新',
            title:
              node.kind === 'dir'
                ? '待审新建目录（由未落盘文件路径投影）'
                : '待审新建文件（尚未落盘）',
            className:
              'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
          }
    : null;

  const decorationBadges = [
    virtualBadge,
    ...gitDecorationBadges,
    decorations.reviewCount > 0
      ? {
          key: 'review',
          label: decorations.reviewCount > 1 ? `审${decorations.reviewCount}` : '审',
          title:
            decorations.reviewCount > 1
              ? `${decorations.reviewCount} 个文件存在待审 AI 变更`
              : '存在待审 AI 变更',
          className:
            'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        }
      : null,
    decorations.aiDiffCount > 0
      ? {
          key: 'ai-diff',
          label: decorations.aiDiffCount > 1 ? `AI${decorations.aiDiffCount}` : 'AI',
          title:
            decorations.aiDiffCount > 1
              ? `${decorations.aiDiffCount} 个文件存在 AI diff`
              : '存在 AI diff',
          className:
            'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
        }
      : null,
    decorations.dirtyCount > 0
      ? {
          key: 'dirty',
          label: decorations.dirtyCount > 1 ? `●${decorations.dirtyCount}` : '●',
          title:
            decorations.dirtyCount > 1
              ? `${decorations.dirtyCount} 个文件有未保存修改`
              : '存在未保存修改',
          className:
            'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
        }
      : null,
  ].filter((badge): badge is NonNullable<typeof badge> => badge !== null);

  return (
    <ContextMenu onOpenChange={(open) => { if (open) onCheckClipboard?.(); }}>
      <ContextMenuTrigger asChild>
        <div
          role="treeitem"
          aria-selected={isSelected}
          aria-expanded={node.kind === 'dir' ? isExpanded : undefined}
          tabIndex={0}
          data-explorer-dir={node.kind === 'dir' ? node.path : undefined}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onPointerDown={!isVirtualNode ? handlePointerDown : undefined}
          onPointerMove={!isVirtualNode ? handlePointerMove : undefined}
          onPointerUp={!isVirtualNode ? handlePointerUp : undefined}
          onPointerCancel={!isVirtualNode ? handlePointerCancel : undefined}
          style={indentStyle}
          className={cn(
            'group flex h-6 cursor-pointer select-none items-center gap-1 rounded-sm pr-2 text-sm outline-none',
            'hover:bg-accent/50',
            isSelected && 'bg-accent text-accent-foreground',
          )}
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            {node.kind === 'dir' ? (
              node.isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : isExpanded ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )
            ) : null}
          </span>

          <FileIcon
            name={node.name}
            kind={node.kind}
            isExpanded={isExpanded}
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />

          {isRenaming ? (
            <InlineRenameInput
              initialName={node.name}
              onConfirm={handleRenameConfirm}
              onCancel={() => setIsRenaming(false)}
            />
          ) : (
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-xs',
                isVirtualNode && 'italic text-muted-foreground',
              )}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!isVirtualNode) setIsRenaming(true);
              }}
            >
              {node.name}
            </span>
          )}

          {decorationBadges.length > 0 && (
            <div className="ml-2 flex shrink-0 items-center gap-1">
              {decorationBadges.map((badge) => (
                <span
                  key={badge.key}
                  title={badge.title}
                  className={cn(
                    'rounded border px-1 py-0 text-[10px] font-medium leading-4',
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        {(!isVirtualNode || (isDraftVirtualNode && node.kind === 'dir')) && (
          <ContextMenuItem
            onClick={() =>
              onNewFile(node.kind === 'dir' ? node.path : dirname(node.path))
            }
          >
            新建文件
          </ContextMenuItem>
        )}
        {(!isVirtualNode || (isDraftVirtualNode && node.kind === 'dir')) && (
          <ContextMenuItem
            onClick={() =>
              onNewFolder(node.kind === 'dir' ? node.path : dirname(node.path))
            }
          >
            新建文件夹
          </ContextMenuItem>
        )}
        {(!isVirtualNode || (isDraftVirtualNode && node.kind === 'dir')) && (
          <ContextMenuSeparator />
        )}
        {/* 复制文件/目录到系统剪贴板 */}
        {onCopyFile && !isVirtualNode && (
          <>
            <ContextMenuItem onClick={() => onCopyFile(node.path)}>复制</ContextMenuItem>
          </>
        )}
        {/* 剪贴板有外部文件时，在目录节点显示粘贴项 */}
        {clipboardHasPaste && onPasteToDir && node.kind === 'dir' && !isVirtualNode && (
          <>
            <ContextMenuItem
              onClick={() => onPasteToDir(node.path)}
            >
              粘贴
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {canOpenReview && (
          <>
            <ContextMenuItem onClick={() => onOpenReview(node.path)}>打开待审变更</ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {!isVirtualNode && (
          <ContextMenuItem onClick={() => setIsRenaming(true)}>重命名</ContextMenuItem>
        )}
        {(!isVirtualNode || isDraftVirtualNode) && (
          <ContextMenuItem
            onClick={() => onDelete(node.path)}
            className="text-destructive focus:text-destructive"
          >
            {isDraftVirtualNode ? '放弃草稿' : '删除'}
          </ContextMenuItem>
        )}
        {(!isVirtualNode || isDraftVirtualNode) && <ContextMenuSeparator />}
        {!isVirtualNode && (
          <ContextMenuItem onClick={() => onOpenInSystemExplorer(node.path)}>
            在系统资源管理器中打开
          </ContextMenuItem>
        )}
        {!isVirtualNode && <ContextMenuSeparator />}
        <ContextMenuItem
          onClick={() => {
            if (rootPath && node.path.startsWith(rootPath + '/')) {
              onCopyPath(node.path.slice(rootPath.length + 1));
            } else {
              onCopyPath(node.path);
            }
          }}
        >
          复制相对路径
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onCopyPath(node.path)}>
          复制绝对路径
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
