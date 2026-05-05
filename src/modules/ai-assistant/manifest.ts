import { Bot } from 'lucide-react';
import type { ModuleManifest } from '@byteforce/shell';

const manifest: ModuleManifest = {
  id: 'toolbox.ai-assistant',
  name: 'AI 助手',
  version: '0.1.0',
  activationEvents: ['*'],
  contributes: {
    views: [
      {
        id: 'toolbox.ai-assistant.panel',
        title: 'AI 助手',
        location: 'right-panel',
        icon: Bot,
        area: 'app',
        order: 1,
      },
    ],
    commands: [
      { id: 'ai-assistant.focus', title: '聚焦 AI 助手', category: 'AI' },
      { id: 'ai-assistant.newChat', title: '新建会话', category: 'AI' },
    ],
    configuration: {
      id: 'ai-assistant',
      title: 'LLM 提供商',
      properties: [],
      component: 'ai.llm-provider',
    },
  },
};

export default manifest;
