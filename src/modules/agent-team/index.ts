import type { Disposable, ModuleEntry, ShellContext } from '@byteforce/shell';
import manifest from './manifest';
import { AgentTeamSettingsPage } from './views/AgentTeamSettingsPage';

const agentTeamModule: ModuleEntry = {
  manifest,

  activate(ctx: ShellContext): Disposable[] {
    const disposables: Disposable[] = [];
    disposables.push(
      ctx.viewRegistry.register({
        id: 'toolbox.agent-team.settings',
        title: 'Agent Team 设置',
        location: 'main',
        hidden: true,
        component: AgentTeamSettingsPage,
      }),
    );
    return disposables;
  },
};

export default agentTeamModule;
