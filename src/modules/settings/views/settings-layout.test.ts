import { describe, expect, it } from 'vitest';

import {
  resolveSettingsLayout,
  resolveSettingsSurfaceClasses,
} from './settings-layout';

describe('resolveSettingsLayout', () => {
  it('marks skills settings as workbench by section id', () => {
    expect(resolveSettingsLayout({ id: 'toolbox.skills.settings' })).toBe('workbench');
  });

  it('marks skills settings as workbench by component id', () => {
    expect(resolveSettingsLayout({ component: 'toolbox.skills.settings' })).toBe('workbench');
  });

  it('defaults other sections to standard', () => {
    expect(resolveSettingsLayout({ id: 'ai.llm-provider' })).toBe('standard');
  });
});

describe('resolveSettingsSurfaceClasses', () => {
  it('returns full-height workbench classes', () => {
    const classes = resolveSettingsSurfaceClasses('workbench');
    expect(classes.scrollClass).toContain('overflow-hidden');
    expect(classes.containerClass).toContain('h-full');
    expect(classes.containerClass).not.toContain('max-w-2xl');
  });

  it('returns centered standard classes', () => {
    const classes = resolveSettingsSurfaceClasses('standard');
    expect(classes.scrollClass).toContain('overflow-y-auto');
    expect(classes.containerClass).toContain('max-w-2xl');
  });
});