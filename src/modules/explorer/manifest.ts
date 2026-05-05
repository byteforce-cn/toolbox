import type { ModuleManifest } from '@byteforce/shell';
import { Files } from 'lucide-react';

const manifest: ModuleManifest = {
  id: 'toolbox.explorer',
  name: '文件资源管理器',
  version: '0.1.0',
  activationEvents: ['*'],
  contributes: {
    views: [
      {
        id: 'toolbox.explorer.sidebar',
        title: '资源管理器',
        location: 'sidebar',
        icon: Files,
        area: 'app',
        order: 1,
      },
      {
        id: 'toolbox.explorer.editor',
        title: '编辑器',
        location: 'main',
        hidden: true,
      },
    ],
    commands: [
      { id: 'explorer.openFolder', title: '打开文件夹…', category: 'Explorer' },
      { id: 'explorer.refresh', title: '刷新资源管理器', category: 'Explorer' },
    ],
    configuration: {
      id: 'toolbox.explorer',
      title: '资源管理器',
      properties: [
        {
          id: 'rootPath',
          type: 'string',
          default: '',
          title: '工作区根目录',
          description: '上次打开的工作区目录，启动时自动恢复。',
        },
      ],
    },
  },
};

export default manifest;
