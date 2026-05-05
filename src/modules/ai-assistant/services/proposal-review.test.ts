import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChangesetStore } from '../../../store/changeset-store';
import {
  applyProposal,
  ensureProposalRecordContent,
  hydratePendingProposalSessions,
  rejectProposal,
} from './proposal-review';
import {
  agentListSessions,
  proposalGetPreview,
  proposalGetRecordContent,
  proposalListBySession,
} from './agent-service';
import type {
  AgentSessionSummary,
  ProposalRecordContent,
  ProposalSessionPreview,
  ProposalSessionSummary,
} from './types';
import { invokeAI } from './invoke-ai';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('./agent-service', () => ({
  agentListSessions: vi.fn(),
  proposalGetPreview: vi.fn(),
  proposalGetRecordContent: vi.fn(),
  proposalListBySession: vi.fn(),
}));

vi.mock('./invoke-ai', () => ({
  invokeAI: vi.fn(),
}));

function makeSessionSummary(overrides: Partial<AgentSessionSummary> = {}): AgentSessionSummary {
  return {
    id: overrides.id ?? 'session-1',
    title: overrides.title ?? 'Review session',
    model: overrides.model ?? 'gpt-5.4',
    lastMessagePreview: overrides.lastMessagePreview ?? 'pending proposal',
    createdAt: overrides.createdAt ?? '2026-05-03T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-05-03T10:01:00.000Z',
  };
}

function makeProposalSummary(overrides: Partial<ProposalSessionSummary> = {}): ProposalSessionSummary {
  return {
    id: overrides.id ?? 'proposal-session-1',
    aiSessionId: overrides.aiSessionId ?? 'session-1',
    runId: overrides.runId ?? 'run-1',
    summary: overrides.summary ?? '待审变更',
    status: overrides.status ?? 'open',
    planSteps: overrides.planSteps ?? ['审查 diff'],
    source: overrides.source ?? 'agent',
    createdAt: overrides.createdAt ?? '2026-05-03T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-05-03T10:01:00.000Z',
    completedAt: overrides.completedAt ?? null,
    recordCount: overrides.recordCount ?? 1,
    pendingRecordCount: overrides.pendingRecordCount ?? 1,
  };
}

function makePreview(overrides: Partial<ProposalSessionPreview> = {}): ProposalSessionPreview {
  return {
    id: overrides.id ?? 'proposal-session-1',
    aiSessionId: overrides.aiSessionId ?? 'session-1',
    runId: overrides.runId ?? 'run-1',
    summary: overrides.summary ?? '待审变更',
    status: overrides.status ?? 'open',
    planSteps: overrides.planSteps ?? ['审查 diff'],
    source: overrides.source ?? 'agent',
    createdAt: overrides.createdAt ?? '2026-05-03T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-05-03T10:01:00.000Z',
    completedAt: overrides.completedAt ?? null,
    decisionLog: overrides.decisionLog ?? [],
    records: overrides.records ?? [
      {
        id: 'record-1',
        proposalSessionId: 'proposal-session-1',
        requestId: 'req-1',
        toolName: 'apply_patch',
        filePath: '/workspace/src/review.ts',
        operationType: 'modify',
        status: 'pending',
        summary: '更新 review 标题',
        hunks: [{ id: 'hunk-1', content: '@@\n-old\n+new', status: 'pending' }],
        patchOperation: null,
        lastApplyResult: null,
        createdAt: '2026-05-03T10:00:00.000Z',
        updatedAt: '2026-05-03T10:01:00.000Z',
      },
    ],
  };
}

describe('hydratePendingProposalSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChangesetStore.setState({ changesets: [] });
  });

  it('hydrates only proposal sessions that still have pending records', async () => {
    vi.mocked(agentListSessions).mockResolvedValue([
      makeSessionSummary({ id: 'session-1' }),
      makeSessionSummary({ id: 'session-2' }),
    ]);
    vi.mocked(proposalListBySession)
      .mockResolvedValueOnce([
        makeProposalSummary({ id: 'proposal-session-1', aiSessionId: 'session-1', pendingRecordCount: 1 }),
      ])
      .mockResolvedValueOnce([
        makeProposalSummary({ id: 'proposal-session-2', aiSessionId: 'session-2', status: 'applied', pendingRecordCount: 0 }),
      ]);
    vi.mocked(proposalGetPreview).mockResolvedValue(makePreview({
      id: 'proposal-session-1',
      aiSessionId: 'session-1',
    }));

    await hydratePendingProposalSessions();

    expect(proposalGetPreview).toHaveBeenCalledTimes(1);
    expect(proposalGetPreview).toHaveBeenCalledWith('proposal-session-1');
    expect(useChangesetStore.getState().changesets).toHaveLength(1);
    expect(useChangesetStore.getState().changesets[0]).toMatchObject({
      id: 'proposal-session-1',
      aiSessionId: 'session-1',
      status: 'pending',
    });
  });

  it('removes stale pending proposal sessions that are no longer pending in the backend', async () => {
    useChangesetStore.getState().addProposalSession(makePreview({
      id: 'proposal-session-stale',
      aiSessionId: 'session-stale',
      records: [
        {
          ...makePreview().records[0],
          id: 'record-stale',
          proposalSessionId: 'proposal-session-stale',
          status: 'pending',
        },
      ],
    }));
    vi.mocked(agentListSessions).mockResolvedValue([
      makeSessionSummary({ id: 'session-1' }),
      makeSessionSummary({ id: 'session-stale' }),
    ]);
    vi.mocked(proposalListBySession)
      .mockResolvedValueOnce([
        makeProposalSummary({ id: 'proposal-session-1', aiSessionId: 'session-1', pendingRecordCount: 1 }),
      ])
      .mockResolvedValueOnce([
        makeProposalSummary({ id: 'proposal-session-stale', aiSessionId: 'session-stale', status: 'applied', pendingRecordCount: 0 }),
      ]);
    vi.mocked(proposalGetPreview).mockResolvedValue(makePreview({
      id: 'proposal-session-1',
      aiSessionId: 'session-1',
    }));

    await hydratePendingProposalSessions();

    expect(useChangesetStore.getState().changesets.map((changeset) => changeset.id).sort()).toEqual([
      'proposal-session-1',
    ]);
  });
});

describe('ensureProposalRecordContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChangesetStore.setState({ changesets: [] });
  });

  it('hydrates old/new content for proposal-backed files on demand', async () => {
    useChangesetStore.getState().addProposalSession(makePreview());
    vi.mocked(proposalGetRecordContent).mockResolvedValue({
      proposalSessionId: 'proposal-session-1',
      proposalRecordId: 'record-1',
      oldContent: 'const before = true;',
      newContent: 'const after = true;',
    } satisfies ProposalRecordContent);

    const file = useChangesetStore.getState().changesets[0]?.files[0];
    await ensureProposalRecordContent(file);

    expect(proposalGetRecordContent).toHaveBeenCalledWith('record-1');
    expect(useChangesetStore.getState().changesets[0]?.files[0]).toMatchObject({
      contentLoaded: true,
      oldContent: 'const before = true;',
      newContent: 'const after = true;',
    });
  });

  it('skips fetch when the file content is already loaded', async () => {
    useChangesetStore.getState().addProposalSession(makePreview());
    useChangesetStore.getState().hydrateProposalRecordContent(
      'proposal-session-1',
      'record-1',
      'const before = true;',
      'const after = true;',
    );

    const file = useChangesetStore.getState().changesets[0]?.files[0];
    await ensureProposalRecordContent(file);

    expect(proposalGetRecordContent).not.toHaveBeenCalled();
  });
});

describe('applyProposal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChangesetStore.setState({ changesets: [] });
  });

  it('keeps a proposal session in reviewing when only part of the files are accepted', async () => {
    useChangesetStore.getState().addProposalSession(makePreview({
      records: [
        makePreview().records[0],
        {
          ...makePreview().records[0],
          id: 'record-2',
          filePath: '/workspace/src/second.ts',
        },
      ],
    }));

    vi.mocked(invokeAI)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(makePreview({
        status: 'partially_applied',
        records: [
          {
            ...makePreview().records[0],
            status: 'applied',
          },
          {
            ...makePreview().records[0],
            id: 'record-2',
            filePath: '/workspace/src/second.ts',
            status: 'pending',
          },
        ],
      }));

    await applyProposal('proposal-session-1', ['record-1']);

    expect(invokeAI).toHaveBeenNthCalledWith(1, 'proposal_apply', {
      request: {
        proposalSessionId: 'proposal-session-1',
        acceptedIds: ['record-1'],
        recordSelections: [],
      },
    });
    expect(invokeAI).toHaveBeenNthCalledWith(2, 'proposal_get_preview', {
      proposalSessionId: 'proposal-session-1',
    });
    expect(useChangesetStore.getState().changesets[0]).toMatchObject({
      status: 'reviewing',
    });
    expect(useChangesetStore.getState().changesets[0]?.files.map((file) => file.status)).toEqual([
      'accepted',
      'pending',
    ]);
  });

  it('submits hunk selections and rehydrates the updated record content', async () => {
    useChangesetStore.getState().addProposalSession(makePreview());
    vi.mocked(invokeAI)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(makePreview({
        status: 'partially_applied',
        records: [
          {
            ...makePreview().records[0],
            status: 'partially_applied',
            hunks: [
              { id: 'hunk-1', content: '@@\n-old\n+new', status: 'accepted' },
              { id: 'hunk-2', content: '@@\n-old2\n+new2', status: 'rejected' },
            ],
          },
        ],
      }));
    vi.mocked(proposalGetRecordContent).mockResolvedValue({
      proposalSessionId: 'proposal-session-1',
      proposalRecordId: 'record-1',
      oldContent: 'before',
      newContent: 'after partial',
    } satisfies ProposalRecordContent);

    await applyProposal('proposal-session-1', [], {
      recordSelections: [{ proposalRecordId: 'record-1', acceptedHunks: ['hunk-1'] }],
    });

    expect(invokeAI).toHaveBeenNthCalledWith(1, 'proposal_apply', {
      request: {
        proposalSessionId: 'proposal-session-1',
        acceptedIds: [],
        recordSelections: [{ proposalRecordId: 'record-1', acceptedHunks: ['hunk-1'] }],
      },
    });
    expect(proposalGetRecordContent).toHaveBeenCalledWith('record-1');
    expect(useChangesetStore.getState().changesets[0]?.files[0]).toMatchObject({
      status: 'reviewing',
      contentLoaded: true,
      newContent: 'after partial',
    });
  });

  it('rehydrates preview after rejecting a proposal session', async () => {
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
          filePath: '/workspace/src/rejected.ts',
          status: 'pending',
        },
      ],
    }));

    vi.mocked(invokeAI)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(makePreview({
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
            filePath: '/workspace/src/rejected.ts',
            status: 'rejected',
          },
        ],
      }));

    await rejectProposal('proposal-session-1');

    expect(invokeAI).toHaveBeenNthCalledWith(1, 'proposal_reject', {
      proposalSessionId: 'proposal-session-1',
    });
    expect(invokeAI).toHaveBeenNthCalledWith(2, 'proposal_get_preview', {
      proposalSessionId: 'proposal-session-1',
    });
    expect(useChangesetStore.getState().changesets[0]).toMatchObject({
      status: 'reviewing',
    });
    expect(useChangesetStore.getState().changesets[0]?.files.map((file) => file.status)).toEqual([
      'accepted',
      'rejected',
    ]);
  });
});