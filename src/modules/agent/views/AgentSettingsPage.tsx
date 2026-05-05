/**
 * AgentSettingsPage.tsx — Agent 配置 CRUD 设置页。
 *
 * 后端命令：toolbox-plugin-ai 的 agent_list_configs / agent_get_config /
 *           agent_add_config / agent_update_config / agent_remove_config /
 *           agent_get_default_system_prompt（全部已注册）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import * as agentService from '../../ai-assistant/services/agent-service';
import * as llmProviderService from '../../ai-assistant/services/llm-provider-service';
import type { AgentConfig } from '../../ai-assistant/services/types';
import type { LLMProviderView } from '../../ai-assistant/services/llm-provider-service';

function getDefaultProvider(providers: LLMProviderView[]): LLMProviderView | undefined {
  return providers.find((provider) => provider.isActive) ?? providers[0];
}

function getProviderModels(
  provider: LLMProviderView | null | undefined,
  currentModel?: string,
): string[] {
  const models = new Set<string>();
  provider?.availableModels?.filter(Boolean).forEach((model) => models.add(model));
  if (provider?.model) models.add(provider.model);
  if (currentModel) models.add(currentModel);
  return Array.from(models);
}

function resolveModelForProviderChange(
  currentModel: string,
  previousProvider: LLMProviderView | null | undefined,
  nextProvider: LLMProviderView | null | undefined,
): string {
  if (!nextProvider) return currentModel;
  if (!currentModel.trim()) return nextProvider.model ?? '';
  const previousModels = getProviderModels(previousProvider);
  return previousModels.includes(currentModel) ? (nextProvider.model || currentModel) : currentModel;
}

function blankAgent(defaultPrompt: string, provider?: LLMProviderView): AgentConfig {
  return {
    id: '',
    name: '',
    description: '',
    instructions: defaultPrompt,
    model: provider?.model ?? '',
    providerId: provider?.id,
    maxIterations: 20,
    temperature: 0.7,
    autoApprove: false,
  };
}

export function AgentSettingsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgentConfig | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [providers, setProviders] = useState<LLMProviderView[]>([]);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, prompt, providerList] = await Promise.all([
        agentService.agentListConfigs(),
        agentService.agentGetDefaultSystemPrompt().catch(() => ''),
        llmProviderService.llmProviderList().catch(() => []),
      ]);
      setAgents(list.filter((agent) => !agentService.isInternalRuntimeAgentId(agent.id)));
      setDefaultPrompt(prompt);
      setProviders(providerList);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const defaultProvider = useMemo(() => getDefaultProvider(providers), [providers]);
  const providerById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );
  const editingProvider = useMemo(
    () => providers.find((provider) => provider.id === editing?.providerId) ?? null,
    [providers, editing?.providerId],
  );
  const modelOptions = useMemo(
    () => getProviderModels(editingProvider, editing?.model),
    [editingProvider, editing?.model],
  );

  const onAdd = useCallback(() => {
    setEditing(blankAgent(defaultPrompt, defaultProvider));
    setIsNew(true);
  }, [defaultPrompt, defaultProvider]);

  const onEdit = useCallback((a: AgentConfig) => {
    const providerId = a.providerId ?? defaultProvider?.id;
    const provider = providerId ? providerById.get(providerId) : undefined;
    setEditing({
      ...a,
      providerId,
      model: a.model || provider?.model || '',
    });
    setIsNew(false);
  }, [defaultProvider?.id, providerById]);

  const onCancel = useCallback(() => {
    setEditing(null);
    setIsNew(false);
  }, []);

  const onSave = useCallback(async () => {
    if (!editing) return;
    if (!editing.id.trim() || !editing.name.trim()) {
      setError('Agent ID 与名称不能为空');
      return;
    }
    if (!editing.providerId?.trim()) {
      setError('请选择 Agent 使用的 LLM Provider');
      return;
    }
    if (!editing.model.trim()) {
      setError('模型不能为空');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await agentService.agentAddConfig(editing);
      } else {
        await agentService.agentUpdateConfig(editing);
      }
      await reload();
      window.dispatchEvent(new Event('toolbox:agent-configs-updated'));
      setEditing(null);
      setIsNew(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [editing, isNew, reload]);

  const onDelete = useCallback(async (id: string) => {
    if (!confirm(`确认删除 agent "${id}"？此操作不可撤销。`)) return;
    try {
      await agentService.agentRemoveConfig(id);
      await reload();
      window.dispatchEvent(new Event('toolbox:agent-configs-updated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [reload]);

  const list = useMemo(() => agents, [agents]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> 加载 Agent 列表…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-foreground">Agent 配置</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            管理 AI 助手可用的 Agent 实例（system prompt、模型、工具、迭代上限）。
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void reload()}
            className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            title="刷新"
          >
            <RotateCcw className="h-3 w-3" />
            刷新
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3 w-3" />
            新建 Agent
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      )}

      {providers.length === 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-600">
          尚未配置任何 LLM Provider。请先到「LLM 提供商」页面新增一个 Provider。
        </div>
      )}

      {/* 列表 */}
      <div className="space-y-1.5">
        {list.length === 0 && !editing && (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
            尚未配置任何 Agent。点击右上角「新建 Agent」开始。
          </div>
        )}

        {list.map((a) => (
          <div
            key={a.id}
            className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/40"
          >
            <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground truncate">{a.name}</span>
                <span className="rounded bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                  {a.id}
                </span>
                {a.autoApprove && (
                  <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] text-amber-500">
                    自动审批
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                {a.description || '无描述'}
                {' · 提供商 '}
                {a.providerId ? (providerById.get(a.providerId)?.name ?? a.providerId) : '未绑定'}
                {' · 模型 '}
                {a.model}
                {' · 最多 '}
                {a.maxIterations ?? 20}
                {' 轮迭代'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => onEdit(a)}
                title="编辑"
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => void onDelete(a.id)}
                title="删除"
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 编辑表单 */}
      {editing && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">
              {isNew ? '新建 Agent' : `编辑 ${editing.name || editing.id}`}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              title="取消"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Agent ID *" hint="唯一标识，建议小写横线分隔">
              <input
                value={editing.id}
                onChange={(e) => setEditing({ ...editing, id: e.target.value })}
                disabled={!isNew}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary disabled:opacity-50"
                placeholder="default-assistant"
              />
            </Field>
            <Field label="名称 *">
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                placeholder="默认助手"
              />
            </Field>
            <Field label="描述" full>
              <input
                value={editing.description ?? ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
              />
            </Field>
            <Field label="LLM Provider *" hint="每个 Agent 可绑定独立 Provider，用于区分大模型与小模型任务。">
              <select
                value={editing.providerId ?? ''}
                onChange={(e) => {
                  const nextProviderId = e.target.value || undefined;
                  const previousProvider = providers.find((provider) => provider.id === editing.providerId);
                  const nextProvider = providers.find((provider) => provider.id === nextProviderId);
                  setEditing({
                    ...editing,
                    providerId: nextProviderId,
                    model: resolveModelForProviderChange(
                      editing.model,
                      previousProvider,
                      nextProvider,
                    ),
                  });
                }}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
              >
                <option value="">请选择 Provider</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}{provider.isActive ? '（当前激活）' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="模型" hint={editingProvider ? `当前 Provider：${editingProvider.name}` : '可手动输入未列出的模型名'}>
              <input
                list="model-options"
                value={editing.model}
                onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
              />
              <datalist id="model-options">
                {modelOptions.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </Field>
            <Field label="System Prompt" hint="这里保存 Agent 的基础 Prompt；运行时会在其后附加当前工作区上下文。" full>
              <div className="space-y-2">
                <textarea
                  value={editing.instructions}
                  onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
                  rows={6}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] font-mono outline-none focus:border-primary"
                />
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, instructions: defaultPrompt })}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    重置为系统默认 Prompt
                  </button>
                </div>
              </div>
            </Field>
            <Field label="最大迭代轮数">
              <input
                type="number"
                min={1}
                max={200}
                value={editing.maxIterations ?? 20}
                onChange={(e) =>
                  setEditing({ ...editing, maxIterations: Number(e.target.value) || 20 })
                }
                className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
              />
            </Field>
            <Field label="Temperature">
              <input
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={editing.temperature ?? 0.7}
                onChange={(e) =>
                  setEditing({ ...editing, temperature: Number(e.target.value) || 0 })
                }
                className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
              />
            </Field>
            <Field label="自动审批工具调用">
              <label className="flex h-[30px] items-center gap-2 text-[12px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={editing.autoApprove ?? false}
                  onChange={(e) => setEditing({ ...editing, autoApprove: e.target.checked })}
                />
                跳过工具调用审批（高风险，仅在受信任环境使用）
              </label>
            </Field>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-7 rounded-md border px-3 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              保存
            </button>
          </div>
        </div>
      )}
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
