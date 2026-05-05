/**
 * useConversationManager.ts — 对话历史与会话管理 Hook。
 * 适配 toolbox 函数式 API，去除 InversifyJS DI 依赖。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as agentService from '../../services/agent-service';
import { invokeAI } from '../../services/invoke-ai';
import { mapSessionMessageToTimelineItem, summarizeText } from '../timeline-mappers';
import type { AssistantTimelineItem, ChatMessage, Conversation } from '../types';
import type { AgentSessionSummary } from '../../services/types';
import { useProposalSync } from './useProposalSync';

interface UseConversationManagerParams {
  isRunning: boolean;
  isAborting: boolean;
  liveTimelineItems: AssistantTimelineItem[];
  abort: () => Promise<void>;
  reset: () => void;
}

/** 将 ChatMessage[] 格式化为可复制的纯文本。 */
function formatTranscript(messages: ChatMessage[]): string {
  return messages
    .map((m) => `[${m.role === 'user' ? '用户' : '助手'}]\n${m.content}`)
    .join('\n\n---\n\n');
}

/** 将历史消息记录转为 ChatMessage（基础字段）。 */
function mapRecordToChatMessage(record: {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}): ChatMessage | null {
  if (record.role !== 'user' && record.role !== 'assistant') return null;
  const d = new Date(record.createdAt);
  const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  return {
    id: record.id,
    role: record.role as 'user' | 'assistant',
    content: record.content,
    time,
    timestamp: record.createdAt,
    status: 'done',
  };
}

export function useConversationManager({
  isRunning,
  isAborting,
  liveTimelineItems,
  abort,
  reset,
}: UseConversationManagerParams) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [sessionSummaries, setSessionSummaries] = useState<AgentSessionSummary[]>([]);
  const currentConvIdRef = useRef<string>(crypto.randomUUID());
  const [activeConversationId, setActiveConversationId] = useState(currentConvIdRef.current);
  const [restoredTimelineBase, setRestoredTimelineBase] = useState<AssistantTimelineItem[]>([]);
  const [restoredMessageCount, setRestoredMessageCount] = useState(0);

  const { proposalTimelineItems } = useProposalSync({ activeConversationId });

  const loadSessionSummaries = useCallback(async () => {
    try {
      const sessions = await agentService.agentListSessions();
      setSessionSummaries(sessions);
    } catch {
      // ignore
    }
  }, []);

  const hydrateConversationFromBackend = useCallback(async (
    aiSessionId: string,
    options?: { activateConversation?: boolean; includeMessages?: boolean },
  ) => {
    try {
      const data = await agentService.agentGetSessionHistory(aiSessionId);
      if (!data) return false;

      const restoredMessages = data.messages
        .map(mapRecordToChatMessage)
        .filter((m): m is ChatMessage => m !== null);

      const restoredTimeline = data.messages
        .map(mapSessionMessageToTimelineItem)
        .filter((item): item is AssistantTimelineItem => item !== null)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const conversation: Conversation = {
        id: aiSessionId,
        aiSessionId,
        messages: restoredMessages,
        timeline: restoredTimeline,
        startedAt: data.messages[0]?.createdAt ?? '',
      };

      setHistory((prev) => [conversation, ...prev.filter((c) => c.aiSessionId !== aiSessionId)].slice(0, 20));
      if (options?.includeMessages !== false) {
        setMessages(restoredMessages);
        setRestoredMessageCount(restoredMessages.length);
      }
      setRestoredTimelineBase(restoredTimeline);
      if (options?.activateConversation) {
        currentConvIdRef.current = aiSessionId;
        setActiveConversationId(aiSessionId);
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => { void loadSessionSummaries(); }, [loadSessionSummaries]);

  // ── Timeline merging ──────────────────────────────────────────────────

  const mergedTimelineItems = useMemo(() => {
    const deduped = new Map<string, AssistantTimelineItem>();
    for (const item of [...restoredTimelineBase, ...liveTimelineItems, ...proposalTimelineItems]) {
      deduped.set(item.id, item);
    }
    return [...deduped.values()].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }, [restoredTimelineBase, liveTimelineItems, proposalTimelineItems]);

  const persistCurrentConversationToHistory = useCallback(() => {
    if (!messages.length) return;
    const conversation: Conversation = {
      id: currentConvIdRef.current,
      aiSessionId: currentConvIdRef.current,
      messages,
      timeline: mergedTimelineItems,
      startedAt: messages[0]?.time ?? '',
    };
    setHistory((prev) =>
      [conversation, ...prev.filter((c) => c.aiSessionId !== conversation.aiSessionId)].slice(0, 20),
    );
  }, [messages, mergedTimelineItems]);

  // ── Conversation handlers ─────────────────────────────────────────────

  const handleNewChat = useCallback(async () => {
    persistCurrentConversationToHistory();
    if (isRunning || isAborting) await abort();
    reset();
    setMessages([]);
    setRestoredTimelineBase([]);
    setRestoredMessageCount(0);
    currentConvIdRef.current = crypto.randomUUID();
    setActiveConversationId(currentConvIdRef.current);
  }, [persistCurrentConversationToHistory, isRunning, isAborting, abort, reset]);

  const handleRestoreChat = useCallback(async (id: string) => {
    if (id === currentConvIdRef.current) return;
    persistCurrentConversationToHistory();
    const cached = history.find((c) => c.id === id || c.aiSessionId === id);
    if (cached) {
      reset();
      setMessages(cached.messages);
      setRestoredTimelineBase(cached.timeline);
      setRestoredMessageCount(cached.messages.length);
      currentConvIdRef.current = cached.aiSessionId;
      setActiveConversationId(cached.aiSessionId);
      return;
    }
    reset();
    setMessages([]);
    setRestoredTimelineBase([]);
    setRestoredMessageCount(0);
    await hydrateConversationFromBackend(id, { activateConversation: true });
  }, [history, hydrateConversationFromBackend, persistCurrentConversationToHistory, reset]);

  const historySummaries = useMemo(
    () =>
      sessionSummaries.map((session) => ({
        id: session.id,
        preview: summarizeText(session.lastMessagePreview || session.title || '(空)', 60),
        time: session.updatedAt,
      })),
    [sessionSummaries],
  );

  const handleCopyConversation = useCallback(async (id: string) => {
    const cached = history.find((c) => c.id === id || c.aiSessionId === id);
    if (cached) {
      await invokeAI('clipboard_write_text', { text: formatTranscript(cached.messages) });
      return;
    }
    try {
      const data = await agentService.agentGetSessionHistory(id);
      if (!data) return;
      const msgs = data.messages.map(mapRecordToChatMessage).filter((m): m is ChatMessage => m !== null);
      await invokeAI('clipboard_write_text', { text: formatTranscript(msgs) });
    } catch {
      // ignore
    }
  }, [history]);

  return {
    messages,
    setMessages,
    history,
    activeConversationId,
    currentConvIdRef,
    restoredMessageCount,
    mergedTimelineItems,
    historySummaries,
    handleNewChat,
    handleRestoreChat,
    handleCopyConversation,
    persistCurrentConversationToHistory,
    hydrateConversationFromBackend,
    loadSessionSummaries,
  };
}
