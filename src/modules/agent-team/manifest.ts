import type { ModuleManifest } from '@byteforce/shell';

const manifest: ModuleManifest = {
  id: 'toolbox.agent-team',
  name: 'Agent Team',
  version: '0.1.0',
  activationEvents: ['*'],
  contributes: {
    configuration: {
      id: 'toolbox.agent-team',
      title: 'Agent Team',
      properties: [],
      component: 'toolbox.agent-team.settings',
    },
  },
};

export default manifest;
