import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, Pencil, Plus, RotateCcw, Save, Trash2, Users, X } from 'lucide-react';
import * as teamService from '../services/team-service';
import type { AgentRegistryAddInput, AgentRegistryEntry, StrategyDescriptor, TeamDto, TeamMember } from '../services/team-service';
import * as agentService from '../../ai-assistant/services/agent-service';
import type { AgentConfig } from '../../ai-assistant/services/types';
import { isBackendUnavailable } from '../../../services/backend-unavailable';
import { BackendUnavailableNotice } from '../../../components/BackendUnavailableNotice';

const PENDING_COMMANDS = [
  'team_list',
  'team_create',
  'team_update',
  'team_delete',
  'team_run',
  'team_task_status',
  'team_cancel',
  'team_pause',
  'team_resume',
  'team_list_strategies',
  'agent_registry_list',
  'agent_registry_add',
  'agent_registry_remove',
  'agent_registry_reset_defaults',
];

interface TeamFormState {
  id?: string;
  name: string;
  description: string;
  strategy: string;
  members: TeamMember[];
  configText: string;
}

interface RegistryFormState {
  agentId: string;
  name: string;
  role: string;
  description: string;
  configText: string;
  toolsText: string;
  systemPrompt: string;
  maxIterations: string;
}

function blankTeam(strategies: StrategyDescriptor[]): TeamFormState {
  return {
    name: '',
    description: '',
    strategy: strategies[0]?.id ?? 'sequential',
    members: [],
    configText: '',
  };
}

function blankRegistry(): RegistryFormState {
  return {
    agentId: '',
    name: '',
    role: 'worker',
    description: '',
    configText: '',
    toolsText: '',
    systemPrompt: '',
    maxIterations: '',
  };
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const value = JSON.parse(trimmed);
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('配置 JSON 必须是对象');
  }
  return value as Record<string, unknown>;
}

function parseCsv(text: string): string[] | undefined {
  const values = text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function stringifyJson(value: unknown): string {
  if (!value) return '';
  return JSON.stringify(value, null, 2);
}

function buildRegistryTemplate(agent: AgentConfig): RegistryFormState {
  return {
    agentId: agent.id,
    name: agent.name,
    role: 'worker',
    description: agent.description ?? '',
    configText: stringifyJson({
      model: agent.model,
      providerId: agent.providerId,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      contextWindow: agent.contextWindow,
      metadata: agent.metadata,
    }),
    toolsText: (agent.tools ?? []).join(', '),
    systemPrompt: agent.instructions,
    maxIterations: agent.maxIterations ? String(agent.maxIterations) : '',
  };
}

export function AgentTeamSettingsPage() {
  const [teams, setTeams] = useState<TeamDto[]>([]);
  const [strategies, setStrategies] = useState<StrategyDescriptor[]>([]);
  const [registryEntries, setRegistryEntries] = useState<AgentRegistryEntry[]>([]);
  const [agentTemplates, setAgentTemplates] = useState<AgentConfig[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamFormState | null>(null);
  const [isNewTeam, setIsNewTeam] = useState(false);
  const [editingRegistry, setEditingRegistry] = useState<RegistryFormState | null>(null);
  const [isNewRegistry, setIsNewRegistry] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamList, strategyList, registryList, agents] = await Promise.all([
        teamService.teamList(),
        teamService.teamListStrategies(),
        teamService.agentRegistryList(),
        agentService.agentListConfigs().catch(() => []),
      ]);
      setTeams(teamList);
      setStrategies(strategyList);
      setRegistryEntries(registryList);
      setAgentTemplates(agents.filter((agent) => !agentService.isInternalRuntimeAgentId(agent.id)));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const registryIds = useMemo(() => registryEntries.map((entry) => entry.agentId), [registryEntries]);

  const handleAddTeam = useCallback(() => {
    setEditingTeam(blankTeam(strategies));
    setIsNewTeam(true);
  }, [strategies]);

  const handleEditTeam = useCallback((team: TeamDto) => {
    setEditingTeam({
      id: team.id,
      name: team.name,
      description: team.description ?? '',
      strategy: team.strategy,
      members: team.members,
      configText: stringifyJson(team.config),
    });
    setIsNewTeam(false);
  }, []);

  const handleSaveTeam = useCallback(async () => {
    if (!editingTeam) return;
    if (!editingTeam.name.trim()) {
      setError('Team 名称不能为空');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const config = parseJsonObject(editingTeam.configText);
      const payload = {
        name: editingTeam.name.trim(),
        strategy: editingTeam.strategy,
        members: editingTeam.members.filter((member) => member.agentId.trim()),
        config,
        description: editingTeam.description.trim() || undefined,
      };

      if (isNewTeam) {
        await teamService.teamCreate(
          payload.name,
          payload.strategy,
          payload.members,
          payload.config,
          payload.description,
        );
      } else if (editingTeam.id) {
        await teamService.teamUpdate(editingTeam.id, payload);
      }

      setEditingTeam(null);
      setIsNewTeam(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [editingTeam, isNewTeam, reload]);

  const handleDeleteTeam = useCallback(async (id: string) => {
    if (!confirm(`确认删除 Team "${id}"？`)) return;
    try {
      await teamService.teamDelete(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [reload]);

  const handleAddRegistry = useCallback(() => {
    setEditingRegistry(blankRegistry());
    setIsNewRegistry(true);
  }, []);

  const handleEditRegistry = useCallback((entry: AgentRegistryEntry) => {
    setEditingRegistry({
      agentId: entry.agentId,
      name: entry.name,
      role: entry.role,
      description: entry.description ?? '',
      configText: entry.config,
      toolsText: (entry.tools ?? []).join(', '),
      systemPrompt: entry.systemPrompt ?? '',
      maxIterations: entry.maxIterations ? String(entry.maxIterations) : '',
    });
    setIsNewRegistry(false);
  }, []);

  const handleSaveRegistry = useCallback(async () => {
    if (!editingRegistry) return;
    if (!editingRegistry.agentId.trim() || !editingRegistry.name.trim()) {
      setError('Registry Agent ID 与名称不能为空');
      return;
    }

    const input: AgentRegistryAddInput = {
      agentId: editingRegistry.agentId.trim(),
      name: editingRegistry.name.trim(),
      role: editingRegistry.role.trim() || 'worker',
      description: editingRegistry.description.trim() || undefined,
      configJson: editingRegistry.configText.trim() || undefined,
      tools: parseCsv(editingRegistry.toolsText),
      systemPrompt: editingRegistry.systemPrompt.trim() || undefined,
      maxIterations: editingRegistry.maxIterations.trim()
        ? Number(editingRegistry.maxIterations)
        : undefined,
    };

    try {
      setSaving(true);
      setError(null);
      await teamService.agentRegistryAdd(input);
      setEditingRegistry(null);
      setIsNewRegistry(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [editingRegistry, reload]);

  const handleDeleteRegistry = useCallback(async (agentId: string) => {
    if (!confirm(`确认移除 Registry Agent "${agentId}"？`)) return;
    try {
      await teamService.agentRegistryRemove(agentId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [reload]);

  const handleResetRegistry = useCallback(async () => {
    if (!confirm('确认恢复内置 Agent/Team 默认模板？这会覆盖内置模板的用户修改标记。')) return;
    try {
      await teamService.agentRegistryResetDefaults();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [reload]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> 加载 Team 列表…
      </div>
    );
  }

  if (error && isBackendUnavailable(error)) {
    return (
      <BackendUnavailableNotice
        title="Agent Team 设置"
        description="Agent Team 用于将多个 Agent 按指定策略（顺序 / 并行 / 路由）协作执行复杂任务。"
        pendingCommands={PENDING_COMMANDS}
        hint="后端命令已在 toolbox-plugin-ai/src/commands/team.rs 注册（Phase 2，jinhe-team crate 已迁入 private/rust-libs/）。若仍显示此页，请检查 Tauri 构建产物是否包含最新 toolbox-plugin-ai。"
      />
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
        加载失败：{error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold text-foreground">Agent Team</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            管理 Team 模板、策略说明和 Agent Registry。当前后端已支持完整配置管理；执行编排仍以后续 TeamManager 接线为准。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          刷新
        </button>
      </div>

      {error !== null && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-foreground">策略目录</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">用于选择 Team 的编排方式。</p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {strategies.map((strategy) => (
            <div key={strategy.id} className="rounded-lg border px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{strategy.displayName}</span>
                <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                  {strategy.status}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{strategy.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-foreground">Team 模板</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">管理 Team 的成员、策略和配置 JSON。</p>
          </div>
          <button
            type="button"
            onClick={handleAddTeam}
            className="flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3 w-3" />
            新建 Team
          </button>
        </div>

        {teams.length === 0 && !editingTeam ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
            尚未配置任何 Team。
          </div>
        ) : (
          <div className="space-y-1.5">
            {teams.map((team) => (
              <div key={team.id} className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/40">
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{team.name}</span>
                    <span className="rounded bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                      {team.strategy}
                    </span>
                    {team.isBuiltin && (
                      <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] text-amber-500">
                        内置
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                    {team.description || '无描述'} · {team.members.length} 名成员
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => handleEditTeam(team)}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteTeam(team.id)}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {editingTeam && (
          <div className="mt-4 rounded-lg border bg-background p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">
                {isNewTeam ? '新建 Team' : `编辑 ${editingTeam.name || editingTeam.id}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTeam(null)}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="名称 *">
                <input
                  value={editingTeam.name}
                  onChange={(event) => setEditingTeam({ ...editingTeam, name: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                />
              </Field>
              <Field label="策略">
                <select
                  value={editingTeam.strategy}
                  onChange={(event) => setEditingTeam({ ...editingTeam, strategy: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                >
                  {strategies.map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>{strategy.displayName}</option>
                  ))}
                </select>
              </Field>
              <Field label="描述" full>
                <input
                  value={editingTeam.description}
                  onChange={(event) => setEditingTeam({ ...editingTeam, description: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                />
              </Field>
              <Field label="成员" hint="成员 agentId 建议先在下方 Agent Registry 中注册；这里支持自由调整角色与优先级。" full>
                <div className="space-y-2">
                  {editingTeam.members.map((member, index) => (
                    <div key={`${member.agentId}-${index}`} className="grid grid-cols-[1.3fr_1fr_120px_32px] gap-2">
                      <input
                        list="team-agent-options"
                        value={member.agentId}
                        onChange={(event) => {
                          const members = [...editingTeam.members];
                          members[index] = { ...members[index], agentId: event.target.value };
                          setEditingTeam({ ...editingTeam, members });
                        }}
                        className="rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                        placeholder="agent-id"
                      />
                      <input
                        value={member.roleInTeam}
                        onChange={(event) => {
                          const members = [...editingTeam.members];
                          members[index] = { ...members[index], roleInTeam: event.target.value };
                          setEditingTeam({ ...editingTeam, members });
                        }}
                        className="rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                        placeholder="role"
                      />
                      <input
                        type="number"
                        value={member.priority}
                        onChange={(event) => {
                          const members = [...editingTeam.members];
                          members[index] = { ...members[index], priority: Number(event.target.value) || 0 };
                          setEditingTeam({ ...editingTeam, members });
                        }}
                        className="rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                        placeholder="priority"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const members = editingTeam.members.filter((_, memberIndex) => memberIndex !== index);
                          setEditingTeam({ ...editingTeam, members });
                        }}
                        className="flex h-[34px] items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <datalist id="team-agent-options">
                    {registryIds.map((agentId) => (
                      <option key={agentId} value={agentId} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={() => setEditingTeam({
                      ...editingTeam,
                      members: [...editingTeam.members, { agentId: registryIds[0] ?? '', roleInTeam: 'worker', priority: editingTeam.members.length }],
                    })}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    + 添加成员
                  </button>
                </div>
              </Field>
              <Field label="Config JSON" hint="可选，需为 JSON 对象。" full>
                <textarea
                  rows={5}
                  value={editingTeam.configText}
                  onChange={(event) => setEditingTeam({ ...editingTeam, configText: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-[12px] outline-none focus:border-primary"
                  placeholder={"{\n  \"maxConcurrency\": 2\n}"}
                />
              </Field>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingTeam(null)}
                className="h-7 rounded-md border px-3 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSaveTeam()}
                disabled={saving}
                className="flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                保存 Team
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-foreground">Agent Registry</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">Team 模板引用的 Agent 元数据与默认提示词。</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleResetRegistry()}
              className="h-7 rounded-md border px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              恢复内置模板
            </button>
            <button
              type="button"
              onClick={handleAddRegistry}
              className="flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-3 w-3" />
              新建 Registry Agent
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          {registryEntries.map((entry) => (
            <div key={entry.agentId} className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/40">
              <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{entry.name}</span>
                  <span className="rounded bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                    {entry.agentId}
                  </span>
                  {entry.isBuiltin && (
                    <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] text-amber-500">
                      内置
                    </span>
                  )}
                  {entry.userModified && (
                    <span className="rounded-full bg-blue-500/15 px-1.5 py-px text-[10px] text-blue-500">
                      已改写
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                  {entry.description || '无描述'} · 角色 {entry.role}
                  {entry.maxIterations ? ` · 最多 ${entry.maxIterations} 轮` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => handleEditRegistry(entry)}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteRegistry(entry.agentId)}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {editingRegistry && (
          <div className="mt-4 rounded-lg border bg-background p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">
                {isNewRegistry ? '新建 Registry Agent' : `编辑 ${editingRegistry.agentId}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditingRegistry(null)}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {agentTemplates.length > 0 && (
              <Field label="从 Agent 设置导入" hint="可快速带入 model/provider/prompt 到 registry 配置。" full>
                <select
                  defaultValue=""
                  onChange={(event) => {
                    const template = agentTemplates.find((agent) => agent.id === event.target.value);
                    if (!template) return;
                    setEditingRegistry(buildRegistryTemplate(template));
                  }}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                >
                  <option value="">选择 Agent 模板</option>
                  {agentTemplates.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name} ({agent.id})</option>
                  ))}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Agent ID *">
                <input
                  value={editingRegistry.agentId}
                  onChange={(event) => setEditingRegistry({ ...editingRegistry, agentId: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                />
              </Field>
              <Field label="名称 *">
                <input
                  value={editingRegistry.name}
                  onChange={(event) => setEditingRegistry({ ...editingRegistry, name: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                />
              </Field>
              <Field label="角色">
                <input
                  value={editingRegistry.role}
                  onChange={(event) => setEditingRegistry({ ...editingRegistry, role: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                />
              </Field>
              <Field label="最大迭代轮数">
                <input
                  type="number"
                  min={1}
                  value={editingRegistry.maxIterations}
                  onChange={(event) => setEditingRegistry({ ...editingRegistry, maxIterations: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                />
              </Field>
              <Field label="描述" full>
                <input
                  value={editingRegistry.description}
                  onChange={(event) => setEditingRegistry({ ...editingRegistry, description: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                />
              </Field>
              <Field label="工具白名单" hint="逗号分隔；留空表示由 Team 运行时决定。" full>
                <input
                  value={editingRegistry.toolsText}
                  onChange={(event) => setEditingRegistry({ ...editingRegistry, toolsText: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                  placeholder="fs_read_file, shell_run"
                />
              </Field>
              <Field label="System Prompt" full>
                <textarea
                  rows={5}
                  value={editingRegistry.systemPrompt}
                  onChange={(event) => setEditingRegistry({ ...editingRegistry, systemPrompt: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-[12px] outline-none focus:border-primary"
                />
              </Field>
              <Field label="Config JSON" hint="可留空；通常用于保存 model/provider 等额外元数据。" full>
                <textarea
                  rows={5}
                  value={editingRegistry.configText}
                  onChange={(event) => setEditingRegistry({ ...editingRegistry, configText: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-[12px] outline-none focus:border-primary"
                />
              </Field>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingRegistry(null)}
                className="h-7 rounded-md border px-3 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSaveRegistry()}
                disabled={saving}
                className="flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                保存 Registry Agent
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  full,
  children,
}: {
  label: string;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="mb-1 block text-[11px] font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
