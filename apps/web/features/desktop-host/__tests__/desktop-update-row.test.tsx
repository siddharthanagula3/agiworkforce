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
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
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

    await userEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(openUpdateInstaller).toHaveBeenCalledTimes(1);
  });

  it('reports a failed check without claiming the app is current', async () => {
    installHost({
      checkForUpdate: async () => {
        throw new Error('AGI Cloud update information is unavailable (503).');
      },
    });
    render(<DesktopUpdateRow />);

    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'AGI Cloud update information is unavailable (503).',
      );
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
  });
});
