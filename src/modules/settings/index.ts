import type { ModuleEntry, ShellContext, Disposable } from '@byteforce/shell';
import manifest from './manifest';
import { SettingsMenuView } from './views/SettingsMenuView';
import { SettingsPage } from './views/SettingsPage';

function applyTheme(theme: unknown): void {
  const t = String(theme ?? 'system');
  const root = document.documentElement;
  if (t === 'dark') {
    root.classList.add('dark');
  } else if (t === 'light') {
    root.classList.remove('dark');
  } else {
    // system — 跟随 OS 偏好
    root.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
}

const settingsModule: ModuleEntry = {
  manifest,

  activate(ctx: ShellContext): Disposable[] {
    ctx.viewRegistry.update('toolbox.settings', {
      component: SettingsMenuView,
    });
    ctx.viewRegistry.update('toolbox.settings.page', {
      component: SettingsPage,
    });

    // 应用初始主题并订阅变更
    applyTheme(ctx.configService?.get('app.theme'));
    const disposables: Disposable[] = [];
    const unsubTheme = ctx.configService?.onDidChange('app.theme', applyTheme);
    if (unsubTheme) disposables.push(unsubTheme);

    // system 主题需同步跟随 OS 偏好变化
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMqChange = () => {
      if (String(ctx.configService?.get('app.theme') ?? 'system') === 'system') {
        document.documentElement.classList.toggle('dark', mq.matches);
      }
    };
    mq.addEventListener('change', onMqChange);
    disposables.push(() => mq.removeEventListener('change', onMqChange));

    return disposables;
  },
};

export default settingsModule;
