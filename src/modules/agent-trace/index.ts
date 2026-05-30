import type { ModuleEntry, ShellContext, Disposable } from '@byteforce/shell';
import { useLayoutStore } from '@byteforce/shell';
import manifest from './manifest';
import { AgentTracePanel } from './views/AgentTracePanel';

const agentTraceModule: ModuleEntry = {
  manifest,

  activate(ctx: ShellContext): Disposable[] {
    ctx.viewRegistry.update('toolbox.agent-trace.panel', {
      component: AgentTracePanel,
    });

    const disposables: Disposable[] = [];

    const openDisposable = ctx.commandRegistry.register({
      id: 'agent-trace.open',
      title: '打开 Agent 调用链路',
      category: '开发者工具',
    });
    ctx.commandRegistry.setHandler('agent-trace.open', () => {
      useLayoutStore.getState().setBottomPanelActiveTab('toolbox.agent-trace.panel');
      useLayoutStore.getState().setBottomPanelOpen(true);
    });
    disposables.push(openDisposable);

    const exportDisposable = ctx.commandRegistry.register({
      id: 'agent-trace.export',
      title: '导出 Agent 调用链路',
      category: '开发者工具',
    });
    ctx.commandRegistry.setHandler('agent-trace.export', () => {
      // Export is triggered from within the panel toolbar; command entry is
      // provided for command palette / keyboard shortcut binding.
      window.dispatchEvent(new CustomEvent('agent-trace:export'));
    });
    disposables.push(exportDisposable);

    return disposables;
  },
};

export default agentTraceModule;
