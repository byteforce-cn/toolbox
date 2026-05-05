import type { Disposable, ModuleEntry, ShellContext } from '@byteforce/shell';
import manifest from './manifest';
import { AgentSettingsPage } from './views/AgentSettingsPage';

const agentModule: ModuleEntry = {
  manifest,

  activate(ctx: ShellContext): Disposable[] {
    const disposables: Disposable[] = [];

    // 通过 viewRegistry 注册自定义设置 section 渲染器。
    // SettingsPage 会按 manifest.contributes.configuration.component 查找此 ID。
    const dispose = ctx.viewRegistry.register({
      id: 'toolbox.agent.settings',
      title: 'Agent 设置',
      location: 'main',
      hidden: true,
      component: AgentSettingsPage,
    });
    disposables.push(dispose);

    return disposables;
  },
};

export default agentModule;
