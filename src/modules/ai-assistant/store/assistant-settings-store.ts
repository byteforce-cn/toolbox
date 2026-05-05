import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AssistantSettingsState {
  sessionRailOpen: boolean;
  setSessionRailOpen(open: boolean): void;
}

export const useAssistantSettingsStore = create<AssistantSettingsState>()(
  persist(
    (set) => ({
      sessionRailOpen: true,
      setSessionRailOpen: (open) => set({ sessionRailOpen: open }),
    }),
    { name: 'assistant-settings' },
  ),
);
