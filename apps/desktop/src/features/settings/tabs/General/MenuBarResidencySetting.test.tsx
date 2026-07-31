import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { window as desktopWindow } from '@agiworkforce/desktop-command-client';
import { MenuBarResidencySetting } from './index';

vi.mock('@agiworkforce/desktop-command-client', () => ({
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

const nativeWindowState = {
  pinned: true,
  alwaysOnTop: false,
  keepInMenuBar: true,
  dock: undefined,
  maximized: false,
  fullscreen: false,
};

describe('MenuBarResidencySetting', () => {
  beforeEach(() => {
    vi.mocked(desktopWindow.windowGetState).mockResolvedValue(nativeWindowState);
    vi.mocked(desktopWindow.windowSetMenuBarMode).mockResolvedValue(undefined);
  });

  it('loads the native preference and explains close-to-menu-bar behavior', async () => {
    render(<MenuBarResidencySetting />);

    const toggle = screen.getByRole('switch', { name: 'Show in menu bar' });
    await waitFor(() => expect(toggle).toBeEnabled());

    expect(toggle).toBeChecked();
    expect(
      screen.getByText(
        'Keep AGI Workforce in the macOS menu bar or system tray when the main window is closed.',
      ),
    ).toBeVisible();
  });

  it('persists changes immediately through the native window owner', async () => {
    render(<MenuBarResidencySetting />);

    const toggle = screen.getByRole('switch', { name: 'Show in menu bar' });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(desktopWindow.windowSetMenuBarMode).toHaveBeenCalledWith(false);
    });
    expect(toggle).not.toBeChecked();
  });

  it('restores the previous value when native persistence fails', async () => {
    vi.mocked(desktopWindow.windowSetMenuBarMode).mockRejectedValueOnce(
      new Error('tray unavailable'),
    );
    render(<MenuBarResidencySetting />);

    const toggle = screen.getByRole('switch', { name: 'Show in menu bar' });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not update the menu bar preference.',
    );
    expect(toggle).toBeChecked();
  });
});
