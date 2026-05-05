/**
 * approval-handlers.ts — 审批处理器，合并四类审批：工具写入、Shell 命令、子代理调用、危险文件操作。
 *
 * 监听来自 Rust 后端的审批请求事件，分别入队到各自的 Zustand store，
 * UI 组件从 store 读取并渲染审批弹窗，用户决策后调用 respond* 函数回传。
 */
import { listen } from '@tauri-apps/api/event';
import { invokeAI } from './invoke-ai';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useApprovalStore } from '../../../store/approval-store';
import { useSessionApprovalStore } from '../store/session-approval-store';
import type { ApprovalRequest } from '../../../store/approval-store';

/** 需要走危险操作内联审批的工具名称集合（fs_delete / fs_move）。 */
export const DANGEROUS_OP_TOOLS = new Set(['fs_delete', 'fs_move']);

// ── Shell 审批 ─────────────────────────────────────────────────────────────

export interface ShellApprovalRequest {
  requestId: string;
  command: string;
  cwd: string | null;
  riskLevel?: 'low' | 'dangerous';
  riskReason?: string;
}

interface ShellApprovalState {
  pending: ShellApprovalRequest[];
  addRequest(req: ShellApprovalRequest): void;
  removeRequest(requestId: string): void;
}

export const useShellApprovalStore = create<ShellApprovalState>()(
  immer((set) => ({
    pending: [],
    addRequest(req) {
      set((state) => {
        const existingIndex = state.pending.findIndex((r: ShellApprovalRequest) => r.requestId === req.requestId);
        if (existingIndex !== -1) {
          state.pending[existingIndex] = req;
          return;
        }
        state.pending.push(req);
      });
    },
    removeRequest(requestId) {
      set((state) => {
        const idx = state.pending.findIndex((r: ShellApprovalRequest) => r.requestId === requestId);
        if (idx !== -1) state.pending.splice(idx, 1);
      });
    },
  })),
);

// ── 子代理审批 ──────────────────────────────────────────────────────────────

export interface SubagentApprovalRequest {
  requestId: string;
  agentId: string;
  task: string;
  depth: number;
}

interface SubagentApprovalState {
  pending: SubagentApprovalRequest[];
  addRequest(req: SubagentApprovalRequest): void;
  removeRequest(requestId: string): void;
}

export const useSubagentApprovalStore = create<SubagentApprovalState>()(
  immer((set) => ({
    pending: [],
    addRequest(req) {
      set((state) => {
        const existingIndex = state.pending.findIndex((r: SubagentApprovalRequest) => r.requestId === req.requestId);
        if (existingIndex !== -1) {
          state.pending[existingIndex] = req;
          return;
        }
        state.pending.push(req);
      });
    },
    removeRequest(requestId) {
      set((state) => {
        const idx = state.pending.findIndex((r: SubagentApprovalRequest) => r.requestId === requestId);
        if (idx !== -1) state.pending.splice(idx, 1);
      });
    },
  })),
);

/** 启动 Shell 命令审批监听器。 */
export async function startShellApprovalListener(): Promise<() => void> {
  const unlistenApproval = await listen<ShellApprovalRequest>('shell:approval-required', (event) => {
    useShellApprovalStore.getState().addRequest(event.payload);
  });
  return unlistenApproval;
}

/** 启动子代理调用审批监听器。 */
export async function startSubagentApprovalListener(): Promise<() => void> {
  const unlisten = await listen<SubagentApprovalRequest>('subagent:approval-required', (event) => {
    useSubagentApprovalStore.getState().addRequest(event.payload);
  });
  return unlisten;
}

// ── 危险文件操作审批 ────────────────────────────────────────────────────────

export interface DangerousOpRequest {
  requestId: string;
  toolName: string;
  filePath: string;
  changeType: 'create' | 'modify';
}

interface DangerousOpApprovalState {
  pending: DangerousOpRequest[];
  addRequest(req: DangerousOpRequest): void;
  removeRequest(requestId: string): void;
}

export const useDangerousOpApprovalStore = create<DangerousOpApprovalState>()(
  immer((set) => ({
    pending: [],
    addRequest(req) {
      set((state) => {
        const existingIndex = state.pending.findIndex((r: DangerousOpRequest) => r.requestId === req.requestId);
        if (existingIndex !== -1) {
          state.pending[existingIndex] = req;
          return;
        }
        state.pending.push(req);
      });
    },
    removeRequest(requestId) {
      set((state) => {
        const idx = state.pending.findIndex((r: DangerousOpRequest) => r.requestId === requestId);
        if (idx !== -1) state.pending.splice(idx, 1);
      });
    },
  })),
);

// ── 监听器启动 — 工具写入审批（危险操作走内联 DangerousOp 队列） ──────────────

/** 启动工具写入审批监听器。危险操作（fs_delete / fs_move）路由到 DangerousOp 队列。 */
export async function startApprovalListener(): Promise<() => void> {
  const unlisten = await listen<ApprovalRequest>('tool:approval-required', (event) => {
    const payload = event.payload;
    if (DANGEROUS_OP_TOOLS.has(payload.toolName)) {
      useDangerousOpApprovalStore.getState().addRequest({
        requestId: payload.requestId,
        toolName: payload.toolName,
        filePath: payload.filePath,
        changeType: payload.changeType,
      });
    } else {
      useApprovalStore.getState().addApprovalRequest({
        ...payload,
        aiSessionId: useSessionApprovalStore.getState().currentSessionId ?? undefined,
      });
    }
  });
  return unlisten;
}

// ── 响应函数 ───────────────────────────────────────────────────────────────

/** 响应工具写入审批。 */
export async function respondApproval(requestId: string, approved: boolean): Promise<void> {
  useApprovalStore.getState().removeApprovalRequest(requestId);
  await invokeAI('tool_approval_respond', { requestId, approved });
}

/** 响应 Shell 命令审批。 */
export async function respondShellApproval(requestId: string, approved: boolean): Promise<void> {
  useShellApprovalStore.getState().removeRequest(requestId);
  await invokeAI('shell_approval_respond', { requestId, approved });
}

/** 响应子代理调用审批。 */
export async function respondSubagentApproval(requestId: string, approved: boolean): Promise<void> {
  useSubagentApprovalStore.getState().removeRequest(requestId);
  await invokeAI('subagent_approval_respond', { requestId, approved });
}

/** 响应危险文件操作审批（复用 tool_approval_respond IPC）。 */
export async function respondDangerousOpApproval(requestId: string, approved: boolean): Promise<void> {
  useDangerousOpApprovalStore.getState().removeRequest(requestId);
  await invokeAI('tool_approval_respond', { requestId, approved });
}
