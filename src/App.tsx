import { ShellProvider, ShellLayout } from '@byteforce/shell';
import { ConfigurationService } from './services/configuration-service';
import { SecretService } from './services/secret-service';
import settingsModule from './modules/settings';
import explorerModule from './modules/explorer';
import aiAssistantModule from './modules/ai-assistant';
import agentModule from './modules/agent';
import agentTeamModule from './modules/agent-team';
import mcpModule from './modules/mcp';
import skillsModule from './modules/skills';
import agentTraceModule from './modules/agent-trace';
import { TitleBarActions } from './components/TitleBarActions';
import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

const secretService = new SecretService();
const configService = new ConfigurationService(secretService);
const isMac = navigator.userAgent.includes('Mac OS X');

const BUILT_IN_MODULES = [
  settingsModule,
  explorerModule,
  aiAssistantModule,
  agentModule,
  agentTeamModule,
  mcpModule,
  skillsModule,
  agentTraceModule,
];

function App() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    win.isFullscreen().then(setIsFullscreen);
    let unlisten: (() => void) | undefined;
    win.onResized(() => {
      win.isFullscreen().then(setIsFullscreen);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);
  
  return (
    <ShellProvider  modules={BUILT_IN_MODULES} services={{ configService, secretService }}>
         <ShellLayout
        title="Toolbox"
        isTauri
        isMac={isMac}
        isFullscreen={isFullscreen}
        macTrafficLightWidth={68}
        titleBarRight={<TitleBarActions />}
      />
    </ShellProvider>
  );
}

export default App;
