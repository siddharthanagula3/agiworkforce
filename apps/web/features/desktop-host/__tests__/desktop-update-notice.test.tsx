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

  it('offers a restart once the shell has downloaded the update', async () => {
    const openUpdateInstaller = vi.fn(async () => undefined);
    const restartToUpdate = vi.fn(async () => undefined);
    const checkForUpdate = vi.fn(async () => ({
      available: true,
      currentVersion: '1.2.0',
      version: '1.3.0',
      downloadUrl: 'https://agiworkforce.com/download',
      readyToInstall: true,
    }));
    render(
      <DesktopUpdateNotice host={host({ checkForUpdate, openUpdateInstaller, restartToUpdate })} />,
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'AGI Cloud 1.3.0 is ready to install',
    );
    expect(screen.queryByRole('button', { name: 'Download installer' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restart to update' }));
    expect(restartToUpdate).toHaveBeenCalledTimes(1);
    expect(openUpdateInstaller).not.toHaveBeenCalled();
  });

  it('says so when the restart into the update fails, without the raw bridge error', async () => {
    const restartToUpdate = vi.fn(async () => {
      throw new Error(
        "Error invoking remote method 'agi:restart-to-update': Error: No downloaded update is ready to install.",
      );
    });
    const checkForUpdate = vi.fn(async () => ({
      available: true,
      currentVersion: '1.2.0',
      version: '1.3.0',
      downloadUrl: 'https://agiworkforce.com/download',
      readyToInstall: true,
    }));
    render(<DesktopUpdateNotice host={host({ checkForUpdate, restartToUpdate })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Restart to update' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('AGI Cloud could not restart to install the update.');
    expect(alert).not.toHaveTextContent('Error invoking remote method');
    expect(screen.getByRole('button', { name: 'Restart to update' })).toBeEnabled();
  });

  it.each([
    ['deferred', 'The update will install the next time AGI Cloud quits.'],
    ['not-ready', 'The update has not finished downloading.'],
  ] as const)('says what happened when the restart is %s', async (outcome, text) => {
    const restartToUpdate = vi.fn(async () => outcome);
    const checkForUpdate = vi.fn(async () => ({
      available: true,
      currentVersion: '1.2.0',
      version: '1.3.0',
      downloadUrl: 'https://agiworkforce.com/download',
      readyToInstall: true,
    }));
    render(<DesktopUpdateNotice host={host({ checkForUpdate, restartToUpdate })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Restart to update' }));

    expect(await screen.findByText(new RegExp(text, 'u'))).toBeInTheDocument();
  });

  // A shell without the restart call is offered the download, which is all
  // its installer button has ever done.
  it('offers the download on a shell that cannot restart into an update', async () => {
    const openUpdateInstaller = vi.fn(async () => undefined);
    const checkForUpdate = vi.fn(async () => ({
      available: true,
      currentVersion: '1.2.0',
      version: '1.3.0',
      downloadUrl: 'https://agiworkforce.com/download',
      readyToInstall: true,
    }));
    render(<DesktopUpdateNotice host={host({ checkForUpdate, openUpdateInstaller })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Download installer' }));
    expect(openUpdateInstaller).toHaveBeenCalledTimes(1);
  });

  it('stays hidden while the update is still downloading', async () => {
    const checkForUpdate = vi.fn(async () => ({
      available: true,
      currentVersion: '1.2.0',
      version: '1.3.0',
      downloadUrl: 'https://agiworkforce.com/download',
      downloading: true,
    }));
    render(<DesktopUpdateNotice host={host({ checkForUpdate })} />);

    await waitFor(() => expect(checkForUpdate).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('status')).toBeNull();
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
