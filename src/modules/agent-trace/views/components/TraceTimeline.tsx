/**
 * TraceTimeline.tsx — Agent run 中间时间线视图。
 * 展示事件列表，按 sequence/timestamp 排列，支持折叠同 phase 的连续 delta 事件。
 */
import { useState } from 'react';
import type { AgentTraceEvent, AgentTraceEventPhase } from '../../services/types';
import { cn } from '@/lib/utils';

interface Props {
  events: AgentTraceEvent[];
  selectedEventId: string | null;
  onSelect: (eventId: string) => void;
}

const PHASE_COLORS: Record<string, string> = {
  input: 'text-blue-400',
  context: 'text-cyan-400',
  model: 'text-indigo-400',
  thought: 'text-purple-400',
  answer: 'text-emerald-400',
  tool: 'text-amber-400',
  skill: 'text-teal-400',
  mcp: 'text-orange-400',
  lsp: 'text-rose-400',
  approval: 'text-yellow-400',
  proposal: 'text-lime-400',
  memory: 'text-violet-400',
  system: 'text-slate-400',
  done: 'text-green-500',
  error: 'text-red-500',
};

const STATUS_ICON: Record<string, string> = {
  started: '◌',
  streaming: '◑',
  completed: '●',
  failed: '✕',
  aborted: '⊘',
  skipped: '—',
  cached: '◈',
};

function durationLabel(ms?: number): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function TraceTimeline({ events, selectedEventId, onSelect }: Props) {
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());

  if (events.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        选择左侧 Run 以查看事件
      </div>
    );
  }

  const togglePhase = (phase: AgentTraceEventPhase) => {
    setCollapsedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  };

  // Group consecutive events of same phase for collapsible display.
  type Group = { phase: AgentTraceEventPhase; events: AgentTraceEvent[] };
  const groups: Group[] = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (last && last.phase === event.phase) {
      last.events.push(event);
    } else {
      groups.push({ phase: event.phase, events: [event] });
    }
  }

  return (
    <div className="flex flex-col overflow-y-auto text-xs">
      {groups.map((group, gi) => {
        const isCollapsed = collapsedPhases.has(group.phase) && group.events.length > 1;
        const headerEvent = group.events[0];
        const lastEvent = group.events[group.events.length - 1];

        return (
          <div key={`${gi}-${headerEvent.id}`}>
            {/* Phase group header — only shown when there are multiple events */}
            {group.events.length > 1 && (
              <button
                className="flex w-full items-center gap-1 border-b border-border/40 px-2 py-0.5 text-left text-muted-foreground hover:bg-muted/20"
                onClick={() => togglePhase(group.phase)}
              >
                <span>{isCollapsed ? '▶' : '▼'}</span>
                <span className={cn('font-medium', PHASE_COLORS[group.phase])}>
                  {group.phase}
                </span>
                <span className="ml-auto">{group.events.length} 条</span>
                {isCollapsed && lastEvent.durationMs != null && (
                  <span className="ml-1 text-muted-foreground">
                    {durationLabel(lastEvent.durationMs)}
                  </span>
                )}
              </button>
            )}

            {/* Events */}
            {!isCollapsed &&
              group.events.map((event) => (
                <button
                  key={event.id}
                  className={cn(
                    'flex w-full items-center gap-2 border-b border-border/40 px-2 py-1 text-left hover:bg-accent',
                    selectedEventId === event.id && 'bg-accent'
                  )}
                  onClick={() => onSelect(event.id)}
                >
                  <span className={cn('shrink-0 w-3 text-center', PHASE_COLORS[event.phase])}>
                    {STATUS_ICON[event.status] ?? '○'}
                  </span>
                  <span className={cn('shrink-0 w-14 font-mono text-muted-foreground', PHASE_COLORS[event.phase])}>
                    {event.phase}
                  </span>
                  <span className="flex-1 truncate">{event.name}</span>
                  {event.summary && (
                    <span className="max-w-32 truncate text-muted-foreground">{event.summary}</span>
                  )}
                  {event.durationMs != null && (
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {durationLabel(event.durationMs)}
                    </span>
                  )}
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
}
