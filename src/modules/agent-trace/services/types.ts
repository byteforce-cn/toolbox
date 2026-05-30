/**
 * types.ts — TypeScript 类型定义，与 toolbox-agent-trace Rust crate 的结构体对齐。
 *
 * 命名规则：kebab-case 枚举值（Rust serde(rename_all = "kebab-case")），
 * camelCase 结构体字段（Rust serde(rename_all = "camelCase")）。
 */

export type AgentTraceEventSource =
  | 'assistant-ui'
  | 'agent-runtime'
  | 'model-provider'
  | 'tool-runtime'
  | 'skill-runtime'
  | 'mcp-runtime'
  | 'lsp-runtime'
  | 'approval-runtime'
  | 'proposal-runtime'
  | 'team-runtime';

export type AgentTraceEventPhase =
  | 'input'
  | 'context'
  | 'model'
  | 'thought'
  | 'answer'
  | 'tool'
  | 'skill'
  | 'mcp'
  | 'lsp'
  | 'approval'
  | 'proposal'
  | 'memory'
  | 'system'
  | 'done'
  | 'error';

export type AgentTraceEventStatus =
  | 'started'
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'skipped'
  | 'cached';

export interface AgentTraceRedactionInfo {
  truncated?: boolean;
  redactedFields?: string[];
}

export interface AgentTraceEvent {
  id: string;
  timestamp: string;
  sequence: number;
  sessionId?: string;
  runId?: string;
  agentId?: string;
  parentId?: string;
  correlationId?: string;
  source: AgentTraceEventSource;
  phase: AgentTraceEventPhase;
  name: string;
  status: AgentTraceEventStatus;
  durationMs?: number;
  summary?: string;
  inputPreview?: string;
  outputPreview?: string;
  detail?: Record<string, unknown>;
  redaction?: AgentTraceRedactionInfo;
}

export interface AgentTraceRunSummary {
  runId: string;
  sessionId?: string;
  agentId?: string;
  startedAt: string;
  finishedAt?: string;
  status: AgentTraceEventStatus;
  eventCount: number;
  inputPreview?: string;
}

export interface AgentTraceQuery {
  runId?: string;
  sessionId?: string;
  phase?: AgentTraceEventPhase;
  status?: AgentTraceEventStatus;
  search?: string;
  afterId?: string;
  limit?: number;
}

export interface AgentTraceRunQuery {
  sessionId?: string;
  limit?: number;
  offset?: number;
}

export type AgentTraceExportFormat = 'json' | 'ndjson';

export interface AgentTraceExportRequest {
  runId: string;
  format: AgentTraceExportFormat;
}

export interface AgentTraceClearRequest {
  runId?: string;
  beforeDays?: number;
}
