/**
 * MCP service — 包装 mcp_* 后端命令。
 * 上游：jinhe-mcp。后端命令已注册（Phase 2）。
 */
import { listen } from '@tauri-apps/api/event';
import { callBackend } from '../../../services/backend-unavailable';

export type McpTransport = 'stdio' | 'sse' | 'http';

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransport;
  command?: string;
  args: string[];
  env: Record<string, string>;
  url?: string;
  autoStart: boolean;
  authToken?: string;
}

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: unknown;
  serverId?: string;
}

export interface McpServerStatusDto {
  serverId: string;
  name: string;
  status: 'starting' | 'running' | 'stopped' | 'error';
  error?: string;
  toolCount: number;
}

export interface McpAuthRequiredEvent {
  serverId: string;
}

interface RawMcpServerConfig {
  id?: string;
  name?: string;
  transport?: string;
  command?: string | null;
  args?: string[] | null;
  env?: Record<string, string> | null;
  url?: string | null;
  autoStart?: boolean;
  auto_start?: boolean;
  authToken?: string | null;
  auth_token?: string | null;
}

interface RawMcpToolDef {
  name?: string;
  description?: string | null;
  inputSchema?: unknown;
  input_schema?: unknown;
  serverId?: string;
  server_id?: string;
}

interface RawMcpServerStatusDto {
  id?: string;
  serverId?: string;
  name?: string;
  status?: string;
  toolCount?: number;
  tool_count?: number;
  error?: string | null;
}

interface RawMcpAuthRequiredEvent {
  serverId?: string;
  server_id?: string;
}

function normalizeTransport(value?: string): McpTransport {
  return value === 'http' || value === 'sse' ? value : 'stdio';
}

function normalizeConfig(raw: RawMcpServerConfig): McpServerConfig {
  return {
    id: raw.id ?? '',
    name: raw.name ?? raw.id ?? '',
    transport: normalizeTransport(raw.transport),
    command: raw.command ?? undefined,
    args: raw.args ?? [],
    env: raw.env ?? {},
    url: raw.url ?? undefined,
    autoStart: raw.autoStart ?? raw.auto_start ?? false,
    authToken: raw.authToken ?? raw.auth_token ?? undefined,
  };
}

function toRawConfig(config: McpServerConfig): RawMcpServerConfig {
  return {
    id: config.id,
    name: config.name,
    transport: config.transport,
    command: config.command ?? null,
    args: config.args,
    env: config.env,
    url: config.url ?? null,
    auto_start: config.autoStart,
    auth_token: config.authToken ?? null,
  };
}

function normalizeTool(raw: RawMcpToolDef): McpToolDef {
  return {
    name: raw.name ?? '',
    description: raw.description ?? undefined,
    inputSchema: raw.inputSchema ?? raw.input_schema,
    serverId: raw.serverId ?? raw.server_id,
  };
}

function normalizeStatus(raw: RawMcpServerStatusDto): McpServerStatusDto {
  const status = (raw.status ?? 'stopped').toLowerCase();
  return {
    serverId: raw.serverId ?? raw.id ?? '',
    name: raw.name ?? raw.serverId ?? raw.id ?? '',
    status: status === 'running' || status === 'starting' || status === 'error' ? status : 'stopped',
    error: raw.error ?? undefined,
    toolCount: raw.toolCount ?? raw.tool_count ?? 0,
  };
}

export const mcpStartServer = (config: McpServerConfig): Promise<McpToolDef[]> =>
  callBackend<RawMcpToolDef[]>('mcp_start_server', { config: toRawConfig(config) }).then((tools) => tools.map(normalizeTool));

export const mcpStopServer = (serverId: string): Promise<void> =>
  callBackend<void>('mcp_stop_server', { serverId });

export const mcpRestartServer = (config: McpServerConfig): Promise<McpToolDef[]> =>
  callBackend<RawMcpToolDef[]>('mcp_restart_server', { config: toRawConfig(config) }).then((tools) => tools.map(normalizeTool));

export const mcpListTools = (serverId: string): Promise<McpToolDef[]> =>
  callBackend<RawMcpToolDef[]>('mcp_list_tools', { serverId }).then((tools) => tools.map(normalizeTool));

export const mcpListAllTools = async (): Promise<Record<string, McpToolDef[]>> => {
  const raw = await callBackend<Record<string, RawMcpToolDef[]>>('mcp_list_all_tools');
  return Object.fromEntries(
    Object.entries(raw).map(([serverId, tools]) => [serverId, tools.map(normalizeTool)]),
  );
};

export const mcpServerStatus = (): Promise<McpServerStatusDto[]> =>
  callBackend<RawMcpServerStatusDto[]>('mcp_server_status').then((statuses) => statuses.map(normalizeStatus));

export const mcpCallTool = (
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> =>
  callBackend<string>('mcp_call_tool', { serverId, toolName, arguments: args });

export const mcpListBuiltinTools = (): Promise<McpToolDef[]> =>
  callBackend<RawMcpToolDef[]>('mcp_list_builtin_tools').then((tools) => tools.map(normalizeTool));

export const mcpGetConfigs = (): Promise<McpServerConfig[]> =>
  callBackend<RawMcpServerConfig[]>('mcp_get_configs').then((configs) => configs.map(normalizeConfig));

export const mcpSaveConfigs = (configs: McpServerConfig[]): Promise<void> =>
  callBackend<void>('mcp_save_configs', { configs: configs.map(toRawConfig) });

export const mcpAuthRespond = (serverId: string, authToken: string): Promise<McpToolDef[]> =>
  callBackend<RawMcpToolDef[]>('mcp_auth_respond', { serverId, authToken }).then((tools) => tools.map(normalizeTool));

// ─── Resources ───────────────────────────────────────────────────────────

export interface McpResourceSchema {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export const mcpListResources = (serverId: string): Promise<McpResourceSchema[]> =>
  callBackend<McpResourceSchema[]>('mcp_list_resources', { serverId });

export const mcpReadResource = (serverId: string, uri: string): Promise<ResourceContent[]> =>
  callBackend<ResourceContent[]>('mcp_read_resource', { serverId, uri });

// ─── Prompts ─────────────────────────────────────────────────────────────

export interface McpPromptSchema {
  name: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
}

export interface PromptGetResult {
  description?: string;
  messages: { role: string; content: unknown }[];
}

export const mcpListPrompts = (serverId: string): Promise<McpPromptSchema[]> =>
  callBackend<McpPromptSchema[]>('mcp_list_prompts', { serverId });

export const mcpGetPrompt = (
  serverId: string,
  name: string,
  args?: Record<string, unknown>,
): Promise<PromptGetResult> =>
  callBackend<PromptGetResult>('mcp_get_prompt', { serverId, name, arguments: args });

export const onMcpStatusChanged = (
  handler: () => void,
): Promise<() => void> =>
  listen('mcp-status-changed', () => handler()).then(
    (unlisten) => unlisten,
  );

export const onMcpAuthRequired = (
  handler: (event: McpAuthRequiredEvent) => void,
): Promise<() => void> =>
  listen<RawMcpAuthRequiredEvent>('mcp-auth-required', (event) => {
    const payload = event.payload ?? {};
    handler({
      serverId: payload.serverId ?? payload.server_id ?? '',
    });
  }).then((unlisten) => unlisten);
