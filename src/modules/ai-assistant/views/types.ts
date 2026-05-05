/**
 * views/types.ts — 视图层本地类型定义。
 * 避免依赖 jinhe 共享 UI 库，所有类型自包含于此模块。
 */
import type {
  ThinkingMetadata,
  StreamingMetadata,
  TokenUsage,
  ToolCall,
} from '../services/types';
import type { ReActProcessStep, ReActRunPhase } from '@byteforce/assistant';

// ── Timeline ───────────────────────────────────────────────────────────────

export interface AssistantTimelineItem {
  id: string;
  timestamp: string;
  kind: 'run' | 'plan' | 'tool' | 'proposal' | 'user' | 'assistant';
  title: string;
  detail?: string;
  status?: 'info' | 'success' | 'warning' | 'error';
  meta?: string;
}

// ── Task steps ─────────────────────────────────────────────────────────────

export interface StepExecutor {
  type: 'mainAgent' | 'subAgent';
  agentId?: string;
}

export interface TaskStep {
  id: string;
  name: string;
  status: 'pending' | 'preparing' | 'running' | 'retrying' | 'completed' | 'failed' | 'timeout';
  success?: boolean;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  resultPreview?: string;
  fullResult?: string;
  error?: string;
  teamTaskId?: string;
  teamId?: string;
  runId?: string;
  agentId?: string;
  executor?: StepExecutor;
  dependencies?: string[];
}

// ── Thinking segments ──────────────────────────────────────────────────────

export interface ThinkingSegment {
  id: string;
  content: string;
  meta: ThinkingMetadata | null;
  iteration: number;
  toolCalls?: ToolCall[];
  taskSteps?: TaskStep[];
}

// ── Chat messages & conversations ──────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  time: string;
  timestamp?: string;
  status?: 'streaming' | 'done' | 'error';
  thinking?: string;
  thinkingMeta?: ThinkingMetadata;
  thinkingSegments?: ThinkingSegment[];
  streamingMeta?: StreamingMetadata;
  tokenUsage?: TokenUsage;
  planSteps?: TaskStep[];
  toolCalls?: ToolCall[];
  taskSteps?: TaskStep[];
  errors?: Array<{ message: string; recoverable: boolean; timestamp?: string }>;
  reactSteps?: ReActProcessStep[];
  reactPhase?: ReActRunPhase;
  feedback?: 'helpful' | 'unhelpful' | null;
}

export interface Conversation {
  id: string;
  aiSessionId: string;
  messages: ChatMessage[];
  timeline: AssistantTimelineItem[];
  startedAt: string;
}
