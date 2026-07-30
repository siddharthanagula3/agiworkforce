import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useSettingsStore } from '../../stores/settingsStore';
import { ThemeSettings } from './ThemeSettings';

describe('ThemeSettings accessibility preferences', () => {
  beforeEach(() => {
    useSettingsStore.getState().setUiScale(100);
    useSettingsStore.getState().setReduceMotion(false);
  });

  afterEach(() => {
    cleanup();
    document.documentElement.style.removeProperty('font-size');
    document.documentElement.classList.remove('reduce-motion');
  });

  it('applies and persists interface size and the reduce-motion override', async () => {
    const user = userEvent.setup();
    render(<ThemeSettings />);

    await user.click(screen.getByRole('button', { name: 'Large' }));
    expect(useSettingsStore.getState().windowPreferences.uiScale).toBe(110);
    expect(document.documentElement.style.fontSize).toBe('110%');

    await user.click(screen.getByRole('switch', { name: 'Reduce motion' }));
    expect(useSettingsStore.getState().windowPreferences.reduceMotion).toBe(true);
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(true);
  });
});
