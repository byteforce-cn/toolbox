import { create } from 'zustand';

export interface FileBufferAiDiffFocusTarget {
  editor: 'original' | 'modified';
  lineNumber: number;
}

export interface FileBufferAiReviewContext {
  proposalSessionId?: string;
  proposalRecordId?: string;
  changeType?: 'create' | 'modify' | 'delete';
  status?: 'pending' | 'accepted' | 'rejected' | 'reviewing';
  focusTarget?: FileBufferAiDiffFocusTarget | null;
}

/** Phase 2 完整实现：文件内容缓冲区 */
export interface FileBuffer {
  filePath: string;
  content: string;
  originalContent: string;
  isModified: boolean;
  existsOnDisk: boolean;
  // Phase 3 填充：
  aiOriginalContent?: string;
  aiShadowContent?: string;
  isAiDiffActive?: boolean;
  aiReview?: FileBufferAiReviewContext;
}

interface FileBufferState {
  buffers: Record<string, FileBuffer>;
  /** Tab 顺序（打开的文件路径列表） */
  tabs: string[];
  /** 当前激活的文件路径 */
  activeTabPath: string | null;

  openFile(path: string, content: string): void;
  markModified(path: string, content: string): void;
  /** 写盘后更新 originalContent，清除 isModified 标记 */
  markSaved(path: string, content: string): void;
  openAiDiff(
    path: string,
    oldContent: string,
    newContent: string,
    existsOnDisk?: boolean,
    aiReview?: FileBufferAiReviewContext,
  ): void;
  closeFile(path: string): void;
  setActiveTab(path: string): void;
}

export const useFileBufferStore = create<FileBufferState>()((set) => ({
  buffers: {},
  tabs: [],
  activeTabPath: null,

  openFile(path, content) {
    set((state) => {
      const existing = state.buffers[path];
      const tabs = state.tabs.includes(path) ? state.tabs : [...state.tabs, path];
      return {
        tabs,
        activeTabPath: path,
        buffers: {
          ...state.buffers,
          [path]: existing
            ? {
                ...existing,
                isAiDiffActive: false,
                aiOriginalContent: undefined,
                aiShadowContent: undefined,
                aiReview: undefined,
              }
            : {
                filePath: path,
                content,
                originalContent: content,
                isModified: false,
                existsOnDisk: true,
              },
        },
      };
    });
  },

  markModified(path, content) {
    set((state) => {
      const buf = state.buffers[path];
      if (!buf) return state;
      return {
        buffers: {
          ...state.buffers,
          [path]: { ...buf, content, isModified: content !== buf.originalContent },
        },
      };
    });
  },

  markSaved(path, content) {
    set((state) => {
      const buf = state.buffers[path];
      if (!buf) return state;
      return {
        buffers: {
          ...state.buffers,
          [path]: { ...buf, content, originalContent: content, isModified: false },
        },
      };
    });
  },

  openAiDiff(path, oldContent, newContent, existsOnDisk = true, aiReview) {
    set((state) => {
      const existing = state.buffers[path];
      const tabs = state.tabs.includes(path) ? state.tabs : [...state.tabs, path];
      return {
        tabs,
        activeTabPath: path,
        buffers: {
          ...state.buffers,
          [path]: {
            ...(existing ?? {
              filePath: path,
              content: newContent,
              originalContent: oldContent,
              isModified: false,
              existsOnDisk,
            }),
            filePath: path,
            existsOnDisk: existing?.existsOnDisk ?? existsOnDisk,
            aiOriginalContent: oldContent,
            aiShadowContent: newContent,
            isAiDiffActive: true,
            aiReview,
          },
        },
      };
    });
  },

  closeFile(path) {
    set((state) => {
      const tabs = state.tabs.filter((t) => t !== path);
      const { [path]: _removed, ...buffers } = state.buffers;
      let activeTabPath = state.activeTabPath;
      if (activeTabPath === path) {
        const idx = state.tabs.indexOf(path);
        activeTabPath = tabs[idx] ?? tabs[idx - 1] ?? null;
      }
      return { buffers, tabs, activeTabPath };
    });
  },

  setActiveTab(path) {
    set({ activeTabPath: path });
  },
}));
