import { create } from 'zustand';
import type { ProposalSessionPreview } from '../modules/ai-assistant/services/types';

export type ChangesetStatus = 'pending' | 'reviewing' | 'applied' | 'rejected';

export interface DiffHunk {
  id: string;
  content: string;
  status: 'pending' | 'accepted' | 'rejected';
  originalStart?: number;
  originalLength?: number;
  modifiedStart?: number;
  modifiedLength?: number;
}

export interface ChangesetFile {
  proposalRecordId?: string;
  filePath: string;
  oldContent: string;
  newContent: string;
  contentLoaded?: boolean;
  toolName?: string;
  summary?: string;
  changeType?: 'create' | 'modify' | 'delete';
  status?: 'pending' | 'accepted' | 'rejected' | 'reviewing';
  /** Phase 3 proposal 字段 */
  reviewSource?: 'proposal' | 'legacy';
  proposalSessionId?: string;
  aiSessionId?: string;
  hunks?: DiffHunk[];
}

export interface Changeset {
  id: string;
  /** proposal session id（若来源为 proposal） */
  proposalSessionId?: string;
  aiSessionId?: string;
  status: ChangesetStatus;
  summary?: string;
  files: ChangesetFile[];
}

interface ChangesetState {
  changesets: Changeset[];
  addProposalSession(session: ProposalSessionPreview, opts?: { includeContent?: boolean }): void;
  reconcilePendingProposalSessions(pendingProposalSessionIds: string[]): void;
  hydrateProposalRecordContent(
    proposalSessionId: string,
    proposalRecordId: string,
    oldContent: string,
    newContent: string,
  ): void;
  updateChangesetStatus(id: string, status: ChangesetStatus): void;
  clearChangesets(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function readDiffLineNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function mapProposalStatusToChangesetStatus(status: ProposalSessionPreview['status']): ChangesetStatus {
  switch (status) {
    case 'applied':
      return 'applied';
    case 'rejected':
    case 'aborted':
    case 'superseded':
      return 'rejected';
    case 'partially_applied':
      return 'reviewing';
    case 'open':
    default:
      return 'pending';
  }
}

function mapProposalRecordStatus(status: ProposalSessionPreview['records'][number]['status']): ChangesetFile['status'] {
  switch (status) {
    case 'applied':
      return 'accepted';
    case 'partially_applied':
      return 'reviewing';
    case 'rejected':
    case 'failed':
      return 'rejected';
    case 'pending':
    default:
      return 'pending';
  }
}

function toDiffHunks(recordId: string, hunks: unknown[]): DiffHunk[] {
  return hunks.map((hunk, index) => {
    if (typeof hunk === 'string') {
      return {
        id: `${recordId}:${index}`,
        content: hunk,
        status: 'pending',
      };
    }

    if (isRecord(hunk)) {
      const content = [
        typeof hunk.content === 'string' ? hunk.content : null,
        typeof hunk.header === 'string' ? hunk.header : null,
        typeof hunk.diff === 'string' ? hunk.diff : null,
        typeof hunk.patch === 'string' ? hunk.patch : null,
      ].filter((value): value is string => Boolean(value)).join('\n');

      return {
        id: typeof hunk.id === 'string' ? hunk.id : `${recordId}:${index}`,
        content: content || safeStringify(hunk),
        status:
          hunk.status === 'accepted' || hunk.status === 'rejected'
            ? hunk.status
            : 'pending',
        originalStart: readDiffLineNumber(hunk.originalStart),
        originalLength: readDiffLineNumber(hunk.originalLength),
        modifiedStart: readDiffLineNumber(hunk.modifiedStart),
        modifiedLength: readDiffLineNumber(hunk.modifiedLength),
      };
    }

    return {
      id: `${recordId}:${index}`,
      content: safeStringify(hunk),
      status: 'pending',
    };
  });
}

export function isChangesetAwaitingReview(status: ChangesetStatus): boolean {
  return status === 'pending' || status === 'reviewing';
}

export function isChangesetFileAwaitingReview(file: ChangesetFile): boolean {
  return (file.status ?? 'pending') === 'pending';
}

export function getPendingChangesetReviewFileCount(changeset: Changeset): number {
  if (!isChangesetAwaitingReview(changeset.status)) return 0;
  return changeset.files.filter(isChangesetFileAwaitingReview).length;
}

export function hasPendingChangesetReviewItems(changeset: Changeset): boolean {
  return getPendingChangesetReviewFileCount(changeset) > 0;
}

export const useChangesetStore = create<ChangesetState>()((set) => ({
  changesets: [],

  addProposalSession(session, _opts) {
    set((state) => {
      const existing = state.changesets.findIndex((c) => c.proposalSessionId === session.id);
      const existingChangeset = existing >= 0 ? state.changesets[existing] : undefined;
      const changeset: Changeset = {
        id: session.id,
        proposalSessionId: session.id,
        aiSessionId: session.aiSessionId,
        status: mapProposalStatusToChangesetStatus(session.status),
        summary: session.summary,
        files: session.records.map((r) => {
          const existingFile = existingChangeset?.files.find((file) => file.proposalRecordId === r.id);
          return {
            proposalRecordId: r.id,
            filePath: r.filePath,
            oldContent: existingFile?.contentLoaded ? existingFile.oldContent : '',
            newContent: existingFile?.contentLoaded ? existingFile.newContent : '',
            contentLoaded: existingFile?.contentLoaded ?? false,
            toolName: r.toolName,
            summary: r.summary,
            changeType: r.operationType as ChangesetFile['changeType'],
            status: mapProposalRecordStatus(r.status),
            reviewSource: 'proposal' as const,
            proposalSessionId: session.id,
            aiSessionId: session.aiSessionId,
            hunks: toDiffHunks(r.id, r.hunks),
          };
        }),
      };
      if (existing >= 0) {
        const next = [...state.changesets];
        next[existing] = changeset;
        return { changesets: next };
      }
      return { changesets: [changeset, ...state.changesets] };
    });
  },

  reconcilePendingProposalSessions(pendingProposalSessionIds) {
    const pendingIds = new Set(pendingProposalSessionIds);
    set((state) => ({
      changesets: state.changesets.filter((changeset) => {
        if (!changeset.proposalSessionId) return true;
        if (!isChangesetAwaitingReview(changeset.status)) return true;
        return pendingIds.has(changeset.proposalSessionId) && hasPendingChangesetReviewItems(changeset);
      }),
    }));
  },

  hydrateProposalRecordContent(proposalSessionId, proposalRecordId, oldContent, newContent) {
    set((state) => ({
      changesets: state.changesets.map((changeset) => {
        if (changeset.id !== proposalSessionId) {
          return changeset;
        }

        return {
          ...changeset,
          files: changeset.files.map((file) => (
            file.proposalRecordId === proposalRecordId
              ? {
                  ...file,
                  oldContent,
                  newContent,
                  contentLoaded: true,
                }
              : file
          )),
        };
      }),
    }));
  },

  updateChangesetStatus(id, status) {
    set((state) => ({
      changesets: state.changesets.map((c) => c.id === id ? { ...c, status } : c),
    }));
  },

  clearChangesets() {
    set({ changesets: [] });
  },
}));
