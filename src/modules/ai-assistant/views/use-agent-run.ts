/**
 * use-agent-run.ts - Agent 运行生命周期管理 Hook。
 *
 * 协议：只消费 agent-realtime-event（AgentRealtimeEnvelope）。
 * 状态由 @byteforce/assistant 的 ReAct reducer 管理；
 * status 从 ReActRunTimeline.status 推导，abort 通过 error message aborted 识别。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyAgentRealtimeEnvelope,
  isTerminalStatus,
  type AgentRealtimeEnvelope,
  type ReActRunError,
  type ReActRunTimeline,
} from '@byteforce/assistant';
import * as agentService from '../services/agent-service';
import { toErrorMessage } from '../services/error-message';
import type {
  AgentMessage,
  AgentRunStatus,
  CompactionEventData,
  StreamingMetadata,
  ThinkingMetadata,
  TokenUsage,
  ToolCall,
} from '../services/types';
import type { AssistantTimelineItem, ChatMessage, TaskStep, ThinkingSegment } from './types';
import {
  buildReActLiveMessage,
  buildReActLiveTimelineItems,
} from './react-run-view-model';

export type { TaskStep };

export interface UseAgentRunReturn {
  /** 运行状态：idle | running | aborting | completed | failed | aborted */
  status: AgentRunStatus | 'idle' | 'aborting';
  streamTokens: string;
  thinking: string;
  thinkingMeta: ThinkingMetadata | null;
  thinkingSegments: ThinkingSegment[];
  streamingMeta: StreamingMetadata | null;
  tokenUsage: TokenUsage | null;
  toolCalls: ToolCall[];
  planSteps: TaskStep[];
  taskSteps: TaskStep[];
  compactionEvents: CompactionEventData[];
  currentModel: string | null;
  error: string | null;
  runErrors: ReActRunError[];
  instanceId: string | null;
  events: AgentRealtimeEnvelope[];
  timeline: ReActRunTimeline | null;
  liveMessage: ChatMessage | null;
  liveTimelineItems: AssistantTimelineItem[];
  run(
    agentId: string,
    input: string,
    context?: AgentMessage[],
    executionContext?: { aiSessionId: string; runId?: string },
    images?: string[],
  ): Promise<void>;
  abort(): Promise<void>;
  clearLiveRunArtifacts(): void;
  reset(): void;
}

const MAX_STREAM = 24000;
const MAX_THINKING = 16000;
const MAX_TOOLS = 64;
const EMPTY_PLAN_STEPS: TaskStep[] = [];
const EMPTY_COMPACTION_EVENTS: CompactionEventData[] = [];

export function useAgentRun(): UseAgentRunReturn {
  const [status, setStatus] = useState<AgentRunStatus | 'idle' | 'aborting'>('idle');
  const [streamTokens, setStreamTokens] = useState('');
  const [thinking, setThinking] = useState('');
  const [thinkingSegments, setThinkingSegments] = useState<ThinkingSegment[]>([]);
  const [streamingMeta, setStreamingMeta] = useState<StreamingMetadata | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [taskSteps, setTaskSteps] = useState<TaskStep[]>([]);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runErrors, setRunErrors] = useState<ReActRunError[]>([]);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentRealtimeEnvelope[]>([]);
  const [timeline, setTimeline] = useState<ReActRunTimeline | null>(null);
  const [liveMessage, setLiveMessage] = useState<ChatMessage | null>(null);
  const [liveTimelineItems, setLiveTimelineItems] = useState<AssistantTimelineItem[]>([]);

  const instanceIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const timelineRef = useRef<ReActRunTimeline | undefined>(undefined);

  const detachListener = useCallback(() => {
    unlistenRef.current?.();
    unlistenRef.current = null;
  }, []);

  useEffect(() => () => detachListener(), [detachListener]);

  const clearLiveRunArtifacts = useCallback(() => {
    detachListener();
    instanceIdRef.current = null;
    timelineRef.current = undefined;
    setStreamTokens('');
    setThinking('');
    setThinkingSegments([]);
    setStreamingMeta(null);
    setTokenUsage(null);
    setToolCalls([]);
    setTaskSteps([]);
    setCurrentModel(null);
    setError(null);
    setRunErrors([]);
    setInstanceId(null);
    setEvents([]);
    setTimeline(null);
    setLiveMessage(null);
    setLiveTimelineItems([]);
  }, [detachListener]);

  const reset = useCallback(() => {
    clearLiveRunArtifacts();
    setStatus('idle');
  }, [clearLiveRunArtifacts]);

  const applyEnvelope = useCallback((envelope: AgentRealtimeEnvelope) => {
    const next = applyAgentRealtimeEnvelope(timelineRef.current, envelope);
    timelineRef.current = next;
    setEvents((prev) => {
      if (prev.some((event) => event.runId === envelope.runId && event.sequence === envelope.sequence)) {
        return prev;
      }
      return [...prev, envelope];
    });
    setTimeline(next);

    if (envelope.event.type === 'run_started') {
      setCurrentModel(envelope.event.payload.model);
    }

    const msg = buildReActLiveMessage(next, {
      maxStreamChars: MAX_STREAM,
      maxThinkingChars: MAX_THINKING,
      maxToolCalls: MAX_TOOLS,
    });
    setLiveMessage(msg);
    setLiveTimelineItems(buildReActLiveTimelineItems(next));
    setStreamTokens(msg.content);
    setThinking(msg.thinking ?? '');
    setThinkingSegments(msg.thinkingSegments ?? []);
    setStreamingMeta(msg.streamingMeta ?? null);
    setTokenUsage(msg.tokenUsage ?? null);
    setToolCalls((msg.toolCalls ?? []) as ToolCall[]);
    setTaskSteps((msg.taskSteps ?? []) as TaskStep[]);
    setRunErrors(msg.errors ?? []);
    const errors = msg.errors ?? [];
    const lastError = errors.length > 0 ? errors[errors.length - 1] : undefined;
    if (lastError && !lastError.recoverable) setError(lastError.message);

    if (isTerminalStatus(next.status)) {
      setStatus(next.status);
      detachListener();
    }
  }, [detachListener]);

  const abort = useCallback(async () => {
    if (!instanceIdRef.current) return;
    setStatus('aborting');
    try {
      await agentService.agentAbort(instanceIdRef.current);
    } catch (e) {
      console.error('[use-agent-run] abort failed', e);
    }
  }, []);

  const run = useCallback(async (
    agentId: string,
    input: string,
    context?: AgentMessage[],
    executionContext?: { aiSessionId: string; runId?: string },
    images?: string[],
  ) => {
    detachListener();
    instanceIdRef.current = null;
    timelineRef.current = undefined;

    setStatus('running');
    setStreamTokens('');
    setThinking('');
    setThinkingSegments([]);
    setStreamingMeta(null);
    setTokenUsage(null);
    setToolCalls([]);
    setTaskSteps([]);
    setCurrentModel(null);
    setError(null);
    setRunErrors([]);
    setInstanceId(null);
    setEvents([]);
    setTimeline(null);
    setLiveMessage(null);
    setLiveTimelineItems([]);

    let pendingRunId: string | null = executionContext?.runId ?? null;
    const earlyBuffer: AgentRealtimeEnvelope[] = [];

    let unlisten: (() => void) | null = null;
    try {
      unlisten = await agentService.listenAgentRealtimeEvent((envelope) => {
        if (pendingRunId === null) {
          earlyBuffer.push(envelope);
          return;
        }
        if (envelope.runId === pendingRunId) applyEnvelope(envelope);
      });
      unlistenRef.current = unlisten;
    } catch (err) {
      setStatus('failed');
      setError(toErrorMessage(err));
      return;
    }

    let instance;
    try {
      instance = await agentService.agentRun({
        agentId,
        aiSessionId: executionContext?.aiSessionId ?? crypto.randomUUID(),
        runId: executionContext?.runId,
        input,
        images,
        context,
      });
    } catch (err) {
      detachListener();
      setStatus('failed');
      setError(toErrorMessage(err));
      return;
    }

    const id = instance.instanceId;
    instanceIdRef.current = id;
    pendingRunId = id;
    setInstanceId(id);

    for (const envelope of earlyBuffer) {
      if (envelope.runId === id) applyEnvelope(envelope);
    }
    earlyBuffer.length = 0;
  }, [applyEnvelope, detachListener]);

  return {
    status,
    streamTokens,
    thinking,
    thinkingMeta: null,
    thinkingSegments,
    streamingMeta,
    tokenUsage,
    toolCalls,
    planSteps: EMPTY_PLAN_STEPS,
    taskSteps,
    compactionEvents: EMPTY_COMPACTION_EVENTS,
    currentModel,
    error,
    runErrors,
    instanceId,
    events,
    timeline,
    liveMessage,
    liveTimelineItems,
    run,
    abort,
    clearLiveRunArtifacts,
    reset,
  };
}
