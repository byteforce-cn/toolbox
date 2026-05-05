import { describe, expect, it } from 'vitest';
import type { TaskStatusDto } from '../../agent-team/services/team-service';
import { buildTeamAssistantMessage, isTeamTerminalStatus } from './team-run-view-model';

describe('team-run-view-model', () => {
  it('把 completed Team task 转成 assistant 消息和成员步骤', () => {
    const task: TaskStatusDto = {
      taskId: 'task-1',
      teamId: 'team-1',
      status: 'completed',
      output: '最终交付内容',
      memberStates: [
        { agentId: 'researcher', status: 'completed', output: 'facts' },
        { agentId: 'reviewer', status: 'completed', output: 'pass' },
      ],
    };

    const message = buildTeamAssistantMessage(
      task,
      '交付 Team',
      'session-1',
      new Date('2026-05-05T01:02:03.000Z'),
    );

    expect(message).toMatchObject({
      id: 'session-1:team:task-1',
      role: 'assistant',
      content: '最终交付内容',
      status: 'done',
      timestamp: '2026-05-05T01:02:03.000Z',
    });
    expect(message.taskSteps).toHaveLength(2);
    expect(message.taskSteps?.[0]).toMatchObject({
      id: 'team:task-1:researcher',
      name: 'researcher',
      status: 'completed',
      success: true,
      teamTaskId: 'task-1',
      agentId: 'researcher',
    });
  });

  it('把 failed Team task 转成错误消息', () => {
    const task: TaskStatusDto = {
      taskId: 'task-2',
      teamId: 'team-1',
      status: 'failed',
      error: 'planner failed',
      memberStates: [{ agentId: 'planner', status: 'failed', error: 'planner failed' }],
    };

    const message = buildTeamAssistantMessage(
      task,
      '规划 Team',
      'session-1',
      new Date('2026-05-05T01:02:03.000Z'),
    );

    expect(message.status).toBe('error');
    expect(message.content).toContain('Team「规划 Team」运行失败');
    expect(message.content).toContain('planner failed');
    expect(message.errors?.[0]).toMatchObject({ message: 'planner failed', recoverable: false });
    expect(message.taskSteps?.[0]).toMatchObject({ status: 'failed', success: false });
  });

  it('识别 Team 终态', () => {
    expect(isTeamTerminalStatus('completed')).toBe(true);
    expect(isTeamTerminalStatus('failed')).toBe(true);
    expect(isTeamTerminalStatus('cancelled')).toBe(true);
    expect(isTeamTerminalStatus('running')).toBe(false);
  });
});