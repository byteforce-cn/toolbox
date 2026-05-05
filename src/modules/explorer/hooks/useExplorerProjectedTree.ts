import { useExplorerStore } from '../store/explorer-store';
import type { FileNode } from '../store/types';

/**
 * Phase 1：透明投影，直接返回文件树。
 * Phase 3：调用 tree-projection.ts，注入 AI review/draft 虚拟节点。
 */
export function useExplorerProjectedTree(): FileNode[] {
  return useExplorerStore((s) => s.tree);
}
