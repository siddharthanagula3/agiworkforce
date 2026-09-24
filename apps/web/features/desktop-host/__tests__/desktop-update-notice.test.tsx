import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { hostBridgeStub } from '@/test/host-bridge-stub';
import { DesktopUpdateNotice } from '../components/DesktopUpdateNotice';

function host(overrides: Partial<HostBridge> = {}): HostBridge {
  return { ...hostBridgeStub(), ...overrides };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('DesktopUpdateNotice', () => {
  it('checks on startup and presents an available installer inside the app', async () => {
    const openUpdateInstaller = vi.fn(async () => undefined);
    const checkForUpdate = vi.fn(async () => ({
      available: true,
      currentVersion: '1.2.0',
      version: '1.3.0',
      downloadUrl: 'https://agiworkforce.com/download',
    }));
    render(<DesktopUpdateNotice host={host({ checkForUpdate, openUpdateInstaller })} />);

    expect(await screen.findByRole('status')).toHaveTextContent('AGI Cloud 1.3.0 is available');
    fireEvent.click(screen.getByRole('button', { name: 'Download installer' }));
    expect(openUpdateInstaller).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a check performed within the daily interval', async () => {
    window.localStorage.setItem('agi-desktop-update-last-check:v1', JSON.stringify(Date.now()));
    const checkForUpdate = vi.fn();
    render(<DesktopUpdateNotice host={host({ checkForUpdate })} />);

    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it('keeps a dismissed version quiet on later automatic checks', async () => {
    const checkForUpdate = vi.fn(async () => ({
      available: true,
      currentVersion: '1.2.0',
      version: '1.3.0',
      downloadUrl: 'https://agiworkforce.com/download',
    }));
    const view = render(<DesktopUpdateNotice host={host({ checkForUpdate })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    view.unmount();

    window.localStorage.setItem('agi-desktop-update-last-check:v1', JSON.stringify(0));
    render(<DesktopUpdateNotice host={host({ checkForUpdate })} />);

    await waitFor(() => expect(checkForUpdate).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
