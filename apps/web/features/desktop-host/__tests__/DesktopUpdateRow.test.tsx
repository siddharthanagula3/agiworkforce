import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { DesktopUpdateRow } from '../components/DesktopUpdateRow';
import { hostBridgeStub } from '@/test/host-bridge-stub';

function installHost(overrides: Partial<HostBridge> = {}): HostBridge {
  const host: HostBridge = {
    ...hostBridgeStub(),
    platform: 'electron-darwin',
    appVersion: '1.2.0',
    invokeRuntime: async () => ({
      ok: false as const,
      error: { code: 'unsupported-platform' as const, message: 'no runtime in this test host' },
    }),
    onDeepLink: () => () => undefined,
    onVoiceHotkey: () => () => undefined,
    onRuntimeEvent: () => () => undefined,
    openExternal: async () => undefined,
    notify: async () => undefined,
    checkForUpdate: async () => ({
      available: false,
      currentVersion: '1.2.0',
      version: '1.2.0',
      downloadUrl: '',
    }),
    openUpdateInstaller: async () => undefined,
    ...overrides,
  };
  window.agiHost = host;
  return host;
}

afterEach(() => {
  delete window.agiHost;
});

describe('DesktopUpdateRow', () => {
  it('renders nothing in a browser', () => {
    const { container } = render(<DesktopUpdateRow />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the running version and reports that it is current', async () => {
    installHost();
    render(<DesktopUpdateRow />);
    expect(screen.getByText(/1\.2\.0/u)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('This is the latest version.');
    });
    expect(screen.queryByRole('button', { name: 'Download installer' })).toBeNull();
  });

  it('offers the installer when a newer version is published', async () => {
    const openUpdateInstaller = vi.fn().mockResolvedValue(undefined);
    installHost({
      checkForUpdate: async () => ({
        available: true,
        currentVersion: '1.2.0',
        version: '1.3.0',
        downloadUrl: 'https://agiworkforce.com/api/download?platform=mac&app=cloud&arch=arm64',
      }),
      openUpdateInstaller,
    });
    render(<DesktopUpdateRow />);

    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Version 1.3.0 is available.');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Download installer' }));
    expect(openUpdateInstaller).toHaveBeenCalledTimes(1);
  });

  it('offers a restart once the shell has downloaded the update', async () => {
    const openUpdateInstaller = vi.fn().mockResolvedValue(undefined);
    const restartToUpdate = vi.fn().mockResolvedValue(undefined);
    installHost({
      restartToUpdate,
      checkForUpdate: async () => ({
        available: true,
        currentVersion: '1.2.0',
        version: '1.3.0',
        downloadUrl: 'https://agiworkforce.com/api/download?platform=mac&app=cloud&arch=arm64',
        readyToInstall: true,
        checkedAt: '2026-10-10T12:00:00.000Z',
      }),
      openUpdateInstaller,
    });
    render(<DesktopUpdateRow />);

    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Version 1.3.0 is ready.');
    });
    expect(screen.getByText(/^Last checked /u)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download installer' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Restart to update' }));
    expect(restartToUpdate).toHaveBeenCalledTimes(1);
    expect(openUpdateInstaller).not.toHaveBeenCalled();
  });

  it('says so when the restart into the update fails, without the raw bridge error', async () => {
    installHost({
      restartToUpdate: vi
        .fn()
        .mockRejectedValue(
          new Error(
            "Error invoking remote method 'agi:restart-to-update': Error: No downloaded update is ready to install.",
          ),
        ),
      checkForUpdate: async () => ({
        available: true,
        currentVersion: '1.2.0',
        version: '1.3.0',
        downloadUrl: 'https://agiworkforce.com/api/download?platform=mac&app=cloud&arch=arm64',
        readyToInstall: true,
      }),
    });
    render(<DesktopUpdateRow />);

    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Restart to update' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('AGI Desktop could not restart to install the update.');
    expect(alert).not.toHaveTextContent('Error invoking remote method');
    expect(screen.getByRole('button', { name: 'Restart to update' })).toBeEnabled();
  });

  it.each([
    ['deferred', 'status', 'The update will install the next time AGI Desktop quits.'],
    ['not-ready', 'alert', 'The update has not finished downloading.'],
  ] as const)('says what happened when the restart is %s', async (outcome, role, text) => {
    installHost({
      restartToUpdate: vi.fn().mockResolvedValue(outcome),
      checkForUpdate: async () => ({
        available: true,
        currentVersion: '1.2.0',
        version: '1.3.0',
        downloadUrl: 'https://agiworkforce.com/api/download?platform=mac&app=cloud&arch=arm64',
        readyToInstall: true,
      }),
    });
    render(<DesktopUpdateRow />);

    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Restart to update' }));

    await waitFor(() => {
      expect(screen.getByRole(role)).toHaveTextContent(text);
    });
  });

  it('offers nothing to click while the update downloads', async () => {
    installHost({
      checkForUpdate: async () => ({
        available: true,
        currentVersion: '1.2.0',
        version: '1.3.0',
        downloadUrl: 'https://agiworkforce.com/api/download?platform=mac&app=cloud&arch=arm64',
        downloading: true,
      }),
    });
    render(<DesktopUpdateRow />);

    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Version 1.3.0 is downloading.');
    });
    expect(screen.queryByRole('button', { name: 'Download installer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restart to update' })).toBeNull();
    expect(screen.queryByText(/^Last checked /u)).toBeNull();
  });

  it('reports a failed check without claiming the app is current', async () => {
    installHost({
      checkForUpdate: async () => {
        throw new Error('AGI Desktop update information is unavailable (503).');
      },
    });
    render(<DesktopUpdateRow />);

    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'AGI Desktop update information is unavailable (503).',
      );
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
  });
});
