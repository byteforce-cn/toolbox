import type { Disposable, ModuleEntry, ShellContext } from '@byteforce/shell';
import manifest from './manifest';
import { SkillsSettingsPage } from './views/SkillsSettingsPage';

const skillsModule: ModuleEntry = {
  manifest,

  activate(ctx: ShellContext): Disposable[] {
    const disposables: Disposable[] = [];
    disposables.push(
      ctx.viewRegistry.register({
        id: 'toolbox.skills.settings',
        title: 'Skills 设置',
        location: 'main',
        hidden: true,
        component: SkillsSettingsPage,
      }),
    );
    return disposables;
  },
};

export default skillsModule;
