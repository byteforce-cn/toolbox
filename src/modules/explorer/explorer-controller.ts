import { tauriFsService } from './tauri-fs-service';
import { useExplorerStore } from './store/explorer-store';
import { useWorkspaceStore } from '../../store/workspace-store';
import type { FileNode } from './store/types';
import { batchRefreshTargets } from './utils/refresh-targets';
import { basename, dirname, sortNodes, updateNode } from './utils/file-utils';

function buildNodes(
  entries: Array<{ path: string; name: string; isDirectory: boolean }>,
): FileNode[] {
  return entries.map((entry) => ({
    path: entry.path,
    name: entry.name,
    kind: entry.isDirectory ? 'dir' : 'file',
  }));
}

function setError(error: unknown): void {
  useExplorerStore.getState().setError(String(error));
}

function isSameOrDescendantPath(path: string, candidate: string): boolean {
  return path === candidate || path.startsWith(`${candidate}/`);
}

function getWorkspaceId(): string {
  const id = useWorkspaceStore.getState().workspaceId;
  if (!id) throw new Error('No workspace registered');
  return id;
}

async function refreshDirectoryTarget(
  target: string,
  rootPath: string,
  allowFallback = true,
): Promise<void> {
  if (target === rootPath) {
    await setExplorerRootPath(rootPath);
    return;
  }

  try {
    const entries = await tauriFsService.readDirectory(getWorkspaceId(), target);
    const children = sortNodes(buildNodes(entries));
    useExplorerStore.getState().setTree(
      updateNode(useExplorerStore.getState().tree, target, (node) => ({
        ...node,
        children,
      })),
    );
  } catch (error) {
    if (allowFallback) {
      const fallbackTarget =
        batchRefreshTargets([dirname(target)], rootPath, useExplorerStore.getState().tree, {
          maxTargets: 1,
        })[0] ?? rootPath;
      if (fallbackTarget !== target) {
        await refreshDirectoryTarget(fallbackTarget, rootPath, false);
        return;
      }
    }
    setError(error);
  }
}

export async function setExplorerRootPath(path: string): Promise<void> {
  // Update loading state without rootPath first — workspace registration is async
  // and must complete before readDirectory can be called.
  useExplorerStore.getState().setLoadingState({
    isLoading: true,
    error: null,
    tree: [],
    expandedPaths: new Set(),
  });
  // Set rootPath on explorer store so UI shows the new path immediately.
  useExplorerStore.setState({ rootPath: path });
  // Await workspace registration so getWorkspaceId() returns a valid ID.
  await useWorkspaceStore.getState().setRootPath(path);

  try {
    const entries = await tauriFsService.readDirectory(getWorkspaceId(), path);
    useExplorerStore.getState().setTree(sortNodes(buildNodes(entries)));
    useExplorerStore.getState().setLoadingState({ isLoading: false });
  } catch (error) {
    useExplorerStore.getState().setLoadingState({
      isLoading: false,
      error: String(error),
    });
  }
}

export async function toggleExplorerExpand(path: string): Promise<void> {
  const state = useExplorerStore.getState();
  const isExpanded = state.expandedPaths.has(path);

  if (isExpanded) {
    const next = new Set(state.expandedPaths);
    next.delete(path);
    useExplorerStore.getState().setExpandedPaths(next);
    return;
  }

  const nextPaths = new Set(state.expandedPaths);
  nextPaths.add(path);
  useExplorerStore.getState().setExpandedPaths(nextPaths);
  useExplorerStore.getState().setTree(
    updateNode(state.tree, path, (node) => ({ ...node, isLoading: true })),
  );

  try {
    const entries = await tauriFsService.readDirectory(getWorkspaceId(), path);
    const children = sortNodes(buildNodes(entries));
    useExplorerStore.getState().setTree(
      updateNode(useExplorerStore.getState().tree, path, (node) => ({
        ...node,
        isLoading: false,
        children,
      })),
    );
  } catch (error) {
    // 展开失败：撤销展开状态，静默处理（不设全局错误横幅，权限不足/IO 错误是正常情况）
    const rollback = new Set(useExplorerStore.getState().expandedPaths);
    rollback.delete(path);
    useExplorerStore.getState().setExpandedPaths(rollback);
    useExplorerStore.getState().setTree(
      updateNode(useExplorerStore.getState().tree, path, (node) => ({
        ...node,
        isLoading: false,
      })),
    );
    console.warn('[explorer] cannot expand', path, error);
  }
}

export async function refreshExplorer(path?: string | string[]): Promise<void> {
  const { rootPath } = useExplorerStore.getState();
  if (!rootPath) return;

  const requestedPaths = Array.isArray(path)
    ? path.filter(Boolean)
    : path
      ? [path]
      : [];

  if (requestedPaths.length === 0) {
    await setExplorerRootPath(rootPath);
    return;
  }

  const targets = batchRefreshTargets(
    requestedPaths,
    rootPath,
    useExplorerStore.getState().tree,
  );
  for (const target of targets) {
    await refreshDirectoryTarget(target, rootPath);
  }
}

export async function createExplorerFile(parentPath: string, name: string): Promise<void> {
  await tauriFsService.createFile(getWorkspaceId(), `${parentPath}/${name}`);
  await refreshExplorer(parentPath);
}

export async function createExplorerDir(parentPath: string, name: string): Promise<void> {
  await tauriFsService.createDirectory(getWorkspaceId(), `${parentPath}/${name}`);
  await refreshExplorer(parentPath);
}

export async function renameExplorerNode(oldPath: string, newPath: string): Promise<void> {
  await tauriFsService.rename(getWorkspaceId(), oldPath, newPath);
  const parentPath = oldPath.split('/').slice(0, -1).join('/');
  await refreshExplorer(parentPath || (useExplorerStore.getState().rootPath ?? undefined));
}

export async function moveExplorerNode(sourcePath: string, targetDirPath: string): Promise<void> {
  // Guard: prevent moving into self or a descendant of the source
  if (isSameOrDescendantPath(targetDirPath, sourcePath)) return;
  const name = basename(sourcePath);
  const newPath = `${targetDirPath}/${name}`;
  // Guard: already lives in that directory
  if (newPath === sourcePath) return;
  await tauriFsService.rename(getWorkspaceId(), sourcePath, newPath);
  const sourceParent = dirname(sourcePath);
  // Refresh both affected directories (dedup when they are the same)
  const targets = sourceParent === targetDirPath ? [targetDirPath] : [sourceParent, targetDirPath];
  await refreshExplorer(targets);
}

export async function deleteExplorerNode(path: string): Promise<void> {
  const state = useExplorerStore.getState();
  // 找到节点以判断是否为目录
  const isDir = (function find(nodes: FileNode[]): boolean {
    for (const node of nodes) {
      if (node.path === path) return node.kind === 'dir';
      if (node.children) {
        const result = find(node.children);
        if (result) return result;
      }
    }
    return false;
  })(state.tree);

  await tauriFsService.remove(getWorkspaceId(), path, isDir);

  const parentPath = path.split('/').slice(0, -1).join('/');
  await refreshExplorer(parentPath || (state.rootPath ?? undefined));

  if (useExplorerStore.getState().selectedPath === path) {
    useExplorerStore.getState().selectNode(null);
  }
}

/**
 * 将系统剪贴板中的外部文件（VSCode / Finder Cmd+C）粘贴到资源管理器指定目录。
 *
 * @param destDirAbsolute 目标目录绝对路径（必须在 workspace 内）
 * @param srcPaths        源文件绝对路径列表（从系统剪贴板读取）
 * @returns 成功复制的目标文件路径列表
 */
export async function pasteExternalFilesToDir(
  destDirAbsolute: string,
  srcPaths: string[],
): Promise<string[]> {
  const wsId = getWorkspaceId();
  const results: string[] = [];

  for (const src of srcPaths) {
    const destPath = await tauriFsService.copyExternalFile(wsId, src, destDirAbsolute);
    results.push(destPath);
  }

  await refreshExplorer(destDirAbsolute);
  return results;
}

export { isSameOrDescendantPath };
