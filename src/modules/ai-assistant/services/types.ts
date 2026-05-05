/**
 * AI Agent service types — mirror Rust-side structs.
 * Adapted from draft/jinhe; DI interface removed (toolbox uses direct invoke).
 */

/** Inline provider configuration (embedded in AgentConfig). */
export interface InlineProviderConfig {
  baseUrl: string;
  apiKey: string;
  providerType: 'openai' | 'anthropic' | 'custom' | 'gemini';
}

/** DTO for registering a provider via command. */
export interface ProviderConfigDto {
  baseUrl: string;
  apiKey: string;
  providerType: 'openai' | 'anthropic' | 'custom' | 'gemini';
  defaultModel: string;
}

/** Configuration for an AI agent. */
export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  model: string;
  providerId?: string;
  providerConfig?: InlineProviderConfig;
  /** `undefined` = all tools, `[]` = no tools, `['a']` = explicit allowlist. */
  tools?: string[];
  toolAccessMode?: 'strict_allowlist' | 'allowlist_with_runtime_essentials';
  maxIterations?: number;
  temperature?: number;
  maxTokens?: number;
  autoApprove?: boolean;
  contextWindow?: number;
  subagentEnabled?: boolean;
  subagentMaxDepth?: number;
  subagentAllowedAgents?: string[];
  subagentMaxIterations?: number;
  metadata?: Record<string, unknown>;
}

export type AgentRunStatus = 'running' | 'completed' | 'failed' | 'aborted';

/** A running agent instance. */
export interface AgentInstance {
  instanceId: string;
  aiSessionId: string;
  agentId: string;
  status: AgentRunStatus;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
}

/** A message in the agent conversation. */
export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  images?: string[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
  timestamp: string;
}

/** A tool call requested by the model. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  argsPreview?: string;
}

export type ThinkingCapability = 'unsupported' | 'tag_parsing' | 'native_blocks';
export type ThinkingSource = 'none' | 'tag_parsed' | 'native_block';
export type ThinkingRetention = 'none' | 'final_message';
export type StreamDeltaRetention = 'none';

export interface ProviderCapabilities {
  providerType: 'openai' | 'anthropic' | 'custom' | 'gemini';
  thinkingCapability: ThinkingCapability;
}

export interface ThinkingMetadata {
  providerType: 'openai' | 'anthropic' | 'custom' | 'gemini';
  capability: ThinkingCapability;
  source: ThinkingSource;
  retention: ThinkingRetention;
  persistedInHistory: boolean;
}

export interface StreamingMetadata {
  deltaRetention: StreamDeltaRetention;
  finalMessagePersistedInHistory: boolean;
  streamedCharCount: number;
}

/** Token usage statistics returned by the LLM provider. */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** State of a subagent execution (tracked in parent's context). */
export interface SubagentState {
  subagentInstanceId: string;
  agentId: string;
  task: string;
  depth: number;
  status: 'running' | 'completed' | 'failed';
  resultPreview?: string;
  error?: string;
  iterations?: number;
}

/** Request to run an agent. */
export interface AgentRunRequest {
  agentId: string;
  aiSessionId: string;
  runId?: string;
  input: string;
  images?: string[];
  context?: AgentMessage[];
}

export interface AgentSessionSummary {
  id: string;
  title: string;
  model: string;
  lastMessagePreview: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSessionMessageRecord {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown> & {
    thinkingMeta?: ThinkingMetadata;
    streamingMeta?: StreamingMetadata;
  };
  createdAt: string;
}

export interface AgentAuditLogEntry {
  id: number;
  sessionId?: string;
  action: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}

export interface AgentProposalAuditEntry {
  id: number;
  proposalSessionId: string;
  proposalRecordId?: string;
  actor: string;
  action: string;
  payloadJson?: Record<string, unknown>;
  createdAt: string;
  proposalSummary: string;
}

export interface AgentSessionHistory {
  aiSessionId: string;
  messages: AgentSessionMessageRecord[];
  auditLog: AgentAuditLogEntry[];
  proposalAuditLog: AgentProposalAuditEntry[];
}

export type ProposalSessionStatus =
  | 'open'
  | 'partially_applied'
  | 'applied'
  | 'rejected'
  | 'aborted'
  | 'superseded';

export type ProposalRecordStatus =
  | 'pending'
  | 'partially_applied'
  | 'applied'
  | 'rejected'
  | 'failed';

export interface ProposalRecordInput {
  requestId?: string;
  toolName: string;
  filePath: string;
  operationType: string;
  summary: string;
  oldContent: string;
  newContent: string;
  hunks: unknown[];
  patchOperation?: unknown;
}

export interface ProposalCreateRequest {
  aiSessionId: string;
  runId?: string;
  summary: string;
  planSteps?: string[];
  records: ProposalRecordInput[];
}

export interface ProposalApplyRequest {
  proposalSessionId: string;
  acceptedIds?: string[];
  recordSelections?: ProposalRecordApplySelection[];
}

// ── Realtime Streaming Protocol ────────────────────────────────────────────
// The authoritative reducer/UI types live in @byteforce/assistant.
export type {
  AgentRealtimeEnvelope,
  AgentRealtimeEvent,
  AgentRealtimeEventType as AgentRealtimeEventKind,
} from '@byteforce/assistant';

export interface ProposalRecordApplySelection {
  proposalRecordId: string;
  acceptedHunks?: string[];
}

export interface ProposalRejectRequest {
  proposalRecordId: string;
  actor?: string;
  reason?: string;
}

export interface ProposalDecisionLog {
  id: number;
  proposalSessionId: string;
  proposalRecordId?: string | null;
  actor: string;
  action: string;
  payloadJson?: unknown;
  createdAt: string;
}

export interface ProposalRecord {
  id: string;
  proposalSessionId: string;
  requestId?: string | null;
  toolName: string;
  filePath: string;
  operationType: string;
  status: ProposalRecordStatus;
  summary: string;
  oldContent: string;
  newContent: string;
  hunks: unknown[];
  patchOperation?: unknown;
  lastApplyResult?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalRecordPreview {
  id: string;
  proposalSessionId: string;
  requestId?: string | null;
  toolName: string;
  filePath: string;
  operationType: string;
  status: ProposalRecordStatus;
  summary: string;
  hunks: unknown[];
  patchOperation?: unknown;
  lastApplyResult?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalRecordContent {
  proposalSessionId: string;
  proposalRecordId: string;
  oldContent: string;
  newContent: string;
}

export interface ProposalSessionSummary {
  id: string;
  aiSessionId: string;
  runId?: string | null;
  summary: string;
  status: ProposalSessionStatus;
  planSteps: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  recordCount: number;
  pendingRecordCount: number;
}

export interface ProposalSession {
  id: string;
  aiSessionId: string;
  runId?: string | null;
  summary: string;
  status: ProposalSessionStatus;
  planSteps: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  records: ProposalRecord[];
  decisionLog: ProposalDecisionLog[];
}

export interface ProposalSessionPreview {
  id: string;
  aiSessionId: string;
  runId?: string | null;
  summary: string;
  status: ProposalSessionStatus;
  planSteps: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  records: ProposalRecordPreview[];
  decisionLog: ProposalDecisionLog[];
}

export interface ProposalApplyResult {
  record: ProposalRecord;
  session: ProposalSession;
  applyResult: {
    snapshotId: string;
    appliedHunks: number;
    skippedHunks: number;
    finalContent: string;
  };
}

// ── Extended event data types ──────────────────────────────────────────────

export interface CostUpdateData {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
}

export interface CompactionEventData {
  originalTokens: number;
  compactedTokens: number;
  savings: number;
  sessionId?: string;
}

export interface ModelFallbackData {
  originalModel: string;
  fallbackModel: string;
  reason: string;
}

export interface OutputRecoveryData {
  recoveredChars: number;
  method: string;
}

// ── Session snapshots ──────────────────────────────────────────────────────

export interface SessionSnapshotSummary {
  sessionId: string;
  timestamp: string;
  messageCount: number;
  iterationCount: number;
  costUsd: number;
  lastToolCall: string | null;
  gitBranch: string | null;
}

// ── Tool use summary ───────────────────────────────────────────────────────

export interface ToolUseSummaryDto {
  entries: ToolUseSummaryEntryDto[];
  totalCalls: number;
  estimatedTokensSaved: number;
}

export interface ToolUseSummaryEntryDto {
  toolName: string;
  argsPreview: string;
  resultPreview: string;
  truncated: boolean;
}
