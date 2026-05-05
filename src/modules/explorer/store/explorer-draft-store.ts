import { create } from 'zustand';

interface ExplorerDraftState {
  draftDirectoryPaths: string[];
}

interface ExplorerDraftActions {
  addDraftDirectory(path: string): void;
  removeDraftPath(path: string): void;
  removeDraftAncestorsForPath(path: string): void;
  clear(): void;
}

type ExplorerDraftStore = ExplorerDraftState & ExplorerDraftActions;

function sortUnique(paths: string[]): string[] {
  return Array.from(new Set(paths)).sort((a, b) => a.localeCompare(b));
}

function isSameOrDescendantPath(path: string, candidate: string): boolean {
  return path === candidate || path.startsWith(`${candidate}/`);
}

export const useExplorerDraftStore = create<ExplorerDraftStore>()((set) => ({
  draftDirectoryPaths: [],

  addDraftDirectory(path) {
    set((state) => ({ draftDirectoryPaths: sortUnique([...state.draftDirectoryPaths, path]) }));
  },

  removeDraftPath(path) {
    set((state) => ({
      draftDirectoryPaths: state.draftDirectoryPaths.filter(
        (candidate) => !isSameOrDescendantPath(candidate, path),
      ),
    }));
  },

  removeDraftAncestorsForPath(path) {
    set((state) => ({
      draftDirectoryPaths: state.draftDirectoryPaths.filter(
        (candidate) => !isSameOrDescendantPath(path, candidate),
      ),
    }));
  },

  clear() {
    set({ draftDirectoryPaths: [] });
  },
}));
