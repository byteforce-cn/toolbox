import { beforeEach, describe, expect, it } from 'vitest';

import {
  getPendingChangesetReviewFileCount,
  hasPendingChangesetReviewItems,
  useChangesetStore,
} from './changeset-store';
import type { ProposalSessionPreview } from '../modules/ai-assistant/services/types';

function makePreview(overrides: Partial<ProposalSessionPreview> = {}): ProposalSessionPreview {
  return {
    id: overrides.id ?? 'proposal-session-1',
    aiSessionId: overrides.aiSessionId ?? 'session-1',
    runId: overrides.runId ?? 'run-1',
    summary: overrides.summary ?? '更新 AI review 面板',
    status: overrides.status ?? 'open',
    planSteps: overrides.planSteps ?? ['整理评审入口'],
    source: overrides.source ?? 'agent',
    createdAt: overrides.createdAt ?? '2026-05-03T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-05-03T10:01:00.000Z',
    completedAt: overrides.completedAt,
    decisionLog: overrides.decisionLog ?? [],
    records: overrides.records ?? [
      {
        id: 'record-1',
        proposalSessionId: 'proposal-session-1',
        requestId: 'req-1',
        toolName: 'apply_patch',
        filePath: '/workspace/src/example.ts',
        operationType: 'modify',
        status: 'pending',
        summary: '更新标题文案',
        hunks: [{ id: 'hunk-1', content: '@@\n-old\n+new', status: 'pending' }],
        patchOperation: null,
        lastApplyResult: null,
        createdAt: '2026-05-03T10:00:00.000Z',
        updatedAt: '2026-05-03T10:01:00.000Z',
      },
    ],
  };
}

describe('useChangesetStore.addProposalSession', () => {
  beforeEach(() => {
    useChangesetStore.setState({ changesets: [] });
  });

  it('maps proposal preview into reviewable changeset metadata', () => {
    useChangesetStore.getState().addProposalSession(makePreview());

    const [changeset] = useChangesetStore.getState().changesets;
    expect(changeset).toMatchObject({
      id: 'proposal-session-1',
      proposalSessionId: 'proposal-session-1',
      aiSessionId: 'session-1',
      status: 'pending',
      summary: '更新 AI review 面板',
    });
    expect(changeset.files[0]).toMatchObject({
      proposalRecordId: 'record-1',
      toolName: 'apply_patch',
      summary: '更新标题文案',
      status: 'pending',
      filePath: '/workspace/src/example.ts',
    });
    expect(changeset.files[0].hunks).toEqual([
      {
        id: 'hunk-1',
        content: '@@\n-old\n+new',
        status: 'pending',
      },
    ]);
  });

  it('preserves hunk line metadata for editor focus', () => {
    useChangesetStore.getState().addProposalSession(makePreview({
      records: [
        {
          ...makePreview().records[0],
          hunks: [{
            id: 'hunk-1',
            content: '@@ -12,3 +18,4 @@\n-old\n+new',
            status: 'pending',
            originalStart: 12,
            originalLength: 3,
            modifiedStart: 18,
            modifiedLength: 4,
          }],
        },
      ],
    }));

    const [changeset] = useChangesetStore.getState().changesets;
    expect(changeset.files[0].hunks).toEqual([
      {
        id: 'hunk-1',
        content: '@@ -12,3 +18,4 @@\n-old\n+new',
        status: 'pending',
        originalStart: 12,
        originalLength: 3,
        modifiedStart: 18,
        modifiedLength: 4,
      },
    ]);
  });

  it('normalizes applied and rejected proposal statuses', () => {
    useChangesetStore.getState().addProposalSession(makePreview({
      status: 'partially_applied',
      records: [
        {
          ...makePreview().records[0],
          id: 'record-2',
          status: 'applied',
        },
        {
          ...makePreview().records[0],
          id: 'record-3',
          status: 'failed',
          filePath: '/workspace/src/other.ts',
        },
        {
          ...makePreview().records[0],
          id: 'record-4',
          status: 'partially_applied',
          filePath: '/workspace/src/partial.ts',
        },
      ],
    }));

    const [changeset] = useChangesetStore.getState().changesets;
    expect(changeset.status).toBe('reviewing');
    expect(changeset.files.map((file) => file.status)).toEqual(['accepted', 'rejected', 'reviewing']);
  });

  it('preserves hydrated record content across preview refreshes', () => {
    useChangesetStore.getState().addProposalSession(makePreview());
    useChangesetStore.getState().hydrateProposalRecordContent(
      'proposal-session-1',
      'record-1',
      'const before = true;',
      'const after = true;',
    );

    useChangesetStore.getState().addProposalSession(makePreview({
      updatedAt: '2026-05-03T10:02:00.000Z',
      summary: '刷新 proposal preview',
    }));

    const [changeset] = useChangesetStore.getState().changesets;
    expect(changeset.summary).toBe('刷新 proposal preview');
    expect(changeset.files[0]).toMatchObject({
      proposalRecordId: 'record-1',
      contentLoaded: true,
      oldContent: 'const before = true;',
      newContent: 'const after = true;',
    });
  });

  it('counts only pending proposal records as actionable review items', () => {
    useChangesetStore.getState().addProposalSession(makePreview({
      status: 'partially_applied',
      records: [
        {
          ...makePreview().records[0],
          id: 'record-1',
          status: 'applied',
        },
        {
          ...makePreview().records[0],
          id: 'record-2',
          filePath: '/workspace/src/pending.ts',
          status: 'pending',
        },
        {
          ...makePreview().records[0],
          id: 'record-3',
          filePath: '/workspace/src/rejected.ts',
          status: 'rejected',
        },
      ],
    }));

    const [changeset] = useChangesetStore.getState().changesets;
    expect(getPendingChangesetReviewFileCount(changeset)).toBe(1);
    expect(hasPendingChangesetReviewItems(changeset)).toBe(true);
  });

  it('reconciles stale pending proposal sessions during global refresh', () => {
    useChangesetStore.getState().addProposalSession(makePreview({
      id: 'proposal-session-active',
      records: [
        {
          ...makePreview().records[0],
          id: 'record-active',
          proposalSessionId: 'proposal-session-active',
          status: 'pending',
        },
      ],
    }));
    useChangesetStore.getState().addProposalSession(makePreview({
      id: 'proposal-session-stale',
      records: [
        {
          ...makePreview().records[0],
          id: 'record-stale',
          proposalSessionId: 'proposal-session-stale',
          status: 'pending',
        },
      ],
    }));
    useChangesetStore.getState().addProposalSession(makePreview({
      id: 'proposal-session-applied',
      status: 'applied',
      records: [
        {
          ...makePreview().records[0],
          id: 'record-applied',
          proposalSessionId: 'proposal-session-applied',
          status: 'applied',
        },
      ],
    }));

    useChangesetStore.getState().reconcilePendingProposalSessions(['proposal-session-active']);

    expect(useChangesetStore.getState().changesets.map((changeset) => changeset.id).sort()).toEqual([
      'proposal-session-active',
      'proposal-session-applied',
    ]);
  });
});