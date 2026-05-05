/**
 * Agent Team service — 包装 team_* 和 agent_registry_* 后端命令。
 *
 * 上游实现：jinhe-team (private/rust-libs/jinhe-team)。
 */
import { callBackend } from '../../../services/backend-unavailable';

export interface TeamMember {
  agentId: string;
  roleInTeam: string;
  priority: number;
}

export interface TeamDto {
  id: string;
  name: string;
  strategy: string;
  members: TeamMember[];
  config?: Record<string, unknown> | null;
  description?: string;
  isBuiltin?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StrategyDescriptor {
  id: string;
  displayName: string;
  description: string;
  status: 'stable' | 'experimental' | 'planned';
}

export interface TeamMemberRunState {
  agentId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  output?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface TaskStatusDto {
  taskId: string;
  teamId?: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  input?: string;
  strategy?: string;
  memberStates?: TeamMemberRunState[];
  output?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface AgentRegistryEntry {
  agentId: string;
  name: string;
  role: string;
  description?: string | null;
  config: string;
  status: string;
  createdAt?: string;
  isBuiltin?: boolean;
  userModified?: boolean;
  tools?: string[] | null;
  systemPrompt?: string | null;
  maxIterations?: number | null;
}

interface RawTeamMember {
  agentId?: string;
  agent_id?: string;
  roleInTeam?: string;
  role_in_team?: string;
  priority?: number;
}

interface RawTeamDto {
  teamId?: string;
  id?: string;
  name?: string;
  strategy?: string;
  members?: RawTeamMember[];
  config?: Record<string, unknown> | null;
  description?: string | null;
  isBuiltin?: boolean;
  is_builtin?: boolean;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

interface RawStrategyDescriptor {
  id?: string;
  displayName?: string;
  display_name?: string;
  description?: string;
  status?: string;
}

interface RawTeamMemberRunState {
  agentId?: string;
  agent_id?: string;
  status?: TaskStatusDto['status'];
  output?: string | null;
  error?: string | null;
  startedAt?: string | null;
  started_at?: string | null;
  finishedAt?: string | null;
  finished_at?: string | null;
}

interface RawTaskStatusDto {
  taskId?: string;
  task_id?: string;
  teamId?: string;
  team_id?: string;
  status?: TaskStatusDto['status'];
  input?: string;
  strategy?: string;
  memberStates?: RawTeamMemberRunState[];
  member_states?: RawTeamMemberRunState[];
  result?: { finalOutput?: string; final_output?: string } | null;
  error?: string | null;
  startedAt?: string;
  started_at?: string;
  finishedAt?: string | null;
  finished_at?: string | null;
}

interface RawAgentRegistryEntry {
  agentId?: string;
  agent_id?: string;
  name?: string;
  role?: string;
  description?: string | null;
  config?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;
  isBuiltin?: boolean;
  is_builtin?: boolean;
  userModified?: boolean;
  user_modified?: boolean;
  tools?: string[] | null;
  systemPrompt?: string | null;
  system_prompt?: string | null;
  maxIterations?: number | null;
  max_iterations?: number | null;
}

function normalizeTeamMember(raw: RawTeamMember): TeamMember {
  return {
    agentId: raw.agentId ?? raw.agent_id ?? '',
    roleInTeam: raw.roleInTeam ?? raw.role_in_team ?? 'worker',
    priority: raw.priority ?? 0,
  };
}

function normalizeTeam(raw: RawTeamDto): TeamDto {
  return {
    id: raw.teamId ?? raw.id ?? '',
    name: raw.name ?? '',
    strategy: raw.strategy ?? 'sequential',
    members: (raw.members ?? []).map(normalizeTeamMember),
    config: raw.config ?? null,
    description: raw.description ?? undefined,
    isBuiltin: raw.isBuiltin ?? raw.is_builtin,
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  };
}

function normalizeStrategy(raw: RawStrategyDescriptor): StrategyDescriptor {
  const status = (raw.status ?? 'stable').toLowerCase();
  return {
    id: raw.id ?? '',
    displayName: raw.displayName ?? raw.display_name ?? raw.id ?? '',
    description: raw.description ?? '',
    status: status === 'planned' || status === 'experimental' ? status : 'stable',
  };
}

function normalizeMemberRunState(raw: RawTeamMemberRunState): TeamMemberRunState {
  return {
    agentId: raw.agentId ?? raw.agent_id ?? '',
    status: raw.status ?? 'pending',
    output: raw.output ?? undefined,
    error: raw.error ?? undefined,
    startedAt: raw.startedAt ?? raw.started_at ?? undefined,
    finishedAt: raw.finishedAt ?? raw.finished_at ?? undefined,
  };
}

function normalizeTaskStatus(raw: RawTaskStatusDto): TaskStatusDto {
  return {
    taskId: raw.taskId ?? raw.task_id ?? '',
    teamId: raw.teamId ?? raw.team_id ?? undefined,
    status: raw.status ?? 'pending',
    input: raw.input,
    strategy: raw.strategy,
    memberStates: (raw.memberStates ?? raw.member_states ?? []).map(normalizeMemberRunState),
    output: raw.result?.finalOutput ?? raw.result?.final_output ?? undefined,
    error: raw.error ?? undefined,
    startedAt: raw.startedAt ?? raw.started_at ?? undefined,
    finishedAt: raw.finishedAt ?? raw.finished_at ?? undefined,
  };
}

function normalizeRegistryEntry(raw: RawAgentRegistryEntry): AgentRegistryEntry {
  return {
    agentId: raw.agentId ?? raw.agent_id ?? '',
    name: raw.name ?? '',
    role: raw.role ?? 'worker',
    description: raw.description ?? undefined,
    config: raw.config ?? '',
    status: raw.status ?? 'registered',
    createdAt: raw.createdAt ?? raw.created_at,
    isBuiltin: raw.isBuiltin ?? raw.is_builtin,
    userModified: raw.userModified ?? raw.user_modified,
    tools: raw.tools ?? null,
    systemPrompt: raw.systemPrompt ?? raw.system_prompt ?? null,
    maxIterations: raw.maxIterations ?? raw.max_iterations ?? null,
  };
}

function notifyTeamsUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('toolbox:teams-updated'));
}

function normalizeTeamAndNotify(raw: RawTeamDto): TeamDto {
  const team = normalizeTeam(raw);
  notifyTeamsUpdated();
  return team;
}

// ── Team CRUD ──────────────────────────────────────────────────────────────

export const teamList = async (): Promise<TeamDto[]> => {
  const raw = await callBackend<RawTeamDto[]>('team_list');
  return raw.map(normalizeTeam);
};

export const teamCreate = (
  name: string,
  strategy: string,
  members: TeamMember[],
  config?: Record<string, unknown>,
  description?: string,
): Promise<TeamDto> =>
  callBackend<RawTeamDto>('team_create', { name, strategy, agents: members, config, description })
    .then(normalizeTeamAndNotify);

export const teamUpdate = (
  teamId: string,
  patch: Partial<Omit<TeamDto, 'id'>>,
): Promise<TeamDto> => callBackend<RawTeamDto>('team_update', { teamId, ...patch }).then(normalizeTeamAndNotify);

export const teamDelete = (teamId: string): Promise<void> =>
  callBackend<void>('team_delete', { teamId }).then((result) => {
    notifyTeamsUpdated();
    return result;
  });

export const teamListStrategies = async (): Promise<StrategyDescriptor[]> => {
  const raw = await callBackend<RawStrategyDescriptor[]>('team_list_strategies');
  return raw.map(normalizeStrategy);
};

// ── Team Run ───────────────────────────────────────────────────────────────

export const teamRun = (
  teamId: string,
  sessionId: string,
  input: string,
  maxConcurrency?: number,
): Promise<string> =>
  callBackend<string>('team_run', {
    teamId,
    sessionId,
    input,
    maxConcurrency: maxConcurrency ?? null,
  });

export const teamTaskStatus = (taskId: string): Promise<TaskStatusDto> =>
  callBackend<RawTaskStatusDto>('team_task_status', { taskId }).then(normalizeTaskStatus);

export const teamCancel = (taskId: string): Promise<void> =>
  callBackend<void>('team_cancel', { taskId });

export const teamPause = (taskId: string): Promise<boolean> =>
  callBackend<boolean>('team_pause', { taskId });

export const teamResume = (taskId: string): Promise<boolean> =>
  callBackend<boolean>('team_resume', { taskId });

// ── Agent Registry ─────────────────────────────────────────────────────────

export const agentRegistryList = (): Promise<AgentRegistryEntry[]> =>
  callBackend<RawAgentRegistryEntry[]>('agent_registry_list').then((raw) => raw.map(normalizeRegistryEntry));

export interface AgentRegistryAddInput {
  agentId: string;
  name: string;
  role?: string;
  description?: string;
  configJson?: string;
  tools?: string[];
  systemPrompt?: string;
  maxIterations?: number;
}

export const agentRegistryAdd = (input: AgentRegistryAddInput): Promise<AgentRegistryEntry> =>
  callBackend<RawAgentRegistryEntry>(
    'agent_registry_add',
    input as unknown as Record<string, unknown>,
  ).then(normalizeRegistryEntry);

export const agentRegistryRemove = (agentId: string): Promise<void> =>
  callBackend<void>('agent_registry_remove', { agentId });

export const agentRegistryResetDefaults = (): Promise<void> =>
  callBackend<void>('agent_registry_reset_defaults');
