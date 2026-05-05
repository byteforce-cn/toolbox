import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { DiffHunk } from './changeset-store';

export interface ApprovalRequest {
  requestId: string;
  toolName: string;
  filePath: string;
  changeType: 'create' | 'modify';
  applyViaPatch: boolean;
  hunks: DiffHunk[];
  aiSessionId?: string;
}

interface ApprovalState {
  pendingApprovalIds: string[];
  approvalRequests: ApprovalRequest[];
  addApprovalRequest(req: ApprovalRequest): void;
  removeApprovalRequest(requestId: string): void;
}

export const useApprovalStore = create<ApprovalState>()(
  immer((set) => ({
    pendingApprovalIds: [],
    approvalRequests: [],
    addApprovalRequest(req) {
      set((state) => {
        const existingIndex = state.approvalRequests.findIndex((r: ApprovalRequest) => r.requestId === req.requestId);
        if (existingIndex !== -1) {
          state.approvalRequests[existingIndex] = req;
          if (!state.pendingApprovalIds.includes(req.requestId)) {
            state.pendingApprovalIds.push(req.requestId);
          }
          return;
        }
        state.approvalRequests.push(req);
        if (!state.pendingApprovalIds.includes(req.requestId)) {
          state.pendingApprovalIds.push(req.requestId);
        }
      });
    },
    removeApprovalRequest(requestId) {
      set((state) => {
        const idx = state.approvalRequests.findIndex((r: ApprovalRequest) => r.requestId === requestId);
        if (idx !== -1) state.approvalRequests.splice(idx, 1);
        const idIdx = state.pendingApprovalIds.indexOf(requestId);
        if (idIdx !== -1) state.pendingApprovalIds.splice(idIdx, 1);
      });
    },
  })),
);
