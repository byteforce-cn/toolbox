import { describe, expect, it } from 'vitest';

import type { ToolCall } from '../services/types';
import {
  completeTaskStep,
  createRunningTaskStep,
  updateTaskStepById,
  upsertTaskStep,
} from './task-step-event-utils';

const TOOL_CALL: ToolCall = {
  id: 'tool-1',
  name: 'shell_run',
  arguments: { command: 'pwd' },
};

describe('task-step-event-utils', () => {
  it('creates a running step with the event timestamp', () => {
    expect(createRunningTaskStep(TOOL_CALL, '2026-05-03T10:00:00.000Z')).toMatchObject({
      id: 'tool-1',
      name: 'shell_run',
      status: 'running',
      startedAt: '2026-05-03T10:00:00.000Z',
    });
  });

  it('completes a step with duration and result metadata', () => {
    const running = createRunningTaskStep(TOOL_CALL, '2026-05-03T10:00:00.000Z');

    expect(completeTaskStep(running, {
      success: true,
      resultPreview: 'workspace path',
      fullResult: '[exit code 0]\n/workspace',
      teamTaskId: 'team-task-1',
      teamId: 'team-1',
      runId: 'run-1',
      agentId: 'default-assistant',
    }, '2026-05-03T10:00:01.250Z')).toMatchObject({
      status: 'completed',
      success: true,
      resultPreview: 'workspace path',
      fullResult: '[exit code 0]\n/workspace',
      teamTaskId: 'team-task-1',
      teamId: 'team-1',
      runId: 'run-1',
      agentId: 'default-assistant',
      durationMs: 1250,
    });
  });

  it('upserts and updates task steps by id', () => {
    const running = createRunningTaskStep(TOOL_CALL, '2026-05-03T10:00:00.000Z');
    const steps = upsertTaskStep([], running);
    const updated = updateTaskStepById(steps, 'tool-1', (step) => ({ ...step, success: false }));

    expect(updated).toHaveLength(1);
    expect(updated[0]?.success).toBe(false);
  });
});