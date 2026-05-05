import { create } from 'zustand';
import type { FileNode } from './types';
import { useWorkspaceStore } from '../../../store/workspace-store';

interface ExplorerStoreState {
  rootPath: string | null;
  tree: FileNode[];
  expandedPaths: Set<string>;
  selectedPath: string | null;
  isLoading: boolean;
  error: string | null;
}

interface ExplorerStoreActions {
  setRootPath(path: string | null): void;
  setTree(tree: FileNode[]): void;
  setExpandedPaths(paths: Set<string>): void;
  selectNode(path: string | null): void;
  setLoadingState(partial: Partial<Pick<ExplorerStoreState, 'isLoading' | 'error' | 'rootPath' | 'tree' | 'expandedPaths'>>): void;
  setError(error: string | null): void;
}

export type ExplorerStore = ExplorerStoreState & ExplorerStoreActions;

export const useExplorerStore = create<ExplorerStore>()((set) => ({
  rootPath: null,
  tree: [],
  expandedPaths: new Set(),
  selectedPath: null,
  isLoading: false,
  error: null,

  setRootPath(path) {
    set({ rootPath: path });
    useWorkspaceStore.getState().setRootPath(path);
  },

  setTree(tree) {
    set({ tree });
  },

  setExpandedPaths(expandedPaths) {
    set({ expandedPaths });
  },

  selectNode(path) {
    set({ selectedPath: path });
  },

  setLoadingState(partial) {
    set(partial);
    if (partial.rootPath !== undefined) {
      useWorkspaceStore.getState().setRootPath(partial.rootPath ?? null);
    }
  },

  setError(error) {
    set({ error });
  },
}));
