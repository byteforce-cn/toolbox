/**
 * TraceToolbar.tsx — Agent 调用链路面板顶部工具条。
 * 功能：过滤（阶段、状态）、搜索、暂停实时、导出。
 */
import { Pause, Play, Download, RefreshCw } from 'lucide-react';
import type { AgentTraceEventPhase, AgentTraceEventStatus } from '../../services/types';
import type { AgentTraceFilters } from '../../store/agent-trace-store';

interface Props {
  filters: AgentTraceFilters;
  livePaused: boolean;
  selectedRunId: string | null;
  onFilterChange: (filters: Partial<AgentTraceFilters>) => void;
  onToggleLive: () => void;
  onRefresh: () => void;
  onExport: () => void;
}

const PHASE_OPTIONS: { value: AgentTraceEventPhase | ''; label: string }[] = [
  { value: '', label: '全部阶段' },
  { value: 'input', label: '输入' },
  { value: 'context', label: '上下文' },
  { value: 'model', label: '模型' },
  { value: 'thought', label: '思考' },
  { value: 'answer', label: '回答' },
  { value: 'tool', label: '工具' },
  { value: 'skill', label: 'Skill' },
  { value: 'mcp', label: 'MCP' },
  { value: 'lsp', label: 'LSP' },
  { value: 'system', label: '系统' },
  { value: 'done', label: '完成' },
  { value: 'error', label: '错误' },
];

const STATUS_OPTIONS: { value: AgentTraceEventStatus | ''; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'started', label: '进行中' },
  { value: 'streaming', label: '流式' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'aborted', label: '中止' },
];

export function TraceToolbar({
  filters,
  livePaused,
  selectedRunId,
  onFilterChange,
  onToggleLive,
  onRefresh,
  onExport,
}: Props) {
  return (
    <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5 text-xs">
      {/* Phase filter */}
      <select
        className="h-6 rounded border border-border bg-background px-1 text-xs"
        value={filters.phase ?? ''}
        onChange={(e) =>
          onFilterChange({ phase: (e.target.value as AgentTraceEventPhase) || undefined })
        }
      >
        {PHASE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Status filter */}
      <select
        className="h-6 rounded border border-border bg-background px-1 text-xs"
        value={filters.status ?? ''}
        onChange={(e) =>
          onFilterChange({ status: (e.target.value as AgentTraceEventStatus) || undefined })
        }
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Search */}
      <input
        className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs placeholder:text-muted-foreground"
        placeholder="搜索事件名、摘要…"
        value={filters.search ?? ''}
        onChange={(e) => onFilterChange({ search: e.target.value || undefined })}
      />

      {/* Refresh */}
      <button
        className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
        title="刷新"
        onClick={onRefresh}
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>

      {/* Pause live */}
      <button
        className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
        title={livePaused ? '恢复实时' : '暂停实时'}
        onClick={onToggleLive}
      >
        {livePaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </button>

      {/* Export */}
      <button
        className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent disabled:opacity-40"
        title="导出 JSON"
        disabled={!selectedRunId}
        onClick={onExport}
      >
        <Download className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
