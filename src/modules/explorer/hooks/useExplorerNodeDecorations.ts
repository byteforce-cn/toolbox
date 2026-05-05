import { useExplorerGitStatusStore } from '../store/explorer-git-status-store';
import { useFileBufferStore } from '../../../store/file-buffer-store';
import { useApprovalStore } from '../../../store/approval-store';
import {
  isChangesetAwaitingReview,
  isChangesetFileAwaitingReview,
  useChangesetStore,
} from '../../../store/changeset-store';
import type { ExplorerGitDecorationCounts, ExplorerDecorationBadge } from '../utils/git-decoration';

export interface ExplorerNodeDecorations extends ExplorerGitDecorationCounts {
  dirtyCount: number;
  aiDiffCount: number;
  reviewCount: number;
}

/**
 * Phase 2：接入 useExplorerGitStatusStore + useFileBufferStore。
 * Phase 3：接入 useChangesetStore + useApprovalStore。
 */
export function useExplorerNodeDecorations(
  path: string,
  kind: 'file' | 'dir',
): ExplorerNodeDecorations {
  const statuses = useExplorerGitStatusStore((s) => s.statuses);
  const buffers = useFileBufferStore((s) => s.buffers);
  const approvalRequests = useApprovalStore((s) => s.approvalRequests);
  const changesets = useChangesetStore((s) => s.changesets);

  const zero: ExplorerNodeDecorations = {
    dirtyCount: 0,
    aiDiffCount: 0,
    reviewCount: 0,
    gitModifiedCount: 0,
    gitUntrackedCount: 0,
    gitDeletedCount: 0,
    gitRenamedCount: 0,
    gitConflictedCount: 0,
    gitStagedCount: 0,
    gitUnstagedCount: 0,
  };

  if (kind === 'file') {
    const entry = statuses[path];
    const buffer = buffers[path];
    const reviewCount = changesets
      .filter((changeset) => isChangesetAwaitingReview(changeset.status))
      .flatMap((changeset) => changeset.files)
      .filter((file) => file.filePath === path && isChangesetFileAwaitingReview(file))
      .length;
    const aiDiffCount = approvalRequests.filter((request) => request.filePath === path).length;

    return {
      ...zero,
      dirtyCount: buffer?.isModified ? 1 : 0,
      aiDiffCount,
      reviewCount,
      gitModifiedCount: entry?.gitStatus === 'modified' ? 1 : 0,
      gitUntrackedCount: entry?.gitStatus === 'untracked' ? 1 : 0,
      gitDeletedCount: entry?.gitStatus === 'deleted' ? 1 : 0,
      gitRenamedCount: entry?.gitStatus === 'renamed' ? 1 : 0,
      gitConflictedCount: entry?.gitStatus === 'conflicted' ? 1 : 0,
      gitStagedCount: entry?.hasStagedChanges ? 1 : 0,
      gitUnstagedCount: entry?.hasUnstagedChanges ? 1 : 0,
    };
  }

  // dir：汇总所有前缀匹配的子项
  const counts = { ...zero };
  const dirPrefix = `${path}/`;
  for (const [filePath, entry] of Object.entries(statuses)) {
    if (!filePath.startsWith(dirPrefix)) continue;
    counts.gitModifiedCount += entry.gitStatus === 'modified' ? 1 : 0;
    counts.gitUntrackedCount += entry.gitStatus === 'untracked' ? 1 : 0;
    counts.gitDeletedCount += entry.gitStatus === 'deleted' ? 1 : 0;
    counts.gitRenamedCount += entry.gitStatus === 'renamed' ? 1 : 0;
    counts.gitConflictedCount += entry.gitStatus === 'conflicted' ? 1 : 0;
    counts.gitStagedCount += entry.hasStagedChanges ? 1 : 0;
    counts.gitUnstagedCount += entry.hasUnstagedChanges ? 1 : 0;
  }
  for (const [filePath, buf] of Object.entries(buffers)) {
    if (!filePath.startsWith(dirPrefix)) continue;
    counts.dirtyCount += buf.isModified ? 1 : 0;
  }
  for (const request of approvalRequests) {
    if (!request.filePath.startsWith(dirPrefix)) continue;
    counts.aiDiffCount += 1;
  }
  for (const changeset of changesets) {
    if (!isChangesetAwaitingReview(changeset.status)) continue;
    for (const file of changeset.files) {
      if (!isChangesetFileAwaitingReview(file) || !file.filePath.startsWith(dirPrefix)) continue;
      counts.reviewCount += 1;
    }
  }
  return counts;
}

export type { ExplorerDecorationBadge };
