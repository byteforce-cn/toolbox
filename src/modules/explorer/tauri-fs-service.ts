import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';

export interface DirEntry {
  path: string;
  name: string;
  isDirectory: boolean;
}

/**
 * TauriFsService — 所有文件操作通过后端 workspace_fs broker 代理，
 * 不再直接调用 @tauri-apps/plugin-fs（该插件权限已从 capability 移除）。
 *
 * 使用前必须先注册 workspace root：
 *   await tauriFsService.registerWorkspace(id, rootPath)
 *
 * workspace_id 由调用方（workspace-store）维护并传入。
 */
export class TauriFsService {
  async registerWorkspace(workspaceId: string, rootPath: string): Promise<void> {
    await invoke('workspace_register', { workspaceId, rootPath });
  }

  async unregisterWorkspace(workspaceId: string): Promise<void> {
    await invoke('workspace_unregister', { workspaceId });
  }

  async readDirectory(workspaceId: string, path: string): Promise<DirEntry[]> {
    const entries = await invoke<Array<{ path: string; name: string; is_directory: boolean }>>(
      'workspace_read_dir',
      { workspaceId, path }
    );
    return entries.map((e) => ({
      path: e.path,
      name: e.name,
      isDirectory: e.is_directory,
    }));
  }

  async openDirectoryDialog(): Promise<string | null> {
    const selected = await openDialog({ directory: true, multiple: false });
    return Array.isArray(selected) ? (selected[0] ?? null) : selected;
  }

  async createFile(workspaceId: string, path: string): Promise<void> {
    await invoke('workspace_write_text_file', { workspaceId, path, content: '' });
  }

  async createDirectory(workspaceId: string, path: string): Promise<void> {
    await invoke('workspace_mkdir', { workspaceId, path });
  }

  async rename(workspaceId: string, oldPath: string, newPath: string): Promise<void> {
    await invoke('workspace_rename', { workspaceId, oldPath, newPath });
  }

  async remove(workspaceId: string, path: string, isDirectory: boolean): Promise<void> {
    await invoke('workspace_remove', { workspaceId, path, recursive: isDirectory });
  }

  async openInSystemExplorer(path: string): Promise<void> {
    await openPath(path);
  }

  async readTextFile(workspaceId: string, path: string): Promise<string> {
    return invoke<string>('workspace_read_text_file', { workspaceId, path });
  }

  async writeTextFile(workspaceId: string, path: string, content: string): Promise<void> {
    await invoke('workspace_write_text_file', { workspaceId, path, content });
  }

  async exists(workspaceId: string, path: string): Promise<boolean> {
    return invoke<boolean>('workspace_exists', { workspaceId, path });
  }

  /**
   * 从 workspace 外部复制单个文件到 workspace 内目标目录。
   * 场景：VSCode / Finder Cmd+C 复制文件后，在资源管理器 Cmd+V 粘贴。
   *
   * @param srcAbsolute     源文件绝对路径（workspace 外部）
   * @param destDirAbsolute 目标目录绝对路径（workspace 内）
   * @returns 实际写入的目标文件绝对路径（有冲突时自动追加 _copy 后缀）
   */
  async copyExternalFile(
    workspaceId: string,
    srcAbsolute: string,
    destDirAbsolute: string,
  ): Promise<string> {
    return invoke<string>('workspace_copy_external_file', {
      workspaceId,
      srcAbsolute,
      destDirAbsolute,
    });
  }
}

export const tauriFsService = new TauriFsService();
