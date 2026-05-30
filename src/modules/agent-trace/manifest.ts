import { Network } from 'lucide-react';
import type { ModuleManifest } from '@byteforce/shell';

const manifest: ModuleManifest = {
  id: 'toolbox.agent-trace',
  name: 'Agent 调用链路',
  version: '0.1.0',
  activationEvents: ['*'],
  contributes: {
    views: [
      {
        id: 'toolbox.agent-trace.panel',
        title: 'Agent 调用链路',
        location: 'bottom',
        icon: Network,
        order: 10,
      },
    ],
    commands: [
      {
        id: 'agent-trace.open',
        title: '打开 Agent 调用链路',
        category: '开发者工具',
      },
      {
        id: 'agent-trace.export',
        title: '导出 Agent 调用链路',
        category: '开发者工具',
      },
    ],
  },
};

export default manifest;
