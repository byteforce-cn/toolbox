/**
 * mcp-service.ts — MCP (Model Context Protocol) 服务封装。
 * Phase 4 完整实现；当前为 Phase 1-3 骨架，所有方法返回空值。
 */
import type { McpServerConfig, McpServerStatusDto } from './mcp/types';

export type { McpServerConfig, McpServerStatusDto };

/** 列出所有 MCP 服务端配置。Phase 4 实现。 */
export const mcpListServers = (): Promise<McpServerConfig[]> =>
  Promise.resolve([]);

/** 获取指定服务端的运行状态。Phase 4 实现。 */
export const mcpGetStatus = (_serverId: string): Promise<McpServerStatusDto | null> =>
  Promise.resolve(null);

/** 启动 MCP 服务端。Phase 4 实现。 */
export const mcpStartServer = (_serverId: string): Promise<void> =>
  Promise.resolve();

/** 停止 MCP 服务端。Phase 4 实现。 */
export const mcpStopServer = (_serverId: string): Promise<void> =>
  Promise.resolve();
