/**
 * agent-trace-service.ts — agent-trace 模块的 IPC 封装。
 *
 * 所有后端命令通过 toolbox-plugin-ai 插件路由，
 * 实时事件通过 Tauri 事件通道 `agent-trace-event` 订阅。
 */
import { listen } from '@tauri-apps/api/event';
import { invokeAI } from '../../ai-assistant/services/invoke-ai';
import type {
  AgentTraceEvent,
  AgentTraceClearRequest,
  AgentTraceExportRequest,
  AgentTraceQuery,
  AgentTraceRunQuery,
  AgentTraceRunSummary,
} from './types';

export const AGENT_TRACE_EVENT_CHANNEL = 'agent-trace-event';

// ── Run list ───────────────────────────────────────────────────────────────

export const agentTraceListRuns = (query?: AgentTraceRunQuery): Promise<AgentTraceRunSummary[]> =>
  invokeAI<AgentTraceRunSummary[]>('agent_trace_list_runs', { query: query ?? {} });

// ── Events ─────────────────────────────────────────────────────────────────

export const agentTraceGetEvents = (query: AgentTraceQuery): Promise<AgentTraceEvent[]> =>
  invokeAI<AgentTraceEvent[]>('agent_trace_get_events', { query });

export const agentTraceGetEvent = (id: string): Promise<AgentTraceEvent | null> =>
  invokeAI<AgentTraceEvent | null>('agent_trace_get_event', { id });

// ── Export ──────────────────────────────────────────────────────────────────

export const agentTraceExport = (request: AgentTraceExportRequest): Promise<string> =>
  invokeAI<string>('agent_trace_export', { request });

// ── Maintenance ─────────────────────────────────────────────────────────────

export const agentTraceClear = (request: AgentTraceClearRequest): Promise<void> =>
  invokeAI<void>('agent_trace_clear', { request });

// ── Real-time subscription ──────────────────────────────────────────────────

/**
 * 订阅后端 `agent-trace-event` 事件通道。
 * 返回取消订阅函数，供 Zustand action 或 React effect 清理。
 */
export const listenAgentTraceEvent = (
  handler: (event: AgentTraceEvent) => void
): Promise<() => void> => listen<AgentTraceEvent>(AGENT_TRACE_EVENT_CHANNEL, (e) => handler(e.payload));
