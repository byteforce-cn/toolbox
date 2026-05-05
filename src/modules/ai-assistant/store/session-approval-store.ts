import { create } from 'zustand';

interface SessionApprovalState {
  /** 当前正在运行的 AI session ID。 */
  currentSessionId: string | null;
  setCurrentSession(sessionId: string | null): void;
}

export const useSessionApprovalStore = create<SessionApprovalState>()((set) => ({
  currentSessionId: null,
  setCurrentSession: (sessionId) => set({ currentSessionId: sessionId }),
}));
