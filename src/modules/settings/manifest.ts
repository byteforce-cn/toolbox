import { Settings2 } from 'lucide-react';
import type { ModuleManifest } from '@byteforce/shell';

const manifest: ModuleManifest = {
  id: 'toolbox.settings',
  name: '设置',
  version: '0.1.0',
  activationEvents: ['*'],
  contributes: {
    views: [
      {
        id: 'toolbox.settings',
        title: '设置',
        location: 'sidebar',
        area: 'system',
        icon: Settings2,
        order: 999,
      },
      {
        id: 'toolbox.settings.page',
        title: '设置',
        location: 'main',
        hidden: true,
        order: 999,
      },
    ],
    configuration: {
      id: 'app',
      title: '通用',
      properties: [
        {
          id: 'theme',
          type: 'enum',
          default: 'system',
          title: '主题',
          enum: ['system', 'light', 'dark'],
          enumLabels: ['跟随系统', '浅色', '深色'],
        },
        {
          id: 'language',
          type: 'enum',
          default: 'zh-CN',
          title: '语言',
          enum: ['zh-CN', 'en-US'],
          enumLabels: ['简体中文', 'English'],
        },
      ],
    },
  },
};

export default manifest;
