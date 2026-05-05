import type { ModuleManifest } from '@byteforce/shell';

const manifest: ModuleManifest = {
  id: 'toolbox.agent',
  name: 'Agent',
  version: '0.1.0',
  activationEvents: ['*'],
  contributes: {
    configuration: {
      id: 'toolbox.agent',
      title: 'Agent',
      properties: [],
      // 引用通过 viewRegistry 注册的视图 ID
      component: 'toolbox.agent.settings',
    },
  },
};

export default manifest;
