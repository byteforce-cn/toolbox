/**
 * agent-trace-store.ts — Agent 调用链路日志的全局 Zustand 状态。
 *
 * 事件去重：按 id 去重。
 * 排序：同一 run 内按 sequence 升序；无 sequence 时按 timestamp。
 * 大字段策略：detail 超过 INLINE_DETAIL_MAX 时不常驻 UI，通过
 *   `agentTraceGetEvent` 按需获取。
 */
import { create } from 'zustand';
import {
  agentTraceListRuns,
  agentTraceGetEvents,
  agentTraceExport,
  listenAgentTraceEvent,
} from '../services/agent-trace-service';
import type {
  AgentTraceEvent,
  AgentTraceRunSummary,
  AgentTraceQuery,
  AgentTraceEventPhase,
  AgentTraceEventStatus,
  AgentTraceExportFormat,
} from '../services/types';

export interface AgentTraceFilters {
  phase?: AgentTraceEventPhase;
  status?: AgentTraceEventStatus;
  search?: string;
}

interface AgentTraceState {
  runs: AgentTraceRunSummary[];
  eventsByRunId: Record<string, AgentTraceEvent[]>;
  selectedRunId: string | null;
  selectedEventId: string | null;
  filters: AgentTraceFilters;
  livePaused: boolean;
  tailEnabled: boolean;
  loading: boolean;
  error: string | null;

  // Actions
  loadRuns: () => Promise<void>;
  selectRun: (runId: string) => Promise<void>;
  selectEvent: (eventId: string | null) => void;
  setFilters: (filters: Partial<AgentTraceFilters>) => void;
  setLivePaused: (paused: boolean) => void;
  setTailEnabled: (enabled: boolean) => void;
  pushLiveEvent: (event: AgentTraceEvent) => void;
  exportRun: (runId: string, format: AgentTraceExportFormat) => Promise<string>;
  startLiveSubscription: () => Promise<() => void>;
}

/** Maximum inline detail size — events with detail above this are fetched on demand. */
const INLINE_DETAIL_MAX = 4096;

function compareEvents(a: AgentTraceEvent, b: AgentTraceEvent): number {
  if (a.sequence != null && b.sequence != null) {
    return a.sequence - b.sequence;
  }
  return a.timestamp.localeCompare(b.timestamp);
}

function mergeEvent(existing: AgentTraceEvent[], incoming: AgentTraceEvent): AgentTraceEvent[] {
  if (existing.some((e) => e.id === incoming.id)) {
    return existing;
  }
  return [...existing, incoming].sort(compareEvents);
}

export const useAgentTraceStore = create<AgentTraceState>((set, get) => ({
  runs: [],
  eventsByRunId: {},
  selectedRunId: null,
  selectedEventId: null,
  filters: {},
  livePaused: false,
  tailEnabled: true,
  loading: false,
  error: null,

  loadRuns: async () => {
    set({ loading: true, error: null });
    try {
      const runs = await agentTraceListRuns({ limit: 50 });
      set({ runs, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  selectRun: async (runId: string) => {
    set({ selectedRunId: runId, selectedEventId: null, loading: true, error: null });
    try {
      const query: AgentTraceQuery = { runId, limit: 500 };
      const events = await agentTraceGetEvents(query);
      set((s) => ({
        eventsByRunId: { ...s.eventsByRunId, [runId]: events.sort(compareEvents) },
        loading: false,
      }));
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  selectEvent: (eventId) => {
    set({ selectedEventId: eventId });
  },

  setFilters: (incoming) => {
    set((s) => ({ filters: { ...s.filters, ...incoming } }));
  },

  setLivePaused: (paused) => set({ livePaused: paused }),

  setTailEnabled: (enabled) => set({ tailEnabled: enabled }),

  pushLiveEvent: (event: AgentTraceEvent) => {
    const { livePaused } = get();
    if (livePaused) return;

    // Drop oversized detail for inline storage.
    const sanitized =
      event.detail && JSON.stringify(event.detail).length > INLINE_DETAIL_MAX
        ? { ...event, detail: undefined }
        : event;

    set((s) => {
      if (!event.runId) return s;
      const runId = event.runId;
      const existing = s.eventsByRunId[runId] ?? [];
      const merged = mergeEvent(existing, sanitized);
      return { eventsByRunId: { ...s.eventsByRunId, [runId]: merged } };
    });

    // Refresh run list if this is a new run.
    const { runs } = get();
    if (event.runId && !runs.some((r) => r.runId === event.runId)) {
      get().loadRuns();
    }
  },

  exportRun: (runId, format) => agentTraceExport({ runId, format }),

  startLiveSubscription: () =>
    listenAgentTraceEvent((event) => get().pushLiveEvent(event)),
}));
