/**
 * agent-service.ts — 无 DI 的 Agent IPC 封装。
 * 所有方法直接调用 Tauri invoke()，供模块内部使用。
 */
import { listen } from '@tauri-apps/api/event';
import { invokeAI } from './invoke-ai';
import type {
  AgentConfig,
  AgentRealtimeEnvelope,
  AgentInstance,
  AgentRunRequest,
  CostUpdateData,
  AgentSessionHistory,
  AgentSessionSummary,
  ProposalApplyRequest,
  ProposalSessionPreview,
  ProposalSessionSummary,
  ProposalApplyResult,
  ProposalRecordContent,
  SessionSnapshotSummary,
  ToolUseSummaryDto,
} from './types';

export const AGENT_REALTIME_EVENT_CHANNEL = 'agent-realtime-event';
export const DEFAULT_ASSISTANT_AGENT_ID = 'default-assistant';
export const INTERNAL_RUNTIME_AGENT_PREFIX = '__runtime:';
export const DEFAULT_ASSISTANT_RUNTIME_AGENT_ID = `${INTERNAL_RUNTIME_AGENT_PREFIX}${DEFAULT_ASSISTANT_AGENT_ID}`;

export const isInternalRuntimeAgentId = (agentId: string): boolean =>
  agentId.startsWith(INTERNAL_RUNTIME_AGENT_PREFIX);

// ── Config CRUD ────────────────────────────────────────────────────────────

export const agentGetDefaultSystemPrompt = (): Promise<string> =>
  invokeAI<string>('agent_get_default_system_prompt');

/** 列出后端注册的所有 prompt 资源（资源名 -> Markdown 内容）。 */
export const agentListPromptResources = (): Promise<Record<string, string>> =>
  invokeAI<Record<string, string>>('agent_list_prompt_resources');

export const agentListConfigs = (): Promise<AgentConfig[]> =>
  invokeAI<AgentConfig[]>('agent_list_configs');

export const agentGetConfig = (agentId: string): Promise<AgentConfig | null> =>
  invokeAI<AgentConfig | null>('agent_get_config', { agentId });

export const agentAddConfig = (config: AgentConfig): Promise<AgentConfig> =>
  invokeAI<AgentConfig>('agent_add_config', { config });

export const agentUpdateConfig = (config: AgentConfig): Promise<AgentConfig> =>
  invokeAI<AgentConfig>('agent_update_config', { config });

export const agentRemoveConfig = (agentId: string): Promise<void> =>
  invokeAI<void>('agent_remove_config', { agentId });

// ── Runtime ────────────────────────────────────────────────────────────────

export const agentRun = (request: AgentRunRequest): Promise<AgentInstance> =>
  invokeAI<AgentInstance>('agent_run', request as unknown as Record<string, unknown>);

export const agentAbort = (instanceId: string): Promise<void> =>
  invokeAI<void>('agent_abort', { instanceId });

export const agentGetInstance = (instanceId: string): Promise<AgentInstance> =>
  invokeAI<AgentInstance>('agent_get_instance', { instanceId });

export const agentListSessions = (): Promise<AgentSessionSummary[]> =>
  invokeAI<AgentSessionSummary[]>('agent_list_sessions');

export const agentGetSessionHistory = (aiSessionId: string): Promise<AgentSessionHistory> =>
  invokeAI<AgentSessionHistory>('agent_get_session_history', { aiSessionId });

// ── Realtime events ───────────────────────────────────────────────────────

export const listenAgentRealtimeEvent = (cb: (event: AgentRealtimeEnvelope) => void): Promise<() => void> =>
  listen<AgentRealtimeEnvelope>(AGENT_REALTIME_EVENT_CHANNEL, (e) => cb(e.payload));

export interface AgentMessageFeedbackEvent {
  aiSessionId: string;
  action: 'helpful' | 'unhelpful' | 'clear' | string;
  detail?: string;
}

export interface AgentCostSnapshotUpdatedEvent {
  sessionId: string;
  modelUsage?: Record<string, CostUpdateData>;
  totalCostUsd?: number;
}

export const onAgentMessageFeedback = (
  handler: (event: AgentMessageFeedbackEvent) => void,
): Promise<() => void> =>
  listen<Record<string, unknown>>('agent-message-feedback', (event) => {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    handler({
      aiSessionId: String(payload.aiSessionId ?? payload.ai_session_id ?? ''),
      action: String(payload.action ?? ''),
      detail: payload.detail == null ? undefined : String(payload.detail),
    });
  }).then((unlisten) => unlisten);

export const onCostSnapshotUpdated = (
  handler: (event: AgentCostSnapshotUpdatedEvent) => void,
): Promise<() => void> =>
  listen<Record<string, unknown>>('cost-snapshot-updated', (event) => {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    handler({
      sessionId: String(payload.sessionId ?? payload.session_id ?? ''),
      modelUsage: payload.modelUsage as Record<string, CostUpdateData> | undefined,
      totalCostUsd:
        typeof payload.totalCostUsd === 'number'
          ? payload.totalCostUsd
          : typeof payload.total_cost_usd === 'number'
            ? payload.total_cost_usd
            : undefined,
    });
  }).then((unlisten) => unlisten);

// ── Proposals ─────────────────────────────────────────────────────────────

export const proposalGetPreview = (proposalSessionId: string): Promise<ProposalSessionPreview> =>
  invokeAI<ProposalSessionPreview>('proposal_get_preview', { proposalSessionId });

export const proposalListBySession = (aiSessionId: string): Promise<ProposalSessionSummary[]> =>
  invokeAI<ProposalSessionSummary[]>('proposal_list_by_session', { aiSessionId });

export const proposalGetRecordContent = (proposalRecordId: string): Promise<ProposalRecordContent> =>
  invokeAI<ProposalRecordContent>('proposal_get_record_content', { proposalRecordId });

export const proposalApply = (
  request: ProposalApplyRequest,
): Promise<ProposalApplyResult> =>
  invokeAI<ProposalApplyResult>('proposal_apply', request as unknown as Record<string, unknown>);

export const proposalReject = (proposalSessionId: string): Promise<void> =>
  invokeAI<void>('proposal_reject', { proposalSessionId });

// ── Session snapshots ──────────────────────────────────────────────────────

export const agentListSnapshots = (): Promise<SessionSnapshotSummary[]> =>
  invokeAI<SessionSnapshotSummary[]>('session_list_snapshots');

export const agentRecoverSession = (sessionId: string): Promise<void> =>
  invokeAI<void>('session_recover', { sessionId });

export const agentDeleteSnapshot = (sessionId: string): Promise<void> =>
  invokeAI<void>('session_delete_snapshot', { sessionId });

// ── Tool use summary ───────────────────────────────────────────────────────

export const agentGetToolSummary = (sessionId: string): Promise<ToolUseSummaryDto> =>
  invokeAI<ToolUseSummaryDto>('agent_get_tool_summary', { sessionId });
