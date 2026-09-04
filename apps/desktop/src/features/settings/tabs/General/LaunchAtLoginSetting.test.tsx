import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { autostart } from '@agiworkforce/desktop-command-client';
import { LaunchAtLoginSetting } from './index';

vi.mock('@agiworkforce/desktop-command-client', () => ({
  autostart: {
    autostartGetEnabled: vi.fn(),
    autostartSetEnabled: vi.fn(),
  },
  window: {
    windowGetState: vi.fn(),
    windowSetMenuBarMode: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('LaunchAtLoginSetting', () => {
  beforeEach(() => {
    vi.mocked(autostart.autostartGetEnabled).mockResolvedValue(false);
    vi.mocked(autostart.autostartSetEnabled).mockResolvedValue(undefined);
  });

  it('loads the native preference and explains what it does', async () => {
    render(<LaunchAtLoginSetting />);

    const toggle = screen.getByRole('switch', { name: 'Launch at login' });
    await waitFor(() => expect(toggle).toBeEnabled());

    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText('Start AGI Workforce automatically when you sign in to this device.'),
    ).toBeVisible();
  });

  it('persists changes immediately through the native autostart owner', async () => {
    render(<LaunchAtLoginSetting />);

    const toggle = screen.getByRole('switch', { name: 'Launch at login' });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(autostart.autostartSetEnabled).toHaveBeenCalledWith(true);
    });
    expect(toggle).toBeChecked();
  });

  it('restores the previous value when native persistence fails', async () => {
    vi.mocked(autostart.autostartSetEnabled).mockRejectedValueOnce(
      new Error('login item registration unavailable'),
    );
    render(<LaunchAtLoginSetting />);

    const toggle = screen.getByRole('switch', { name: 'Launch at login' });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not update the launch-at-login preference.',
    );
    expect(toggle).not.toBeChecked();
  });
});
