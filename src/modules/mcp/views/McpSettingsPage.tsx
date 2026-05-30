import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cpu, Loader2, Pencil, Play, Plus, RotateCcw, Save, Server, Square, Trash2, X } from 'lucide-react';
import * as mcpService from '../services/mcp-service';
import type { McpServerConfig, McpServerStatusDto, McpToolDef, McpTransport } from '../services/mcp-service';
import { isBackendUnavailable } from '../../../services/backend-unavailable';
import { BackendUnavailableNotice } from '../../../components/BackendUnavailableNotice';

const PENDING_COMMANDS = [
  'mcp_get_configs',
  'mcp_save_configs',
  'mcp_start_server',
  'mcp_stop_server',
  'mcp_restart_server',
  'mcp_list_tools',
  'mcp_list_all_tools',
  'mcp_server_status',
  'mcp_call_tool',
  'mcp_list_builtin_tools',
];

interface McpFormState {
  id: string;
  name: string;
  transport: McpTransport;
  command: string;
  argsText: string;
  envText: string;
  url: string;
  autoStart: boolean;
  authToken: string;
}

function blankServer(): McpFormState {
  return {
    id: '',
    name: '',
    transport: 'stdio',
    command: '',
    argsText: '',
    envText: '',
    url: '',
    autoStart: false,
    authToken: '',
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatArgs(args: string[]): string {
  return args.join(' ');
}

function parseArgs(text: string): string[] {
  return text
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatEnv(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function parseEnv(text: string): Record<string, string> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, line) => {
      const index = line.indexOf('=');
      if (index <= 0) return acc;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (key) acc[key] = value;
      return acc;
    }, {});
}

function toFormState(config: McpServerConfig): McpFormState {
  return {
    id: config.id,
    name: config.name,
    transport: config.transport,
    command: config.command ?? '',
    argsText: formatArgs(config.args),
    envText: formatEnv(config.env),
    url: config.url ?? '',
    autoStart: config.autoStart,
    authToken: config.authToken ?? '',
  };
}

function toConfig(state: McpFormState): McpServerConfig {
  return {
    id: state.id.trim() || slugify(state.name),
    name: state.name.trim(),
    transport: state.transport,
    command: state.transport === 'stdio' ? state.command.trim() : undefined,
    args: state.transport === 'stdio' ? parseArgs(state.argsText) : [],
    env: parseEnv(state.envText),
    url: state.transport === 'stdio' ? undefined : state.url.trim(),
    autoStart: state.autoStart,
    authToken: state.authToken.trim() || undefined,
  };
}

function statusColor(status?: McpServerStatusDto['status']): string {
  switch (status) {
    case 'running':
      return 'bg-emerald-500';
    case 'starting':
      return 'bg-amber-500';
    case 'error':
      return 'bg-destructive';
    default:
      return 'bg-muted-foreground/40';
  }
}

export function McpSettingsPage() {
  const [configs, setConfigs] = useState<McpServerConfig[]>([]);
  const [statuses, setStatuses] = useState<Record<string, McpServerStatusDto>>({});
  const [toolsByServer, setToolsByServer] = useState<Record<string, McpToolDef[]>>({});
  const [builtinTools, setBuiltinTools] = useState<McpToolDef[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<McpFormState | null>(null);
  const [isNew, setIsNew] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgs, sts, allTools, builtin] = await Promise.all([
        mcpService.mcpGetConfigs(),
        mcpService.mcpServerStatus(),
        mcpService.mcpListAllTools().catch(() => ({})),
        mcpService.mcpListBuiltinTools().catch(() => []),
      ]);
      setConfigs(cfgs);
      setStatuses(Object.fromEntries(sts.map((status) => [status.serverId, status])));
      setToolsByServer(allTools);
      setBuiltinTools(builtin);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    let unlistenStatus: (() => void) | undefined;
    let unlistenAuth: (() => void) | undefined;
    void mcpService.onMcpStatusChanged(() => void reload()).then((dispose) => {
      unlistenStatus = dispose;
    });
    void mcpService.onMcpAuthRequired(({ serverId }) => {
      setError(
        serverId
          ? `MCP 服务 ${serverId} 需要认证，请填写 Auth Token 后重试。`
          : 'MCP 服务需要认证，请填写 Auth Token 后重试。',
      );
      void reload();
    }).then((dispose) => {
      unlistenAuth = dispose;
    });
    return () => {
      unlistenStatus?.();
      unlistenAuth?.();
    };
  }, [reload]);

  const handleAdd = useCallback(() => {
    setEditing(blankServer());
    setIsNew(true);
  }, []);

  const handleEdit = useCallback((config: McpServerConfig) => {
    setEditing(toFormState(config));
    setIsNew(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError('MCP server 名称不能为空');
      return;
    }

    const config = toConfig(editing);
    if (!config.id) {
      setError('MCP server ID 不能为空');
      return;
    }
    if (config.transport === 'stdio' && !config.command) {
      setError('STDIO 模式需要 command');
      return;
    }
    if (config.transport !== 'stdio' && !config.url) {
      setError('HTTP/SSE 模式需要 URL');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const nextConfigs = isNew
        ? [...configs.filter((item) => item.id !== config.id), config]
        : configs.map((item) => (item.id === config.id ? config : item));
      if (isNew && !nextConfigs.some((item) => item.id === config.id)) {
        nextConfigs.push(config);
      }
      await mcpService.mcpSaveConfigs(nextConfigs);
      setEditing(null);
      setIsNew(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [configs, editing, isNew, reload]);

  const handleDelete = useCallback(async (serverId: string) => {
    if (!confirm(`确认删除 MCP server "${serverId}"？`)) return;
    try {
      const status = statuses[serverId];
      if (status?.status === 'running' || status?.status === 'starting') {
        await mcpService.mcpStopServer(serverId).catch(() => undefined);
      }
      await mcpService.mcpSaveConfigs(configs.filter((config) => config.id !== serverId));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [configs, reload, statuses]);

  const handleStart = useCallback(async (config: McpServerConfig) => {
    try {
      setSaving(true);
      setError(null);
      await mcpService.mcpStartServer(config);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [reload]);

  const handleStop = useCallback(async (serverId: string) => {
    try {
      setSaving(true);
      setError(null);
      await mcpService.mcpStopServer(serverId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [reload]);

  const handleRestart = useCallback(async (config: McpServerConfig) => {
    try {
      setSaving(true);
      setError(null);
      await mcpService.mcpRestartServer(config);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [reload]);

  const serverCountLabel = useMemo(() => `${configs.length} 个配置 / ${builtinTools.length} 个内置工具`, [builtinTools.length, configs.length]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> 加载 MCP 配置…
      </div>
    );
  }

  if (error && isBackendUnavailable(error)) {
    return (
      <BackendUnavailableNotice
        title="MCP 设置"
        description="MCP（Model Context Protocol）允许 AI 助手通过外部 server 暴露的工具与数据源交互。"
        pendingCommands={PENDING_COMMANDS}
        hint="后端命令已在 toolbox-plugin-ai/src/commands/mcp.rs 注册（Phase 2）。若仍显示此页，请检查 Tauri 构建产物是否包含最新 toolbox-plugin-ai。"
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
          <h1 className="text-base font-semibold text-foreground">MCP 服务器</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            管理 MCP server 配置、启停状态与可用工具。{serverCountLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> 刷新
          </button>
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3 w-3" /> 新建 Server
          </button>
        </div>
      </div>

      {error !== null && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-emerald-500" />
          <div>
            <h2 className="text-sm font-medium text-foreground">内置工具</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">这些工具由本地 runtime 常驻提供，不依赖外部 MCP 进程。</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {builtinTools.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">当前未返回内置工具定义。</span>
          ) : builtinTools.map((tool) => (
            <span
              key={tool.name}
              title={tool.description}
              className="rounded-md border border-[--border] bg-[--input] px-2 py-0.5 font-mono text-[10.5px] text-[--muted-foreground]"
            >
              {tool.name}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-foreground">外部 MCP Server</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">支持保存配置、启停实例与查看每个 server 暴露的工具。</p>
          </div>
        </div>

        {configs.length === 0 && !editing ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
            尚未配置任何 MCP server。
          </div>
        ) : (
          <div className="space-y-2">
            {configs.map((config) => {
              const status = statuses[config.id];
              const tools = toolsByServer[config.id] ?? [];
              return (
                <div key={config.id} className="rounded-lg border px-3 py-3">
                  <div className="flex items-start gap-3">
                    <Server className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate">{config.name}</span>
                        <span className="rounded bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground">{config.transport}</span>
                        {config.autoStart && (
                          <span className="rounded-full bg-blue-500/15 px-1.5 py-px text-[10px] text-blue-500">自动启动</span>
                        )}
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusColor(status?.status)}`} />
                        <span className="text-[10px] text-muted-foreground">{status?.status ?? 'stopped'}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground break-all">
                        {config.transport === 'stdio'
                          ? `${config.command ?? ''} ${config.args.join(' ')}`.trim()
                          : (config.url ?? '')}
                      </p>
                      {status?.error && (
                        <p className="mt-1 text-[11px] text-destructive">{status.error}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tools.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground">暂无工具</span>
                        ) : tools.map((tool) => (
                          <span
                            key={`${config.id}-${tool.name}`}
                            title={tool.description}
                            className="rounded-md border border-[--border] bg-[--input] px-2 py-0.5 font-mono text-[10.5px] text-[--muted-foreground]"
                          >
                            {tool.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {status?.status === 'running' ? (
                        <button
                          type="button"
                          onClick={() => void handleStop(config.id)}
                          className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Square className="h-3 w-3" /> 停止
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleStart(config)}
                          className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Play className="h-3 w-3" /> 启动
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleRestart(config)}
                        className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <RotateCcw className="h-3 w-3" /> 重启
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(config)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(config.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {editing && (
          <div className="mt-4 rounded-lg border bg-background p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">{isNew ? '新建 MCP Server' : `编辑 ${editing.name || editing.id}`}</h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Server ID" hint="留空时将根据名称自动生成。">
                <input
                  value={editing.id}
                  onChange={(event) => setEditing({ ...editing, id: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                />
              </Field>
              <Field label="名称 *">
                <input
                  value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                />
              </Field>
              <Field label="Transport">
                <select
                  value={editing.transport}
                  onChange={(event) => setEditing({ ...editing, transport: event.target.value as McpTransport })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                >
                  <option value="stdio">stdio</option>
                  <option value="http">http</option>
                  <option value="sse">sse</option>
                </select>
              </Field>
              <Field label="自动启动">
                <label className="flex h-[34px] items-center gap-2 text-[12px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={editing.autoStart}
                    onChange={(event) => setEditing({ ...editing, autoStart: event.target.checked })}
                  />
                  随配置恢复时自动启动
                </label>
              </Field>
              {editing.transport === 'stdio' ? (
                <>
                  <Field label="Command *" full>
                    <input
                      value={editing.command}
                      onChange={(event) => setEditing({ ...editing, command: event.target.value })}
                      className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-[12px] outline-none focus:border-primary"
                      placeholder="npx"
                    />
                  </Field>
                  <Field label="Args" hint="按空格分隔。" full>
                    <input
                      value={editing.argsText}
                      onChange={(event) => setEditing({ ...editing, argsText: event.target.value })}
                      className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-[12px] outline-none focus:border-primary"
                      placeholder="-y @modelcontextprotocol/server-filesystem ."
                    />
                  </Field>
                </>
              ) : (
                <Field label="URL *" full>
                  <input
                    value={editing.url}
                    onChange={(event) => setEditing({ ...editing, url: event.target.value })}
                    className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-[12px] outline-none focus:border-primary"
                    placeholder="https://example.com/mcp"
                  />
                </Field>
              )}
              <Field label="环境变量" hint="一行一个 KEY=value。" full>
                <textarea
                  rows={4}
                  value={editing.envText}
                  onChange={(event) => setEditing({ ...editing, envText: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-[12px] outline-none focus:border-primary"
                />
              </Field>
              <Field label="Auth Token" hint="HTTP/SSE 需要鉴权时填写；STDIO 可留空。" full>
                <input
                  value={editing.authToken}
                  onChange={(event) => setEditing({ ...editing, authToken: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-[12px] outline-none focus:border-primary"
                />
              </Field>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="h-7 rounded-md border px-3 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                保存配置
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
