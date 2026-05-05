export type SettingsLayoutMode = 'standard' | 'workbench';

interface SettingsSectionLike {
  id?: string;
  component?: unknown;
}

const WORKBENCH_SECTION_IDS = new Set(['toolbox.skills.settings']);
const WORKBENCH_COMPONENT_IDS = new Set(['toolbox.skills.settings']);

export interface SettingsSurfaceClasses {
  scrollClass: string;
  containerClass: string;
}

export function resolveSettingsLayout(section: SettingsSectionLike | null | undefined): SettingsLayoutMode {
  const componentId = typeof section?.component === 'string' ? section.component : undefined;
  if ((section?.id && WORKBENCH_SECTION_IDS.has(section.id)) || (componentId && WORKBENCH_COMPONENT_IDS.has(componentId))) {
    return 'workbench';
  }
  return 'standard';
}

export function resolveSettingsSurfaceClasses(layout: SettingsLayoutMode): SettingsSurfaceClasses {
  if (layout === 'workbench') {
    return {
      scrollClass: 'h-full overflow-hidden',
      containerClass: 'h-full min-w-0 px-6 py-6 lg:px-8 lg:py-8',
    };
  }

  return {
    scrollClass: 'h-full overflow-y-auto',
    containerClass: 'mx-auto max-w-2xl px-8 py-8',
  };
}