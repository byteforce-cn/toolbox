import {
  type ReActProcessStep,
  reActTimelineToChatMessage,
  type ReActRunTimeline,
} from '@byteforce/assistant';

import type { AssistantTimelineItem, ChatMessage, ThinkingSegment } from './types';
import { summarizeText } from './timeline-mappers';

export interface ReActMessageLimits {
  maxStreamChars?: number;
  maxThinkingChars?: number;
  maxToolCalls?: number;
}

const DEFAULT_MAX_STREAM_CHARS = 24000;
const DEFAULT_MAX_THINKING_CHARS = 16000;
const DEFAULT_MAX_TOOL_CALLS = 64;

export function capTextWindow(text: string, maxChars: number, label: string): string {
  if (text.length <= maxChars) return text;
  const marker = `\n\n...[${label} truncated]...\n\n`;
  const available = Math.max(0, maxChars - marker.length);
  const head = Math.ceil(available / 2);
  const tail = Math.floor(available / 2);
  return `${text.slice(0, head)}${marker}${text.slice(text.length - tail)}`;
}

function thoughtSegmentsFromTimeline(
  timeline: ReActRunTimeline,
  maxThinkingChars: number,
): ThinkingSegment[] {
  return timeline.thoughtBlocks.map((block) => ({
    id: block.id,
    content: capTextWindow(block.content, maxThinkingChars, 'thinking'),
    meta: null,
    iteration: block.iteration,
  }));
}

function capReactStep(step: ReActProcessStep, maxChars: number): ReActProcessStep {
  return {
    ...step,
    content: step.content ? capTextWindow(step.content, maxChars, 'react step') : step.content,
    output: step.output ? capTextWindow(step.output, maxChars, 'react observation') : step.output,
    fullOutput: step.fullOutput ? capTextWindow(step.fullOutput, maxChars, 'react full observation') : step.fullOutput,
  };
}

export function buildReActLiveMessage(
  timeline: ReActRunTimeline,
  limits: ReActMessageLimits = {},
): ChatMessage {
  const maxStreamChars = limits.maxStreamChars ?? DEFAULT_MAX_STREAM_CHARS;
  const maxThinkingChars = limits.maxThinkingChars ?? DEFAULT_MAX_THINKING_CHARS;
  const maxToolCalls = limits.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  const base = reActTimelineToChatMessage(timeline);
  const visibleToolCalls = (base.toolCalls ?? []).slice(-maxToolCalls);
  const visibleToolIds = new Set(visibleToolCalls.map((tool) => tool.id));
  const visibleTaskSteps = (base.taskSteps ?? []).filter((step) => visibleToolIds.has(step.id));
  const thinking = capTextWindow(base.thinking ?? '', maxThinkingChars, 'thinking');
  const thinkingSegments = thoughtSegmentsFromTimeline(timeline, maxThinkingChars);
  const reactSteps = base.reactSteps?.map((step) => capReactStep(step, maxThinkingChars));

  return {
    id: timeline.runId,
    role: 'assistant',
    content: capTextWindow(base.content, maxStreamChars, 'stream output'),
    time: base.time,
    timestamp: base.timestamp,
    status: base.status,
    thinking: thinking || undefined,
    thinkingSegments: thinkingSegments.length > 0 ? thinkingSegments : undefined,
    streamingMeta: {
      deltaRetention: 'none',
      finalMessagePersistedInHistory: true,
      streamedCharCount: base.content.length,
    },
    tokenUsage: base.tokenUsage,
    toolCalls: visibleToolCalls.length > 0 ? visibleToolCalls : undefined,
    taskSteps: visibleTaskSteps.length > 0 ? visibleTaskSteps : undefined,
    errors: base.errors && base.errors.length > 0 ? base.errors : undefined,
    reactSteps: reactSteps && reactSteps.length > 0 ? reactSteps : undefined,
    reactPhase: base.reactPhase,
  };
}

export function hasReActMessageArtifacts(message: ChatMessage | null | undefined): boolean {
  if (!message) return false;
  return Boolean(
    message.content
    || message.thinking
    || (message.thinkingSegments?.length ?? 0) > 0
    || (message.planSteps?.length ?? 0) > 0
    || (message.toolCalls?.length ?? 0) > 0
    || (message.taskSteps?.length ?? 0) > 0
    || (message.reactSteps?.length ?? 0) > 0
    || (message.errors?.length ?? 0) > 0
    || message.tokenUsage,
  );
}

export function finalizeReActMessage(
  message: ChatMessage | null | undefined,
  status: 'completed' | 'failed' | 'aborted',
  conversationId: string,
  now = new Date(),
): ChatMessage | null {
  if (!message) return null;
  const timestamp = now.toISOString();
  const fallbackContent = status === 'failed' && !message.content ? '运行失败，未生成最终回复。' : '';
  const finalMessage: ChatMessage = {
    ...message,
    id: `${conversationId}:assistant:${timestamp}`,
    content: message.content || fallbackContent,
    status: status === 'completed' ? 'done' : 'error',
    time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    timestamp: message.timestamp ?? timestamp,
  };
  return hasReActMessageArtifacts(finalMessage) ? finalMessage : null;
}

export function buildReActLiveTimelineItems(
  timeline: ReActRunTimeline | null | undefined,
): AssistantTimelineItem[] {
  if (!timeline) return [];
  const fallbackTimestamp = timeline.lastTimestamp ?? new Date().toISOString();
  if (timeline.steps.length > 0) {
    return timeline.steps
      .filter((step) => step.kind !== 'final_answer')
      .map((step) => ({
        id: `live:react:${step.id}`,
        timestamp: step.completedAt ?? step.timestamp ?? fallbackTimestamp,
        kind: step.kind === 'action' || step.kind === 'observation' ? 'tool' : 'assistant',
        title: step.title,
        detail: summarizeText(step.output ?? step.content ?? '', 400),
        status: step.status === 'completed' ? 'success' : step.status === 'failed' ? 'error' : 'info',
      }));
  }
  const toolItems: AssistantTimelineItem[] = timeline.toolOrder.map((id) => {
    const tool = timeline.tools[id];
    const status: AssistantTimelineItem['status'] =
      tool.status === 'completed' ? 'success' : tool.status === 'failed' || tool.status === 'timeout' ? 'error' : 'info';
    return {
      id: `live:tool:${tool.id}`,
      timestamp: tool.completedAt ?? tool.startedAt ?? fallbackTimestamp,
      kind: 'tool',
      title: `调用 ${tool.name}`,
      detail: tool.output ?? tool.argsPreview,
      status,
    };
  });
  const thoughtItems: AssistantTimelineItem[] = timeline.thoughtBlocks.map((block) => ({
    id: `live:thought:${block.id}`,
    timestamp: fallbackTimestamp,
    kind: 'assistant',
    title: `思考过程 #${block.iteration + 1}`,
    detail: summarizeText(block.content, 400),
    status: 'info',
  }));
  return [...toolItems, ...thoughtItems];
}