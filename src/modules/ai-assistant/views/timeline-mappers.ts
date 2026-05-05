/**
 * timeline-mappers.ts — 将 AgentSessionMessageRecord / Proposal 映射为 AssistantTimelineItem。
 * 精简自 draft/jinhe 的实现，去除对 TeamEvent 等非 Phase-2 特性的依赖。
 */
import type { AssistantTimelineItem } from './types';

// ── 辅助函数 ──────────────────────────────────────────────────────────────

export function summarizeText(text: string, maxLen = 200): string | undefined {
  if (!text || !text.trim()) return undefined;
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length <= maxLen ? single : `${single.slice(0, maxLen)}…`;
}

export function summarizeMultilineText(text: string, maxLen = 200): string | undefined {
  if (!text || !text.trim()) return undefined;
  const first = text.split('\n').find((l) => l.trim());
  const preview = first ? first.trim() : text.trim();
  return preview.length <= maxLen ? preview : `${preview.slice(0, maxLen)}…`;
}

/**
 * 将 AgentSessionMessageRecord（来自数据库历史）映射为时间线条目。
 * record 结构参考 AgentSessionHistory 中的 messages 字段。
 */
export function mapSessionMessageToTimelineItem(record: {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}): AssistantTimelineItem | null {
  if (!record) return null;
  if (record.role === 'user') {
    return {
      id: record.id,
      timestamp: record.createdAt,
      kind: 'user',
      title: '用户',
      detail: summarizeText(record.content, 300),
    };
  }
  if (record.role === 'assistant') {
    return {
      id: record.id,
      timestamp: record.createdAt,
      kind: 'assistant',
      title: '助手回复',
      detail: summarizeText(record.content, 300),
    };
  }
  return null;
}

/**
 * 将 proposal 记录映射为时间线条目。
 */
export function mapProposalToTimelineItem(proposal: {
  id: string;
  createdAt: string;
  filePath: string;
  status: string;
}): AssistantTimelineItem {
  const statusMap: Record<string, AssistantTimelineItem['status']> = {
    applied: 'success',
    rejected: 'error',
    pending: 'info',
  };
  return {
    id: `proposal:${proposal.id}`,
    timestamp: proposal.createdAt,
    kind: 'proposal',
    title: `变更建议 · ${proposal.filePath}`,
    status: statusMap[proposal.status] ?? 'info',
    meta: proposal.status,
  };
}
