import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const preferences = vi.hoisted(() => ({
  fetchStoredPreferenceNamespace: vi.fn(),
  savePreferenceNamespace: vi.fn(),
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchStoredPreferenceNamespace: preferences.fetchStoredPreferenceNamespace,
  savePreferenceNamespace: preferences.savePreferenceNamespace,
}));

import { DeviceSignInToggle } from '../DeviceSignInToggle';

const SWITCH_NAME = 'Approve sign-in from a device code';

beforeEach(() => {
  preferences.fetchStoredPreferenceNamespace.mockReset();
  preferences.savePreferenceNamespace.mockReset();
  preferences.fetchStoredPreferenceNamespace.mockResolvedValue({
    deviceCodeSignInEnabled: false,
  });
  preferences.savePreferenceNamespace.mockResolvedValue({ version: null });
});

// Against the hand-rolled button this row drew before 951653d97d, which had
// neither data-state nor the shared unchecked edge, both render checks fail.
describe('the device-code sign-in switch', () => {
  it('is the shared switch, whose off state keeps a visible edge', async () => {
    render(<DeviceSignInToggle />);

    const toggle = screen.getByRole('switch', { name: SWITCH_NAME });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
    expect(toggle.className).toContain('data-[state=unchecked]:border-muted-foreground');
  });

  it('turns device-code sign-in back on from the shared switch and saves it', async () => {
    render(<DeviceSignInToggle />);

    const toggle = screen.getByRole('switch', { name: SWITCH_NAME });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);

    await waitFor(() =>
      expect(preferences.savePreferenceNamespace).toHaveBeenCalledWith('security', {
        deviceCodeSignInEnabled: true,
      }),
    );
    expect(toggle).toHaveAttribute('data-state', 'checked');
  });
});
