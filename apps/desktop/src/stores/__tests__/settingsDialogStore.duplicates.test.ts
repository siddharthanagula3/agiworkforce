import { describe, expect, it } from 'vitest';

import { useSettingsDialogStore as canonicalSettingsStore } from '../settings/dialog';
import { useSettingsDialogStore as legacySettingsStore } from '../settingsDialogStore';

describe('settings dialog store ownership', () => {
  it('keeps legacy and canonical imports on the same store instance', () => {
    expect(legacySettingsStore).toBe(canonicalSettingsStore);
  });

  it('propagates legacy writes to the desktop SettingsPanel state', () => {
    canonicalSettingsStore.setState({
      settingsOpen: false,
      settingsInitialTab: 'general',
      shortcutsOpen: false,
    });

    legacySettingsStore.getState().openSettings('memory');

    expect(canonicalSettingsStore.getState().settingsOpen).toBe(true);
    expect(canonicalSettingsStore.getState().settingsInitialTab).toBe('memory');
  });
});
