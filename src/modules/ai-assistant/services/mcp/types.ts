/**
 * MCP (Model Context Protocol) types — frontend mirror of Rust types.
 */

// ─── Transport ─────────────────────────────────────────────────────────────

export type McpTransportStdio = {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type McpTransportHttp = {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
};

export type McpTransportSse = {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
};

export type McpTransport = McpTransportStdio | McpTransportHttp | McpTransportSse;

// ─── Server Config ─────────────────────────────────────────────────────────

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransport;
  enabled: boolean;
  description?: string;
}

// ─── Tool ──────────────────────────────────────────────────────────────────

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ─── Status ────────────────────────────────────────────────────────────────

export type McpServerStatusKind = 'stopped' | 'starting' | 'running' | 'error';

export interface McpServerStatusDto {
  serverId: string;
  status: McpServerStatusKind;
  tools: McpToolDef[];
  error?: string;
}
