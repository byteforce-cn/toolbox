import {
  isChangesetAwaitingReview,
  isChangesetFileAwaitingReview,
  type Changeset,
  type ChangesetFile,
  type DiffHunk,
} from '../../../../store/changeset-store';

export type HunkDecision = DiffHunk['status'];
export type HunkDecisionMap = Record<string, HunkDecision>;

export interface HunkDecisionSummary {
  total: number;
  accepted: number;
  rejected: number;
  pending: number;
}

export interface ProposalConflictSummary {
  changesetId: string;
  summary?: string;
  status: Changeset['status'];
}

export function getEffectiveHunkDecision(
  hunk: DiffHunk,
  decisions?: HunkDecisionMap,
): HunkDecision {
  return decisions?.[hunk.id] ?? hunk.status ?? 'pending';
}

export function summarizeHunkDecisions(
  file: ChangesetFile | null | undefined,
  decisions?: HunkDecisionMap,
): HunkDecisionSummary {
  return (file?.hunks ?? []).reduce<HunkDecisionSummary>((summary, hunk) => {
    summary.total += 1;
    summary[getEffectiveHunkDecision(hunk, decisions)] += 1;
    return summary;
  }, {
    total: 0,
    accepted: 0,
    rejected: 0,
    pending: 0,
  });
}

export function buildAcceptedHunkIds(
  file: ChangesetFile | null | undefined,
  decisions?: HunkDecisionMap,
): string[] {
  return (file?.hunks ?? [])
    .filter((hunk) => getEffectiveHunkDecision(hunk, decisions) === 'accepted')
    .map((hunk) => hunk.id);
}

export function findConflictingChangesets(
  changesets: Changeset[],
  currentChangesetId: string,
  filePath: string,
): ProposalConflictSummary[] {
  return changesets
    .filter((changeset) => (
      changeset.id !== currentChangesetId
      && isChangesetAwaitingReview(changeset.status)
      && changeset.files.some((file) => file.filePath === filePath && isChangesetFileAwaitingReview(file))
    ))
    .map((changeset) => ({
      changesetId: changeset.id,
      summary: changeset.summary,
      status: changeset.status,
    }));
}