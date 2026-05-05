import type { Disposable, ModuleEntry, ShellContext } from '@byteforce/shell';
import manifest from './manifest';
import { McpSettingsPage } from './views/McpSettingsPage';

const mcpModule: ModuleEntry = {
  manifest,

  activate(ctx: ShellContext): Disposable[] {
    const disposables: Disposable[] = [];
    disposables.push(
      ctx.viewRegistry.register({
        id: 'toolbox.mcp.settings',
        title: 'MCP 设置',
        location: 'main',
        hidden: true,
        component: McpSettingsPage,
      }),
    );
    return disposables;
  },
};

export default mcpModule;
