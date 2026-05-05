/**
 * LLMProviderSettingsPage.tsx — LLM 提供商管理设置页面。
 * 仅维护用户自定义的 provider 实例：provider type / base URL / API key / 默认模型。
 */
import { useState, useEffect, useCallback } from 'react';
import { Cpu, Plus, Zap, CheckCircle2, XCircle, Loader2, Pencil, Trash2, Star } from 'lucide-react';
import {
  llmProviderList,
  llmProviderUpdate,
  llmProviderSetActive,
  llmProviderDelete,
  llmProviderTestConnection,
} from '../services/llm-provider-service';
import type { LLMProviderView, LLMProviderUpdate } from '../services/llm-provider-service';
import { toErrorMessage } from '../services/error-message';
import { LLM_PROVIDER_TYPE_OPTIONS, type LLMProviderType } from '../services/llm-provider/types';

function getProviderTypeLabel(providerType: LLMProviderType): string {
  return LLM_PROVIDER_TYPE_OPTIONS.find((option) => option.value === providerType)?.label ?? providerType;
}

function isLocalEndpoint(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    const host = url.hostname.toLowerCase();
    return host === 'localhost'
      || host === '127.0.0.1'
      || host === '0.0.0.0'
      || host === '::1'
      || host === '[::1]'
      || host.endsWith('.local');
  } catch {
    return false;
  }
}

function createProviderId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${slug || 'llm-provider'}-${suffix}`;
}

// ─── Provider Card ──────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: LLMProviderView;
  onSetActive: (id: string) => void;
  onTest: (id: string) => Promise<void>;
  onEdit: (provider: LLMProviderView) => void;
  onDelete: (id: string) => void;
  isTesting: boolean;
  testResult: boolean | null;
}

function ProviderCard({
  provider, onSetActive, onTest, onEdit, onDelete, isTesting, testResult,
}: ProviderCardProps) {
  const localEndpoint = isLocalEndpoint(provider.baseUrl);

  return (
    <div className={[
      'group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
      provider.isActive
        ? 'border-[--primary]/25 bg-[--primary]/5'
        : 'border-[--border] bg-[--card] hover:bg-[--muted]/40',
    ].join(' ')}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[--border] bg-[--muted]/35">
        <Cpu size={16} className="text-[--muted-foreground]" />
      </div>

      {/* 名称 + 元信息 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-[--foreground] truncate">{provider.name}</span>
          <span className="rounded-full bg-[--muted] px-1.5 py-px text-[10px] text-[--muted-foreground] shrink-0">
            {getProviderTypeLabel(provider.providerType)}
          </span>
          {localEndpoint && (
            <span className="rounded-full bg-emerald-500/12 px-1.5 py-px text-[10px] text-emerald-600 shrink-0">
              本地
            </span>
          )}
          {provider.isActive && (
            <span className="rounded-full bg-[--primary]/15 px-1.5 py-px text-[10px] font-medium text-[--primary] shrink-0">
              默认
            </span>
          )}
          {testResult === true && (
            <span className="flex items-center gap-0.5 text-[10px] text-green-500 shrink-0">
              <CheckCircle2 size={10} /> 已连通
            </span>
          )}
          {testResult === false && (
            <span className="flex items-center gap-0.5 text-[10px] text-destructive shrink-0">
              <XCircle size={10} /> 失败
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-[--muted-foreground] truncate">
          <span className="font-mono">{provider.maskedApiKey || (localEndpoint ? '本地端点，无需 API Key' : '未配置 API Key')}</span>
          {provider.model && <span className="ml-2 opacity-70">· {provider.model}</span>}
        </p>
        <p className="mt-0.5 truncate font-mono text-[10px] text-[--muted-foreground]/75">{provider.baseUrl}</p>
      </div>

      {/* 操作按钮（hover 显示） */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" onClick={() => onTest(provider.id)}
          disabled={isTesting} title="测试连接"
          className="flex h-6 w-6 items-center justify-center rounded text-[--muted-foreground] hover:bg-[--muted] hover:text-[--foreground] disabled:opacity-30 transition-colors">
          {isTesting ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
        </button>
        {!provider.isActive && (
          <button type="button" onClick={() => onSetActive(provider.id)} title="设为默认"
            className="flex h-6 w-6 items-center justify-center rounded text-[--muted-foreground] hover:bg-[--muted] hover:text-amber-500 transition-colors">
            <Star size={12} />
          </button>
        )}
        <button type="button" onClick={() => onEdit(provider)} title="编辑"
          className="flex h-6 w-6 items-center justify-center rounded text-[--muted-foreground] hover:bg-[--muted] hover:text-[--foreground] transition-colors">
          <Pencil size={12} />
        </button>
        <button type="button" onClick={() => onDelete(provider.id)} title="删除"
          className="flex h-6 w-6 items-center justify-center rounded text-[--muted-foreground] hover:bg-[--muted] hover:text-destructive transition-colors">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Provider Form ──────────────────────────────────────────────────────────

interface ProviderFormProps {
  editingProvider: LLMProviderView | null;
  onSave: (providerId: string, update: LLMProviderUpdate & { name: string }) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

function ProviderForm({ editingProvider, onSave, onCancel, isSaving }: ProviderFormProps) {
  const [name, setName] = useState(editingProvider?.name ?? '');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(editingProvider?.baseUrl ?? '');
  const [model, setModel] = useState(editingProvider?.model ?? '');
  const [providerType, setProviderType] = useState<LLMProviderType>(editingProvider?.providerType ?? 'openai');
  const localEndpoint = isLocalEndpoint(baseUrl);
  const apiKeyHint = localEndpoint
    ? '检测到本地端点，可留空（例如 Ollama、LM Studio、vLLM）。'
    : '云端提供商通常需要 API Key；若经由免鉴权代理，也可留空。';
  const knownModels = editingProvider?.availableModels ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedBaseUrl = baseUrl.trim();
    const trimmedModel = model.trim();

    await onSave(editingProvider?.id ?? createProviderId(trimmedName), {
      name: trimmedName,
      apiKey: apiKey.trim() === '' ? undefined : apiKey.trim(),
      baseUrl: trimmedBaseUrl,
      model: trimmedModel,
      providerType,
      availableModels: knownModels.length > 0 ? knownModels : undefined,
    });
  };

  const inputCls = 'w-full rounded-md border border-[--border] bg-[--background] px-2.5 py-1.5 text-sm text-[--foreground] outline-none focus:border-[--primary] transition-colors placeholder:text-[--muted-foreground]/50';

  return (
    <div className="rounded-lg border border-[--border] bg-[--card]">
      {/* 表单标题栏 */}
      <div className="flex items-center justify-between border-b border-[--border] px-4 py-2.5">
        <span className="text-sm font-medium text-[--foreground]">
          {editingProvider ? '编辑提供商' : '添加 LLM Provider'}
        </span>
        <button type="button" onClick={onCancel}
          className="text-xs text-[--muted-foreground] hover:text-[--foreground] transition-colors">
          取消
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        {/* Provider Type */}
        <div>
          <label className="block text-[11px] text-[--muted-foreground] mb-1">
            Provider Type
            <span className="ml-1 opacity-60">（后端协议类型）</span>
          </label>
          <div className="relative">
            <select
              value={providerType}
              onChange={(e) => setProviderType(e.target.value as LLMProviderType)}
              className={`${inputCls} appearance-none pr-8`}
            >
              {LLM_PROVIDER_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[--muted-foreground]">
              ▾
            </span>
          </div>
          <p className="mt-1 text-[10px] text-[--muted-foreground]">
            {LLM_PROVIDER_TYPE_OPTIONS.find((option) => option.value === providerType)?.hint}
          </p>
        </div>

        {/* 名称 + API Key（两列） */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-[--muted-foreground] mb-1">名称</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] text-[--muted-foreground] mb-1">
              API Key
              <span className="ml-1 opacity-50">（可选）</span>
              {editingProvider?.maskedApiKey && (
                <span className="ml-1 opacity-50">（{editingProvider.maskedApiKey}，留空不改）</span>
              )}
            </label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              placeholder={localEndpoint ? '本地端点可留空' : (editingProvider ? '留空则不修改' : '云端端点通常需要 API Key')}
              autoComplete="off" className={inputCls} />
            <p className="mt-1 text-[10px] text-[--muted-foreground]">{apiKeyHint}</p>
          </div>
        </div>

        {/* Base URL + 模型（两列） */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-[--muted-foreground] mb-1">Base URL</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required
              placeholder={providerType === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1 或 http://localhost:11434/v1'}
              className={`${inputCls} font-mono text-xs`} />
          </div>
          <div>
            <label className="block text-[11px] text-[--muted-foreground] mb-1">模型</label>
            <input list={knownModels.length > 0 ? `models-${editingProvider?.id ?? 'new'}` : undefined} value={model}
              onChange={(e) => setModel(e.target.value)} required className={inputCls} />
            {knownModels.length > 0 && (
              <datalist id={`models-${editingProvider?.id ?? 'new'}`}>
                {knownModels.map((modelOption) => <option key={modelOption} value={modelOption} />)}
              </datalist>
            )}
            <p className="mt-1 text-[10px] text-[--muted-foreground]">
              直接填写 provider 暴露的模型名，例如 `gpt-4o`、`claude-sonnet-4-5`、`llama3.2`。
            </p>
          </div>
        </div>

        {/* 保存按钮 */}
        <div className="flex justify-end pt-1">
          <button type="submit" disabled={isSaving}
            className="flex items-center gap-1.5 rounded-md bg-[--primary] px-4 py-1.5 text-xs font-medium text-[--primary-foreground] hover:opacity-90 disabled:opacity-60 transition-opacity">
            {isSaving && <Loader2 size={11} className="animate-spin" />}
            保存
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export function LLMProviderSettingsPage() {
  const [providers, setProviders] = useState<LLMProviderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LLMProviderView | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    try {
      setError(null);
      const list = await llmProviderList();
      setProviders(list);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSave = async (
    providerId: string,
    update: LLMProviderUpdate & { name: string },
  ) => {
    setIsSaving(true);
    try {
      await llmProviderUpdate(providerId, update);
      // 若当前没有默认提供商（首次保存），自动将其设为默认
      const hasActive = providers.some((p) => p.isActive);
      if (!hasActive) {
        await llmProviderSetActive(providerId);
      }
      setShowForm(false);
      setEditingProvider(null);
      await reload();
      window.dispatchEvent(new CustomEvent('ai:provider-changed'));
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      await llmProviderSetActive(id);
      await reload();
      window.dispatchEvent(new CustomEvent('ai:provider-changed'));
    } catch (e) {
      setError(toErrorMessage(e));
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const ok = await llmProviderTestConnection(id);
      setTestResults((prev) => ({ ...prev, [id]: ok }));
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: false }));
    } finally {
      setTestingId(null);
    }
  };

  const handleEdit = (provider: LLMProviderView) => {
    setEditingProvider(provider);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await llmProviderDelete(id);
      await reload();
      window.dispatchEvent(new CustomEvent('ai:provider-changed'));
    } catch (e) {
      setError(toErrorMessage(e));
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingProvider(null);
  };

  return (
    <div className="space-y-4">
      {/* 页头 */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[--foreground]">LLM 提供商</h2>
          <p className="mt-0.5 text-[11px] text-[--muted-foreground]">
            维护 provider type、API Base URL、API Key 和默认模型。本地模型（如 Ollama）可不填 API Key。
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => { setEditingProvider(null); setShowForm(true); }}
            className="flex shrink-0 items-center gap-1 rounded-md border border-[--border] px-2.5 py-1.5 text-[11px] text-[--muted-foreground] hover:bg-[--muted] hover:text-[--foreground] transition-colors"
          >
            <Plus size={11} />
            添加 Provider
          </button>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/8 px-3 py-2 text-[11px] text-destructive">
          <XCircle size={12} className="mt-px shrink-0" />
          <span className="break-all">{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-auto shrink-0 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* 加载中 */}
      {loading && (
        <div className="flex items-center gap-2 text-xs text-[--muted-foreground]">
          <Loader2 size={13} className="animate-spin" />
          加载中…
        </div>
      )}

      {/* 提供商列表 */}
      {!loading && providers.length > 0 && (
        <div className="space-y-3">
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              onSetActive={handleSetActive}
              onTest={handleTest}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isTesting={testingId === p.id}
              testResult={testResults[p.id] ?? null}
            />
          ))}
        </div>
      )}

      {/* 空状态 */}
      {!loading && providers.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-[--border] p-8 text-center">
          <p className="text-sm text-[--muted-foreground]">尚未配置任何 LLM 提供商</p>
          <p className="mt-1 text-[11px] text-[--muted-foreground]/70">
            点击「添加 Provider」创建自定义 provider。Ollama / LM Studio 等本地模型可直接留空 API Key。
          </p>
        </div>
      )}

      {/* 添加 / 编辑表单 */}
      {showForm && (
        <ProviderForm
          editingProvider={editingProvider}
          onSave={handleSave}
          onCancel={handleCancel}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
