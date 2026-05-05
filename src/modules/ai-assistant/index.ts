import type { ModuleEntry, ShellContext, Disposable } from '@byteforce/shell';
import { useLayoutStore } from '@byteforce/shell';
import manifest from './manifest';
import { AiAssistantPanel } from './views/Sidebar';

const aiAssistantModule: ModuleEntry = {
  manifest,

  activate(ctx: ShellContext): Disposable[] {
    ctx.viewRegistry.update('toolbox.ai-assistant.panel', {
      component: AiAssistantPanel,
    });

    const disposables: Disposable[] = [];

    // 注册命令：聚焦 AI 助手面板
    const focusDisposable = ctx.commandRegistry.register({
      id: 'ai-assistant.focus',
      title: '聚焦 AI 助手',
      category: 'AI',
    });
    ctx.commandRegistry.setHandler('ai-assistant.focus', () => {
      useLayoutStore.getState().setRightPanelOpen(true);
    });
    disposables.push(focusDisposable);

    // 注册命令：新建会话（Phase 2 实现具体逻辑）
    const newChatDisposable = ctx.commandRegistry.register({
      id: 'ai-assistant.newChat',
      title: '新建会话',
      category: 'AI',
    });
    ctx.commandRegistry.setHandler('ai-assistant.newChat', () => {
      window.dispatchEvent(new CustomEvent('ai-assistant:new-chat'));
    });
    disposables.push(newChatDisposable);

    return disposables;
  },
};

export default aiAssistantModule;

