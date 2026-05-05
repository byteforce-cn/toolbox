import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export type ExplorerGitStatus = 'modified' | 'untracked' | 'deleted' | 'renamed' | 'conflicted';

/** Rust 侧 workspace_git_status 返回的原始结构 */
interface RawGitFileStatus {
  xy: string;
  staged: boolean;
  unstaged: boolean;
}

export interface ExplorerGitStatusEntry {
  gitStatus: ExplorerGitStatus;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
}

/** 将 git porcelain 的 XY 状态码转为语义枚举 */
function xyToStatus(xy: string): ExplorerGitStatus {
  const x = xy[0] ?? ' ';
  const y = xy[1] ?? ' ';
  if (x === '?' && y === '?') return 'untracked';
  if (x === 'R' || y === 'R') return 'renamed';
  if (x === 'D' || y === 'D') return 'deleted';
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D'))
    return 'conflicted';
  return 'modified';
}

function isSameOrDescendantPath(path: string, candidate: string): boolean {
  return path === candidate || path.startsWith(`${candidate}/`);
}

function shouldDoFullRefresh(rootPath: string, targetPaths?: string[]): boolean {
  return !targetPaths || targetPaths.length === 0 || targetPaths.some((t) => t === rootPath);
}

interface ExplorerGitStatusState {
  rootPath: string | null;
  statuses: Record<string, ExplorerGitStatusEntry>;
  refresh(rootPath: string | null, targetPaths?: string[]): Promise<void>;
  clear(): void;
}

export const useExplorerGitStatusStore = create<ExplorerGitStatusState>()((set) => ({
  rootPath: null,
  statuses: {},

  async refresh(rootPath, targetPaths) {
    if (!rootPath) {
      set({ rootPath: null, statuses: {} });
      return;
    }

    try {
      const raw = await invoke<Record<string, RawGitFileStatus>>('workspace_git_status', {
        path: rootPath,
        targetPaths: targetPaths ?? null,
      });

      const nextStatuses: Record<string, ExplorerGitStatusEntry> = {};
      for (const [filePath, entry] of Object.entries(raw)) {
        nextStatuses[filePath] = {
          gitStatus: xyToStatus(entry.xy),
          hasStagedChanges: entry.staged,
          hasUnstagedChanges: entry.unstaged,
        };
      }

      if (shouldDoFullRefresh(rootPath, targetPaths)) {
        set({ rootPath, statuses: nextStatuses });
        return;
      }

      set((state) => {
        const statuses = { ...state.statuses };
        for (const filePath of Object.keys(statuses)) {
          if (targetPaths?.some((t) => isSameOrDescendantPath(filePath, t))) {
            delete statuses[filePath];
          }
        }
        for (const [filePath, entry] of Object.entries(nextStatuses)) {
          statuses[filePath] = entry;
        }
        return { rootPath, statuses };
      });
    } catch {
      // git 不可用或不在 git 仓库中时静默失败
    }
  },

  clear() {
    set({ rootPath: null, statuses: {} });
  },
}));
