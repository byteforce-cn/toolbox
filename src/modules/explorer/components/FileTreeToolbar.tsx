/**
 * FileTreeToolbar: top toolbar for the Explorer sidebar.
 */

import { FolderOpen, RefreshCw, ChevronsUpDown, FilePlus, FolderPlus } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface ToolbarButtonProps {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}

function ToolbarButton({ icon, title, onClick, disabled }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        'disabled:opacity-40 disabled:cursor-not-allowed',
      )}
    >
      {icon}
    </button>
  );
}

interface FileTreeToolbarProps {
  hasRoot: boolean;
  onOpenFolder: () => void;
  onRefresh: () => void;
  onCollapseAll: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
}

export function FileTreeToolbar({
  hasRoot,
  onOpenFolder,
  onRefresh,
  onCollapseAll,
  onNewFile,
  onNewFolder,
}: FileTreeToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-1 px-2 py-1 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap truncate shrink min-w-0">
        文件资源管理器
      </span>
      <div className="flex items-center gap-0.5 shrink-0">
        <ToolbarButton
          icon={<FolderOpen className="h-3.5 w-3.5" />}
          title="打开文件夹"
          onClick={onOpenFolder}
        />
        <ToolbarButton
          icon={<FilePlus className="h-3.5 w-3.5" />}
          title="新建文件"
          onClick={onNewFile}
          disabled={!hasRoot}
        />
        <ToolbarButton
          icon={<FolderPlus className="h-3.5 w-3.5" />}
          title="新建文件夹"
          onClick={onNewFolder}
          disabled={!hasRoot}
        />
        <ToolbarButton
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          title="刷新"
          onClick={onRefresh}
          disabled={!hasRoot}
        />
        <ToolbarButton
          icon={<ChevronsUpDown className="h-3.5 w-3.5" />}
          title="折叠全部"
          onClick={onCollapseAll}
          disabled={!hasRoot}
        />
      </div>
    </div>
  );
}
