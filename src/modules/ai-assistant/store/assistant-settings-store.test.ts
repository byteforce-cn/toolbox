import { beforeEach, describe, expect, it } from 'vitest';

import { useAssistantSettingsStore } from './assistant-settings-store';

describe('useAssistantSettingsStore', () => {
  beforeEach(() => {
    useAssistantSettingsStore.setState({
      sessionRailOpen: true,
    });
  });

  it('keeps session rail open by default', () => {
    expect(useAssistantSettingsStore.getState().sessionRailOpen).toBe(true);
  });

  it('toggles session rail visibility', () => {
    useAssistantSettingsStore.getState().setSessionRailOpen(false);
    expect(useAssistantSettingsStore.getState().sessionRailOpen).toBe(false);

    useAssistantSettingsStore.getState().setSessionRailOpen(true);
    expect(useAssistantSettingsStore.getState().sessionRailOpen).toBe(true);
  });
});