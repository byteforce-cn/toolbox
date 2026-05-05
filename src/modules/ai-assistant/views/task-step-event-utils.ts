import type { ToolCall } from '../services/types';
import type { TaskStep } from './types';

interface ToolCallEndData {
  id?: unknown;
  success?: unknown;
  resultPreview?: unknown;
  fullResult?: unknown;
  teamTaskId?: unknown;
  teamId?: unknown;
  runId?: unknown;
  agentId?: unknown;
  error?: unknown;
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function computeDurationMs(startedAt?: string, completedAt?: string): number | undefined {
  if (!startedAt || !completedAt) return undefined;
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return undefined;
  return Math.max(0, completed - started);
}

export function createRunningTaskStep(toolCall: ToolCall, timestamp: string): TaskStep {
  return {
    id: toolCall.id,
    name: toolCall.name,
    status: 'running',
    startedAt: timestamp,
  };
}

export function completeTaskStep(step: TaskStep, data: ToolCallEndData, timestamp: string): TaskStep {
  const startedAt = step.startedAt ?? timestamp;
  const completedAt = timestamp;

  return {
    ...step,
    status: 'completed',
    success: typeof data.success === 'boolean' ? data.success : true,
    startedAt,
    completedAt,
    durationMs: computeDurationMs(startedAt, completedAt),
    resultPreview: toStringOrUndefined(data.resultPreview) ?? step.resultPreview,
    fullResult: toStringOrUndefined(data.fullResult) ?? step.fullResult,
    teamTaskId: toStringOrUndefined(data.teamTaskId) ?? step.teamTaskId,
    teamId: toStringOrUndefined(data.teamId) ?? step.teamId,
    runId: toStringOrUndefined(data.runId) ?? step.runId,
    agentId: toStringOrUndefined(data.agentId) ?? step.agentId,
    error: toStringOrUndefined(data.error) ?? step.error,
  };
}

export function upsertTaskStep(steps: TaskStep[], step: TaskStep): TaskStep[] {
  const existingIndex = steps.findIndex((item) => item.id === step.id);
  if (existingIndex === -1) {
    return [...steps, step];
  }

  const next = [...steps];
  next[existingIndex] = { ...next[existingIndex], ...step };
  return next;
}

export function updateTaskStepById(
  steps: TaskStep[],
  stepId: string,
  updater: (step: TaskStep) => TaskStep,
): TaskStep[] {
  return steps.map((step) => (step.id === stepId ? updater(step) : step));
}