/**
 * useRunCompletion.ts — Agent 运行完成生命周期 Hook。
 * 负责在运行结束时提交助手消息，并管理 approval/proposal 监听器。
 */
import { useEffect, useRef } from 'react';
import { approvalService } from '../../services/approval-service';
import type { TaskStep, ThinkingSegment } from '../types';
import type {
  StreamingMetadata,
  ThinkingMetadata,
  TokenUsage,
  ToolCall,
} from '../../services/types';
import type { ChatMessage } from '../types';

interface UseRunCompletionParams {
  status: string;
  streamTokens: string;
  thinking: string;
  thinkingMeta: ThinkingMetadata | null;
  thinkingSegments: ThinkingSegment[];
  streamingMeta: StreamingMetadata | null;
  tokenUsage: TokenUsage | null;
  toolCalls: ToolCall[];
  planSteps: TaskStep[];
  taskSteps: TaskStep[];
  isRunning: boolean;
  isAborting: boolean;
  clearLiveRunArtifacts: () => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  loadSessionSummaries: () => Promise<void>;
  hydrateConversationFromBackend: (id: string, opts?: { includeMessages?: boolean }) => Promise<boolean>;
  currentConvIdRef: React.RefObject<string>;
  abort: () => Promise<void>;
}

export function useRunCompletion({
  status,
  streamTokens,
  thinking,
  thinkingMeta,
  thinkingSegments,
  streamingMeta,
  tokenUsage,
  toolCalls,
  planSteps,
  taskSteps,
  clearLiveRunArtifacts,
  setMessages,
  loadSessionSummaries,
  hydrateConversationFromBackend,
  currentConvIdRef,
}: UseRunCompletionParams) {
  const streamTokensRef = useRef('');
  const thinkingRef = useRef('');
  const thinkingMetaRef = useRef<ThinkingMetadata | null>(null);
  const streamingMetaRef = useRef<StreamingMetadata | null>(null);
  const tokenUsageRef = useRef<TokenUsage | null>(null);
  const planStepsRef = useRef<TaskStep[]>([]);
  const toolCallsRef = useRef<ToolCall[]>([]);
  const taskStepsRef = useRef<TaskStep[]>([]);
  const thinkingSegmentsRef = useRef<ThinkingSegment[]>([]);

  useEffect(() => { streamTokensRef.current = streamTokens; }, [streamTokens]);
  useEffect(() => { thinkingRef.current = thinking; }, [thinking]);
  useEffect(() => { thinkingMetaRef.current = thinkingMeta; }, [thinkingMeta]);
  useEffect(() => { streamingMetaRef.current = streamingMeta; }, [streamingMeta]);
  useEffect(() => { tokenUsageRef.current = tokenUsage; }, [tokenUsage]);
  useEffect(() => { planStepsRef.current = planSteps; }, [planSteps]);
  useEffect(() => { toolCallsRef.current = toolCalls; }, [toolCalls]);
  useEffect(() => { taskStepsRef.current = taskSteps; }, [taskSteps]);
  useEffect(() => { thinkingSegmentsRef.current = thinkingSegments; }, [thinkingSegments]);

  // ── Approval listener ─────────────────────────────────────────────────
  useEffect(() => {
    approvalService.startListening();
    return () => {
      approvalService.stopListening();
    };
  }, []);

  // ── Completion: commit assistant message ──────────────────────────────
  useEffect(() => {
    if (status !== 'completed' && status !== 'failed' && status !== 'aborted') return;

    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const content = streamTokensRef.current.trimStart().replace(/\n{3,}/g, '\n\n');
    const turnThinking = thinkingRef.current;
    const turnThinkingMeta = thinkingMetaRef.current;
    const turnStreamingMeta = streamingMetaRef.current;
    const turnTokenUsage = tokenUsageRef.current;
    const turnPlanSteps = planStepsRef.current;
    const turnToolCalls = toolCallsRef.current;
    const turnTaskSteps = taskStepsRef.current;

    let segs = thinkingSegmentsRef.current;
    if (segs.length > 0) {
      const archivedToolIds = new Set(segs.flatMap((s) => s.toolCalls?.map((tc) => tc.id) ?? []));
      const archivedStepIds = new Set(segs.flatMap((s) => s.taskSteps?.map((ts) => ts.id) ?? []));
      const finalToolCalls = turnToolCalls.filter((tc) => !archivedToolIds.has(tc.id));
      const finalTaskSteps = turnTaskSteps.filter((ts) => !archivedStepIds.has(ts.id));
      if (turnThinking || finalToolCalls.length > 0) {
        segs = [
          ...segs,
          {
            id: 'thinking-final',
            content: turnThinking,
            meta: turnThinkingMeta,
            iteration: segs.length,
            toolCalls: finalToolCalls.length ? finalToolCalls : undefined,
            taskSteps: finalTaskSteps.length ? finalTaskSteps : undefined,
          },
        ];
      }
    }

    if (content || turnThinking || turnToolCalls.length > 0) {
      const timestamp = now.toISOString();
      const msg: ChatMessage = {
        id: `${currentConvIdRef.current}:assistant:${timestamp}`,
        role: 'assistant',
        content,
        time,
        timestamp,
        status: status === 'completed' ? 'done' : 'error',
      };
      if (turnThinking) msg.thinking = turnThinking;
      if (turnThinkingMeta) msg.thinkingMeta = turnThinkingMeta;
      if (segs.length) msg.thinkingSegments = segs;
      if (turnStreamingMeta) msg.streamingMeta = turnStreamingMeta;
      if (turnTokenUsage) msg.tokenUsage = turnTokenUsage;
      if (turnPlanSteps.length) msg.planSteps = turnPlanSteps;
      if (turnToolCalls.length) msg.toolCalls = turnToolCalls;
      if (turnTaskSteps.length) msg.taskSteps = turnTaskSteps;
      setMessages((prev) => [...prev, msg]);
    }

    void loadSessionSummaries();
    void (async () => {
      const hydrated = await hydrateConversationFromBackend(currentConvIdRef.current ?? '');
      if (hydrated) clearLiveRunArtifacts();
    })();
  }, [status, loadSessionSummaries, hydrateConversationFromBackend, clearLiveRunArtifacts, setMessages, currentConvIdRef]);
}
