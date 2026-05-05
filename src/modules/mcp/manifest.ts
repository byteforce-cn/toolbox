import type { ModuleManifest } from '@byteforce/shell';

const manifest: ModuleManifest = {
  id: 'toolbox.mcp',
  name: 'MCP',
  version: '0.1.0',
  activationEvents: ['*'],
  contributes: {
    configuration: {
      id: 'toolbox.mcp',
      title: 'MCP 服务器',
      properties: [],
      component: 'toolbox.mcp.settings',
    },
  },
};

export default manifest;
