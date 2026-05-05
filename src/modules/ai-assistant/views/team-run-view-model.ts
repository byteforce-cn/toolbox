import type { TaskStatusDto, TeamMemberRunState } from '../../agent-team/services/team-service';
import type { ChatMessage, TaskStep } from './types';

type TeamTerminalStatus = Extract<TaskStatusDto['status'], 'completed' | 'failed' | 'cancelled'>;

export function isTeamTerminalStatus(status: TaskStatusDto['status']): status is TeamTerminalStatus {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function buildTeamLiveMessage(
  task: TaskStatusDto,
  teamName: string | undefined,
  conversationId: string,
  now = new Date(),
): ChatMessage {
  const timestamp = now.toISOString();
  const name = teamName?.trim() || task.teamId || 'Team';
  const members = task.memberStates ?? [];
  const done = members.filter((m) => m.status === 'completed' || m.status === 'failed').length;
  const running = members.filter((m) => m.status === 'running');
  const runningNames = running.map((m) => m.agentId).join('、');
  const content = members.length === 0
    ? `Team「${name}」正在初始化...`
    : running.length > 0
      ? `Team「${name}」正在执行 ${runningNames}... (${done}/${members.length})`
      : `Team「${name}」调度中... (${done}/${members.length})`;

  return {
    id: `${conversationId}:team:live`,
    role: 'assistant',
    content,
    time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    timestamp,
    status: 'streaming',
    taskSteps: members.map((member) => mapTeamMemberStep(task.taskId, member)),
  };
}

export function buildTeamAssistantMessage(
  task: TaskStatusDto,
  teamName: string | undefined,
  conversationId: string,
  now = new Date(),
): ChatMessage {
  const timestamp = now.toISOString();
  const name = teamName?.trim() || task.teamId || 'Team';
  const isError = task.status === 'failed' || task.status === 'cancelled';
  const output = task.output?.trim();
  const error = task.error?.trim();

  return {
    id: `${conversationId}:team:${task.taskId || timestamp}`,
    role: 'assistant',
    content: buildTeamMessageContent(task, name, output, error),
    time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    timestamp,
    status: isError ? 'error' : 'done',
    taskSteps: task.memberStates?.map((member) => mapTeamMemberStep(task.taskId, member)) ?? [],
    errors: isError ? [{ message: error || teamStatusLabel(task.status), recoverable: false, timestamp }] : undefined,
  };
}

function buildTeamMessageContent(
  task: TaskStatusDto,
  teamName: string,
  output: string | undefined,
  error: string | undefined,
): string {
  if (task.status === 'completed') {
    return output || `Team「${teamName}」已完成。`;
  }

  if (task.status === 'cancelled') {
    return `Team「${teamName}」已取消。${error ? `\n\n${error}` : ''}`;
  }

  return `Team「${teamName}」运行失败。${error ? `\n\n${error}` : ''}`;
}

function mapTeamMemberStep(taskId: string, member: TeamMemberRunState): TaskStep {
  return {
    id: `team:${taskId}:${member.agentId}`,
    name: member.agentId,
    status: mapTeamMemberStatus(member.status),
    success: member.status === 'completed' ? true : member.status === 'failed' || member.status === 'cancelled' ? false : undefined,
    startedAt: member.startedAt,
    completedAt: member.finishedAt,
    resultPreview: member.output,
    error: member.error,
    teamTaskId: taskId,
    agentId: member.agentId,
    executor: { type: 'subAgent', agentId: member.agentId },
  };
}

function mapTeamMemberStatus(status: TeamMemberRunState['status']): TaskStep['status'] {
  if (status === 'completed') return 'completed';
  if (status === 'running') return 'running';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  if (status === 'paused') return 'preparing';
  return 'pending';
}

function teamStatusLabel(status: TaskStatusDto['status']): string {
  if (status === 'cancelled') return 'Team run cancelled';
  if (status === 'failed') return 'Team run failed';
  return `Team run ${status}`;
}