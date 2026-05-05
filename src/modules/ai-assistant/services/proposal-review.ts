/**
 * proposal-review.ts — Proposal 事件监听与 changeset-store 同步。
 *
 * 监听 `proposal:created` / `proposal:updated` 事件，
 * 将 Proposal 数据水化到 changeset-store，供 UI 展示审核面板。
 */
import { listen } from '@tauri-apps/api/event';
import { useChangesetStore, type ChangesetFile } from '../../../store/changeset-store';
import {
  agentListSessions,
  proposalGetPreview,
  proposalGetRecordContent,
  proposalListBySession,
} from './agent-service';
import type {
  ProposalRecordApplySelection,
  ProposalSessionPreview,
  ProposalSessionSummary,
} from './types';
import { invokeAI } from './invoke-ai';

/** 正在解析中的 session ID 集合，避免重复水化。 */
const resolveInProgress = new Set<string>();

/** 用户修改反馈队列（part-accept 时积累，由聊天层消费）。 */
const pendingFeedback: string[] = [];

/** 取出并清空所有待反馈消息。 */
export function drainUserModificationFeedback(): string[] {
  return pendingFeedback.splice(0);
}

async function hydrateProposalSession(proposalSessionId: string): Promise<void> {
  if (resolveInProgress.has(proposalSessionId)) return;
  resolveInProgress.add(proposalSessionId);
  try {
    const session = await proposalGetPreview(proposalSessionId);
    useChangesetStore.getState().addProposalSession(session, { includeContent: false });
  } catch (error) {
    console.error('[proposal-review] hydrateProposalSession failed', { proposalSessionId, error });
  } finally {
    resolveInProgress.delete(proposalSessionId);
  }
}

function hasPendingProposalRecords(summary: ProposalSessionSummary): boolean {
  return summary.pendingRecordCount > 0;
}

export async function hydratePendingProposalSessions(): Promise<void> {
  const sessions = await agentListSessions();
  const proposalSummaries = await Promise.allSettled(
    sessions.map(async (session) => proposalListBySession(session.id)),
  );
  const pendingProposalIds = new Set<string>();

  for (const result of proposalSummaries) {
    if (result.status !== 'fulfilled') {
      console.error('[proposal-review] proposal_list_by_session failed', result.reason);
      continue;
    }

    for (const proposal of result.value) {
      if (hasPendingProposalRecords(proposal)) {
        pendingProposalIds.add(proposal.id);
      }
    }
  }

  await Promise.allSettled(
    [...pendingProposalIds].map((proposalSessionId) => hydrateProposalSession(proposalSessionId)),
  );
  useChangesetStore.getState().reconcilePendingProposalSessions([...pendingProposalIds]);
}

export async function hydrateProposalSessionsForAiSession(aiSessionId: string): Promise<void> {
  const summaries = await proposalListBySession(aiSessionId);
  await Promise.allSettled(
    summaries
      .filter(hasPendingProposalRecords)
      .map((proposalSession) => hydrateProposalSession(proposalSession.id)),
  );
}

export async function ensureProposalRecordContent(file: ChangesetFile | null | undefined): Promise<void> {
  if (
    !file
    || file.reviewSource !== 'proposal'
    || !file.proposalRecordId
    || file.contentLoaded
  ) {
    return;
  }

  const content = await proposalGetRecordContent(file.proposalRecordId);
  useChangesetStore.getState().hydrateProposalRecordContent(
    content.proposalSessionId,
    content.proposalRecordId,
    content.oldContent,
    content.newContent,
  );
}

/** 启动 Proposal 事件监听，返回清理函数。 */
export async function startProposalListener(): Promise<() => void> {
  const unlistenCreated = await listen<ProposalSessionSummary>('proposal:created', (event) => {
    void hydrateProposalSession(event.payload.id);
  });

  const unlistenUpdated = await listen<ProposalSessionSummary>('proposal:updated', (event) => {
    void hydrateProposalSession(event.payload.id);
  });

  return () => {
    unlistenCreated();
    unlistenUpdated();
  };
}

/**
 * 应用 Proposal（逐文件接受）。
 * @param proposalSessionId - Proposal session ID
 * @param acceptedRecordIds - 接受的 record ID 列表（空数组 = 全部拒绝）
 */
export async function applyProposal(
  proposalSessionId: string,
  acceptedRecordIds: string[],
  options?: { recordSelections?: ProposalRecordApplySelection[] },
): Promise<void> {
  resolveInProgress.add(proposalSessionId);
  try {
    const recordSelections = options?.recordSelections ?? [];
    await invokeAI('proposal_apply', {
      request: {
        proposalSessionId,
        acceptedIds: acceptedRecordIds,
        recordSelections,
      },
    });
    const updated = await invokeAI<ProposalSessionPreview>('proposal_get_preview', { proposalSessionId });
    useChangesetStore.getState().addProposalSession(updated);

    const targetRecordIds = new Set<string>([
      ...acceptedRecordIds,
      ...recordSelections.map((selection) => selection.proposalRecordId),
    ]);

    await Promise.allSettled(
      [...targetRecordIds].map(async (proposalRecordId) => {
        const content = await proposalGetRecordContent(proposalRecordId);
        useChangesetStore.getState().hydrateProposalRecordContent(
          content.proposalSessionId,
          content.proposalRecordId,
          content.oldContent,
          content.newContent,
        );
      }),
    );
  } finally {
    resolveInProgress.delete(proposalSessionId);
  }
}

/**
 * 拒绝 Proposal（全部拒绝）。
 */
export async function rejectProposal(proposalSessionId: string): Promise<void> {
  resolveInProgress.add(proposalSessionId);
  try {
    await invokeAI('proposal_reject', { proposalSessionId });
    const updated = await invokeAI<ProposalSessionPreview>('proposal_get_preview', { proposalSessionId });
    useChangesetStore.getState().addProposalSession(updated);
  } finally {
    resolveInProgress.delete(proposalSessionId);
  }
}
