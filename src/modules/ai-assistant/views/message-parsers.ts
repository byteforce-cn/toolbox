/**
 * message-parsers.ts — 将运行时 live 数据解析为 AssistantTimelineItem[]。
 * 精简自 draft/jinhe，依赖本地 types.ts 而非共享 UI 组件。
 */
import type { ToolCall } from '../services/types';
import type { AssistantTimelineItem, TaskStep, ThinkingSegment } from './types';
import { summarizeText } from './timeline-mappers';

// ── Live run 数据 → 时间线 ─────────────────────────────────────────────────

/**
 * 将当前 live run 中的工具调用列表转为时间线条目。
 */
export function mapLiveToolCallsToTimelineItems(
  toolCalls: ToolCall[],
  taskSteps: TaskStep[],
): AssistantTimelineItem[] {
  return toolCalls.map((tc) => {
    const step = taskSteps.find((s) => s.id === tc.id);
    const status: AssistantTimelineItem['status'] =
      step?.status === 'completed'
        ? step.success !== false ? 'success' : 'error'
        : step?.status === 'failed' || step?.status === 'timeout'
          ? 'error'
        : 'info';
    return {
      id: `live:tool:${tc.id}`,
      timestamp: new Date().toISOString(),
      kind: 'tool' as const,
      title: `调用 ${tc.name}`,
      detail: step?.resultPreview,
      status,
    };
  });
}

/**
 * 将单条 thinkingSegment 转为时间线条目。
 */
export function mapThinkingSegmentToTimelineItem(seg: ThinkingSegment): AssistantTimelineItem {
  return {
    id: seg.id,
    timestamp: new Date().toISOString(),
    kind: 'assistant' as const,
    title: `思考过程 #${seg.iteration + 1}`,
    detail: summarizeText(seg.content, 400),
    status: 'info',
  };
}

/**
 * 将所有思考片段映射为时间线条目列表。
 */
export function mapThinkingSegmentsToTimelineItems(segs: ThinkingSegment[]): AssistantTimelineItem[] {
  return segs.map(mapThinkingSegmentToTimelineItem);
}

/**
 * 将计划步骤列表转为时间线条目。
 */
export function mapPlanStepsToTimelineItem(
  steps: TaskStep[],
  instanceId: string | null,
): AssistantTimelineItem | null {
  if (!steps.length) return null;
  const detail = steps.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
  return {
    id: `plan:${instanceId ?? 'live'}`,
    timestamp: new Date().toISOString(),
    kind: 'plan' as const,
    title: '执行计划',
    detail,
    status: 'info',
  };
}
