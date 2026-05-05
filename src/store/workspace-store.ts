import { create } from 'zustand';
import { tauriFsService } from '../modules/explorer/tauri-fs-service';

interface WorkspaceState {
  rootPath: string | null;
  /** 与 rootPath 一一对应的 broker 注册 ID（等于 rootPath，可直接用于 IPC） */
  workspaceId: string | null;
  setRootPath(path: string | null): void;
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  rootPath: null,
  workspaceId: null,
  setRootPath: async (path) => {
    const prev = get().workspaceId;
    // 取消注册旧 workspace
    if (prev) {
      tauriFsService.unregisterWorkspace(prev).catch(() => {
        // 静默：应用退出时后端可能已释放
      });
    }
    if (path) {
      try {
        await tauriFsService.registerWorkspace(path, path);
      } catch (e) {
        console.error('[workspace-store] failed to register workspace:', e);
      }
    }
    set({ rootPath: path, workspaceId: path });
  },
}));
