import { useSyncExternalStore } from 'react';
import { GenericSettingsSection, useShellContext } from '@byteforce/shell';
import {
  getSelectedSectionId,
  subscribeToSettingsStore,
} from '../settings-store';
import { LLMProviderSettingsPage } from '../../ai-assistant/views/LLMProviderSettingsPage';
import {
  resolveSettingsLayout,
  resolveSettingsSurfaceClasses,
} from './settings-layout';

/**
 * 自定义 section 渲染组件查找表。
 *
 * 解析顺序：
 *   1. viewRegistry 中以 `<componentId>` 注册的视图（推荐：模块自包含）。
 *   2. 此静态映射表（向后兼容遗留模块）。
 */
const CUSTOM_SECTION_COMPONENTS: Record<string, React.ComponentType> = {
  'ai.llm-provider': LLMProviderSettingsPage,
};

export function SettingsPage() {
  const { configService, viewRegistry } = useShellContext();
  const sections = configService?.getSections() ?? [];

  const selectedId = useSyncExternalStore(
    subscribeToSettingsStore,
    getSelectedSectionId,
  );

  const section =
    sections.find((s) => s.id === selectedId) ?? sections[0];

  if (!section) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        暂无可用的设置项
      </div>
    );
  }

  const CustomComponent = section.component
    ? viewRegistry?.get(section.component)?.component
      ?? CUSTOM_SECTION_COMPONENTS[section.component]
    : undefined;

  const layout = resolveSettingsLayout(section);
  const surfaceClasses = resolveSettingsSurfaceClasses(layout);

  if (CustomComponent) {
    return (
      <div className={surfaceClasses.scrollClass}>
        <div className={surfaceClasses.containerClass}>
          <CustomComponent />
        </div>
      </div>
    );
  }

  return (
    <div className={surfaceClasses.scrollClass}>
      <div className={surfaceClasses.containerClass}>
        <GenericSettingsSection section={section} />
      </div>
    </div>
  );
}
