/**
 * useProposalSync.ts — 提案事件同步 Hook。
 * 监听 proposal:created/updated 事件，更新 changesetStore。
 */
import { useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useChangesetStore } from '../../../../store/changeset-store';
import { mapProposalToTimelineItem } from '../timeline-mappers';
import type { AssistantTimelineItem } from '../types';
import type { ProposalSessionPreview } from '../../services/types';

interface UseProposalSyncParams {
  activeConversationId: string;
}

export function useProposalSync({ activeConversationId }: UseProposalSyncParams) {
  const [liveProposalBase, setLiveProposalBase] = useState<AssistantTimelineItem[]>([]);
  const [syncVersion, setSyncVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unlistenCreated: (() => void) | null = null;
    let unlistenUpdated: (() => void) | null = null;

    const register = async () => {
      unlistenCreated = await listen<ProposalSessionPreview>('proposal:created', (e) => {
        if (cancelled || e.payload.aiSessionId !== activeConversationId) return;
        setSyncVersion((v) => v + 1);
      });
      unlistenUpdated = await listen<ProposalSessionPreview>('proposal:updated', (e) => {
        if (cancelled || e.payload.aiSessionId !== activeConversationId) return;
        setSyncVersion((v) => v + 1);
      });
    };
    void register();

    return () => {
      cancelled = true;
      unlistenCreated?.();
      unlistenUpdated?.();
    };
  }, [activeConversationId]);

  // Derive proposal timeline items from changeset store on version bump
  useEffect(() => {
    const { changesets } = useChangesetStore.getState();
    const items = changesets
      .filter((cs) => cs.aiSessionId === activeConversationId)
      .flatMap((cs) =>
        cs.files.map((f) =>
          mapProposalToTimelineItem({
            id: `${cs.id}:${f.filePath}`,
            createdAt: new Date().toISOString(),
            filePath: f.filePath,
            status: f.status ?? 'pending',
          }),
        ),
      );
    setLiveProposalBase(items);
  }, [syncVersion, activeConversationId]);

  const proposalTimelineItems = useMemo(() => liveProposalBase, [liveProposalBase]);

  return { proposalTimelineItems };
}
