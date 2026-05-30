/**
 * AgentTracePanel.tsx — Agent 调用链路 bottom panel 主视图。
 *
 * 布局：
 *   [Toolbar]
 *   [RunList (左) | Timeline (中) | EventDetail (右)]
 *
 * 生命周期：
 *   - Mount 时加载历史 run 列表并订阅实时事件通道。
 *   - Unmount 时取消订阅。
 */
import { useEffect, useRef, useMemo } from 'react';
import { useAgentTraceStore } from '../store/agent-trace-store';
import { TraceToolbar } from './components/TraceToolbar';
import { TraceRunList } from './components/TraceRunList';
import { TraceTimeline } from './components/TraceTimeline';
import { TraceEventDetail } from './components/TraceEventDetail';
import { BackendUnavailableNotice } from '@/components/BackendUnavailableNotice';
import type { AgentTraceEvent } from '../services/types';

export function AgentTracePanel() {
  const {
    runs,
    eventsByRunId,
    selectedRunId,
    selectedEventId,
    filters,
    livePaused,
    loading,
    error,
    loadRuns,
    selectRun,
    selectEvent,
    setFilters,
    setLivePaused,
    startLiveSubscription,
    exportRun,
  } = useAgentTraceStore();

  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    loadRuns();
    startLiveSubscription().then((unsub) => {
      unsubRef.current = unsub;
    });
    return () => {
      unsubRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rawEvents: AgentTraceEvent[] = selectedRunId ? (eventsByRunId[selectedRunId] ?? []) : [];

  // Apply client-side filters.
  const filteredEvents = useMemo(() => {
    let result = rawEvents;
    if (filters.phase) result = result.filter((e) => e.phase === filters.phase);
    if (filters.status) result = result.filter((e) => e.status === filters.status);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.summary?.toLowerCase().includes(q) ?? false) ||
          (e.inputPreview?.toLowerCase().includes(q) ?? false)
      );
    }
    return result;
  }, [rawEvents, filters]);

  const selectedEvent = selectedEventId
    ? rawEvents.find((e) => e.id === selectedEventId)
    : null;

  const handleExport = async () => {
    if (!selectedRunId) return;
    try {
      const json = await exportRun(selectedRunId, 'json');
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-trace-${selectedRunId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently ignore export errors in UI — the user can retry.
    }
  };

  if (error?.includes('BackendUnavailable') || error?.includes('not found')) {
    return (
      <BackendUnavailableNotice
        title="Agent 调用链路"
        description="后端 trace 命令不可用，请确认 toolbox-plugin-ai 已注册以下命令。"
        pendingCommands={[
          'agent_trace_list_runs',
          'agent_trace_get_events',
          'agent_trace_get_event',
          'agent_trace_export',
          'agent_trace_clear',
        ]}
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TraceToolbar
        filters={filters}
        livePaused={livePaused}
        selectedRunId={selectedRunId}
        onFilterChange={setFilters}
        onToggleLive={() => setLivePaused(!livePaused)}
        onRefresh={loadRuns}
        onExport={handleExport}
      />

      <div className="flex min-h-0 flex-1">
        {/* Run list */}
        <div className="flex w-48 shrink-0 flex-col overflow-hidden border-r border-border">
          {loading && runs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              加载中…
            </div>
          ) : (
            <TraceRunList
              runs={runs}
              selectedRunId={selectedRunId}
              onSelect={(runId) => selectRun(runId)}
            />
          )}
        </div>

        {/* Timeline */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-border">
          {loading && selectedRunId && rawEvents.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              加载中…
            </div>
          ) : (
            <TraceTimeline
              events={filteredEvents}
              selectedEventId={selectedEventId}
              onSelect={(id) => selectEvent(id)}
            />
          )}
        </div>

        {/* Event detail */}
        <div className="w-72 shrink-0 overflow-y-auto">
          {selectedEventId ? (
            <TraceEventDetail
              eventId={selectedEventId}
              inlineEvent={selectedEvent ?? undefined}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              选择事件查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
