/**
 * approval-service.ts — 统一审批服务（无 DI，直接 invoke）。
 *
 * 将三类审批（工具写入、Shell 命令、子代理）的监听与响应集中管理。
 * UI 层通过 setCallbacks() 注入回调，服务本身不依赖具体 store。
 */
import { listen } from '@tauri-apps/api/event';
import { invokeAI } from './invoke-ai';
import type { DiffHunk } from '../../../store/changeset-store';

// ─── Shared types ──────────────────────────────────────────────────────────

export type ApprovalKind = 'tool' | 'shell' | 'subagent';

export interface ToolApprovalRequest {
  kind: 'tool';
  requestId: string;
  toolName: string;
  filePath: string;
  changeType: 'create' | 'modify';
  applyViaPatch: boolean;
  hunks: DiffHunk[];
}

export interface ShellApprovalRequest {
  kind: 'shell';
  requestId: string;
  command: string;
  cwd: string | null;
}

export interface SubagentApprovalRequest {
  kind: 'subagent';
  requestId: string;
  agentId: string;
  task: string;
  depth: number;
}

export type ApprovalRequest = ToolApprovalRequest | ShellApprovalRequest | SubagentApprovalRequest;

export interface ApprovalApplyResult {
  snapshotId: string;
  appliedHunks: number;
  skippedHunks: number;
  finalContent: string;
}

export interface ApprovalRequestDetails {
  requestId: string;
  oldContent: string;
  newContent: string;
}

// ─── Callback ports ─────────────────────────────────────────────────────────

export interface ApprovalCallbacks {
  onToolApproval?: (request: ToolApprovalRequest) => void;
  onShellApproval?: (request: ShellApprovalRequest) => void;
  onSubagentApproval?: (request: SubagentApprovalRequest) => void;
  onShellExecutionStarted?: () => void;
}

// ─── Service ─────────────────────────────────────────────────────────────

export class ApprovalService {
  private unlisteners: Array<() => void> = [];
  private callbacks: ApprovalCallbacks = {};

  setCallbacks(callbacks: ApprovalCallbacks): void {
    this.callbacks = callbacks;
  }

  async startListening(): Promise<void> {
    const unlistenTool = await listen<Omit<ToolApprovalRequest, 'kind'>>(
      'tool:approval-required',
      (event) => {
        this.callbacks.onToolApproval?.({ ...event.payload, kind: 'tool' });
      },
    );
    this.unlisteners.push(unlistenTool);

    const unlistenShell = await listen<Omit<ShellApprovalRequest, 'kind'>>(
      'shell:approval-required',
      (event) => {
        this.callbacks.onShellApproval?.({ ...event.payload, kind: 'shell' });
      },
    );
    this.unlisteners.push(unlistenShell);

    const unlistenShellExec = await listen('shell:execution-started', () => {
      this.callbacks.onShellExecutionStarted?.();
    });
    this.unlisteners.push(unlistenShellExec);

    const unlistenSubagent = await listen<Omit<SubagentApprovalRequest, 'kind'>>(
      'subagent:approval-required',
      (event) => {
        this.callbacks.onSubagentApproval?.({ ...event.payload, kind: 'subagent' });
      },
    );
    this.unlisteners.push(unlistenSubagent);
  }

  stopListening(): void {
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
    this.unlisteners = [];
  }

  // ── Tool approval ────────────────────────────────────────────────────────

  async respondToolApproval(requestId: string, approved: boolean): Promise<void> {
    await invokeAI('tool_approval_respond', { requestId, approved });
  }

  async applyToolApproval(requestId: string, acceptedHunks: string[]): Promise<ApprovalApplyResult> {
    return invokeAI<ApprovalApplyResult>('tool_approval_apply', { requestId, acceptedHunks });
  }

  async getToolApprovalDetails(requestId: string): Promise<ApprovalRequestDetails | null> {
    return invokeAI<ApprovalRequestDetails | null>('tool_approval_get_details', { requestId });
  }

  // ── Shell approval ───────────────────────────────────────────────────────

  async respondShellApproval(requestId: string, approved: boolean): Promise<void> {
    await invokeAI('shell_approval_respond', { requestId, approved });
  }

  // ── Subagent approval ────────────────────────────────────────────────────

  async respondSubagentApproval(requestId: string, approved: boolean): Promise<void> {
    await invokeAI('subagent_approval_respond', { requestId, approved });
  }
}

/** 模块级单例，供组件直接使用。 */
export const approvalService = new ApprovalService();
