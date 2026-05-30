/**
 * TraceRunList.tsx — 最近 Agent run 列表。
 */
import type { AgentTraceRunSummary } from '../../services/types';
import { cn } from '@/lib/utils';

interface Props {
  runs: AgentTraceRunSummary[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  aborted: 'bg-orange-400',
  started: 'bg-blue-400 animate-pulse',
  streaming: 'bg-yellow-400 animate-pulse',
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

export function TraceRunList({ runs, selectedRunId, onSelect }: Props) {
  if (runs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        暂无运行记录
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      {runs.map((run) => (
        <button
          key={run.runId}
          className={cn(
            'flex flex-col gap-0.5 border-b border-border px-3 py-2 text-left text-xs hover:bg-accent',
            selectedRunId === run.runId && 'bg-accent'
          )}
          onClick={() => onSelect(run.runId)}
        >
          <div className="flex items-center gap-1.5">
            <span
              className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[run.status] ?? 'bg-muted')}
            />
            <span className="truncate font-medium">{run.inputPreview ?? run.runId.slice(0, 8)}</span>
          </div>
          <div className="flex items-center gap-2 pl-3 text-muted-foreground">
            <span>{formatTime(run.startedAt)}</span>
            <span>{run.eventCount} 条</span>
          </div>
        </button>
      ))}
    </div>
  );
}
