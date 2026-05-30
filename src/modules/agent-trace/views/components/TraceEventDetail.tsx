/**
 * TraceEventDetail.tsx — 选中事件的结构化详情面板。
 * 展示：来源、阶段、状态、耗时、摘要、输入输出预览、detail JSON。
 */
import { agentTraceGetEvent } from '../../services/agent-trace-service';
import { useEffect, useState } from 'react';
import type { AgentTraceEvent } from '../../services/types';
import { TraceJsonViewer } from './TraceJsonViewer';

interface Props {
  eventId: string;
  inlineEvent?: AgentTraceEvent;
}

const PHASE_LABEL: Record<string, string> = {
  input: '输入',
  context: '上下文',
  model: '模型',
  thought: '思考',
  answer: '回答',
  tool: '工具',
  skill: 'Skill',
  mcp: 'MCP',
  lsp: 'LSP',
  approval: '审批',
  proposal: 'Proposal',
  memory: '记忆',
  system: '系统',
  done: '完成',
  error: '错误',
};

const STATUS_COLOR: Record<string, string> = {
  started: 'text-blue-500',
  streaming: 'text-yellow-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
  aborted: 'text-orange-500',
  skipped: 'text-muted-foreground',
  cached: 'text-purple-500',
};

function Row({ label, value }: { label: string; value?: string | number }) {
  if (value == null) return null;
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="break-all font-mono">{String(value)}</span>
    </div>
  );
}

export function TraceEventDetail({ eventId, inlineEvent }: Props) {
  const [event, setEvent] = useState<AgentTraceEvent | null>(inlineEvent ?? null);
  const [loading, setLoading] = useState(!inlineEvent);

  useEffect(() => {
    if (inlineEvent) {
      setEvent(inlineEvent);
      return;
    }
    setLoading(true);
    agentTraceGetEvent(eventId)
      .then((e) => setEvent(e))
      .finally(() => setLoading(false));
  }, [eventId, inlineEvent]);

  if (loading) {
    return <div className="p-3 text-xs text-muted-foreground">加载中…</div>;
  }
  if (!event) {
    return <div className="p-3 text-xs text-muted-foreground">事件不存在</div>;
  }

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{event.name}</span>
        <span className={`text-xs ${STATUS_COLOR[event.status] ?? ''}`}>{event.status}</span>
      </div>

      <div className="flex flex-col gap-1">
        <Row label="来源" value={event.source} />
        <Row label="阶段" value={PHASE_LABEL[event.phase] ?? event.phase} />
        <Row label="时间" value={event.timestamp} />
        <Row label="耗时" value={event.durationMs != null ? `${event.durationMs} ms` : undefined} />
        <Row label="Run" value={event.runId} />
        <Row label="Session" value={event.sessionId} />
        <Row label="Agent" value={event.agentId} />
        <Row label="关联 ID" value={event.correlationId} />
        <Row label="父 ID" value={event.parentId} />
        <Row label="摘要" value={event.summary} />
        {/* Skill-specific: show actual skill name from input args */}
        {event.phase === 'skill' && !!(event.detail as Record<string, unknown>)?.input && (
          <Row
            label="技能名"
            value={((event.detail as Record<string, unknown>).input as Record<string, unknown>)?.skill_name as string}
          />
        )}
        {/* MCP-specific: parse server/tool from detail */}
        {event.phase === 'mcp' && !!(event.detail as Record<string, unknown>)?.mcpServer && (
          <>
            <Row label="MCP 服务器" value={(event.detail as Record<string, unknown>).mcpServer as string} />
            <Row label="MCP 工具" value={(event.detail as Record<string, unknown>).mcpTool as string} />
          </>
        )}
      </div>

      {event.inputPreview && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">输入预览</span>
          <pre className="max-h-32 overflow-auto rounded bg-muted/30 p-2 text-xs font-mono whitespace-pre-wrap break-words">
            {event.inputPreview}
          </pre>
        </div>
      )}

      {event.outputPreview && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">输出预览</span>
          <pre className="max-h-32 overflow-auto rounded bg-muted/30 p-2 text-xs font-mono whitespace-pre-wrap break-words">
            {event.outputPreview}
          </pre>
        </div>
      )}

      {event.detail && <TraceJsonViewer value={event.detail} />}

      {event.redaction?.redactedFields && event.redaction.redactedFields.length > 0 && (
        <div className="text-xs text-muted-foreground">
          已脱敏字段：{event.redaction.redactedFields.join(', ')}
          {event.redaction.truncated ? '（已截断）' : ''}
        </div>
      )}
    </div>
  );
}
