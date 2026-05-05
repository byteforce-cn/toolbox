import type { ModuleManifest } from '@byteforce/shell';

const manifest: ModuleManifest = {
  id: 'toolbox.skills',
  name: 'Skills',
  version: '0.1.0',
  activationEvents: ['*'],
  contributes: {
    configuration: {
      id: 'toolbox.skills',
      title: 'Skills',
      properties: [],
      component: 'toolbox.skills.settings',
    },
  },
};

export default manifest;
