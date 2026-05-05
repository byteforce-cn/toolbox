import type { ShellContext, Disposable } from '@byteforce/shell';
import { ExplorerSidebarView } from './views/ExplorerSidebarView';
import { EditorTabsView } from './views/EditorTabsView';
import { setExplorerRootPath, refreshExplorer } from './explorer-controller';
import { useExplorerStore } from './store/explorer-store';
import { useExplorerGitStatusStore } from './store/explorer-git-status-store';
import { tauriFsService } from './tauri-fs-service';
import { invokeAI } from '../ai-assistant/services/invoke-ai';

export default function activate(ctx: ShellContext): Disposable[] {
  const disposables: Disposable[] = [];

  ctx.viewRegistry.update('toolbox.explorer.sidebar', {
    component: ExplorerSidebarView,
  });

  ctx.viewRegistry.update('toolbox.explorer.editor', {
    component: EditorTabsView,
  });

  disposables.push(
    ctx.commandRegistry.register({
      id: 'explorer.openFolder',
      title: '打开文件夹…',
      handler: async () => {
        const dir = await tauriFsService.openDirectoryDialog();
        if (dir) await setExplorerRootPath(dir);
      },
    }),
  );

  disposables.push(
    ctx.commandRegistry.register({
      id: 'explorer.refresh',
      title: '刷新资源管理器',
      handler: async () => refreshExplorer(),
    }),
  );

  // 订阅 rootPath 变化：同步状态栏 + 触发 git 状态刷新
  let prevRootPath: string | null = useExplorerStore.getState().rootPath;
  const unsubWorkspace = useExplorerStore.subscribe((state) => {
    if (state.rootPath !== prevRootPath) {
      prevRootPath = state.rootPath;
      const text = state.rootPath
        ? (state.rootPath.split('/').pop() ?? state.rootPath)
        : '未打开文件夹';
      ctx.statusBarRegistry.register({
        id: 'toolbox.explorer.workspace',
        text,
        alignment: 'left',
        priority: 10,
      });
      // 触发 git 状态刷新（工作区切换时全量刷新）
      void useExplorerGitStatusStore.getState().refresh(state.rootPath ?? null);
      if (state.rootPath) {
        void ctx.configService?.set('toolbox.explorer.rootPath', state.rootPath);
        void invokeAI('workspace_set_dir', { dir: state.rootPath }).catch((error) => {
          console.warn('[explorer] sync workspace dir failed', error);
        });
      }
    }
  });
  disposables.push(unsubWorkspace);

  const savedRootPath = ctx.configService?.get<string>('toolbox.explorer.rootPath');
  if (savedRootPath?.trim()) {
    void setExplorerRootPath(savedRootPath);
  }

  return disposables;
}
