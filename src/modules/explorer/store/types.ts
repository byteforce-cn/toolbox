/**
 * Explorer module type definitions.
 */

export interface FileNode {
  path: string;
  name: string;
  kind: 'file' | 'dir';
  virtualSource?: 'review-file' | 'review-dir' | 'draft-file' | 'draft-dir';
  size?: number;
  children?: FileNode[];
  isExpanded?: boolean;
  isLoading?: boolean;
}

export interface ExplorerState {
  rootPath: string | null;
  tree: FileNode[];
  expandedPaths: Set<string>;
  selectedPath: string | null;
  focusedPath: string | null;
  isLoading: boolean;
  error: string | null;
}
