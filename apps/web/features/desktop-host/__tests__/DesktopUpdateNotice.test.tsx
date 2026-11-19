import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DesktopRuntimeEvent,
  HostBridge,
  HostUpdateAvailability,
} from '@agiworkforce/local-runtime-contract';
import { hostBridgeStub } from '@/test/host-bridge-stub';
import { DesktopUpdateNotice } from '../components/DesktopUpdateNotice';
import { PRODUCT_NAMES } from '@agiworkforce/types';

function host(overrides: Partial<HostBridge> = {}): HostBridge {
  return { ...hostBridgeStub(), ...overrides };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('DesktopUpdateNotice', () => {
  it('offers an installer rather than inferring downloading from capability', async () => {
    render(
      <DesktopUpdateNotice
        host={host({
          checkForUpdate: async () => ({
            available: true,
            currentVersion: '1.2.0',
            version: '1.3.0',
            downloadUrl: '',
            installsAutomatically: true,
          }),
        })}
      />,
    );
    expect(await screen.findByRole('button', { name: 'Download installer' })).toBeEnabled();
  });

  it('preserves an unknown staged event against a delayed metadata response', async () => {
    let receive!: (event: DesktopRuntimeEvent) => void;
    let finish!: (value: HostUpdateAvailability) => void;
    const checkForUpdate = vi.fn(
      () =>
        new Promise<HostUpdateAvailability>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <DesktopUpdateNotice
        host={host({
          restartToUpdate: vi.fn(),
          checkForUpdate,
          onRuntimeEvent: (callback) => {
            receive = callback;
            return () => undefined;
          },
        })}
      />,
    );
    await waitFor(() => expect(checkForUpdate).toHaveBeenCalledTimes(1));
    act(() => receive({ kind: 'update-ready', version: '' }));
    await act(async () =>
      finish({
        available: true,
        currentVersion: '1.2.0',
        version: '1.4.0',
        downloadUrl: '',
        readyToInstall: true,
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      `${PRODUCT_NAMES.desktop} update is ready to install`,
    );
    expect(screen.getByRole('status')).not.toHaveTextContent('1.4.0');
    expect(screen.getByRole('button', { name: 'Relaunch to update' })).toBeEnabled();
  });

  it('retires events from a previous host', async () => {
    let receive!: (event: DesktopRuntimeEvent) => void;
    const first = host({
      onRuntimeEvent: (callback) => {
        receive = callback;
        return () => undefined;
      },
    });
    const view = render(<DesktopUpdateNotice host={first} />);
    act(() => receive({ kind: 'update-ready', version: '1.3.0' }));
    expect(screen.getByRole('status')).toHaveTextContent('1.3.0');
    view.rerender(<DesktopUpdateNotice host={host()} />);
    act(() => receive({ kind: 'update-ready', version: '1.4.0' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('checks on startup and presents an available installer inside the app', async () => {
    const openUpdateInstaller = vi.fn(async () => undefined);
    const checkForUpdate = vi.fn(async () => ({
      available: true,
      currentVersion: '1.2.0',
      version: '1.3.0',
      downloadUrl: 'https://agiworkforce.com/download',
    }));
    render(<DesktopUpdateNotice host={host({ checkForUpdate, openUpdateInstaller })} />);

    expect(await screen.findByRole('status')).toHaveTextContent(
      `${PRODUCT_NAMES.desktop} 1.3.0 is available`,
    );
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
      `${PRODUCT_NAMES.desktop} 1.3.0 is ready to install`,
    );
    expect(screen.queryByRole('button', { name: 'Download installer' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Relaunch to update' }));
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

    fireEvent.click(await screen.findByRole('button', { name: 'Relaunch to update' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      `${PRODUCT_NAMES.desktop} could not restart to install the update.`,
    );
    expect(alert).not.toHaveTextContent('Error invoking remote method');
    expect(screen.getByRole('button', { name: 'Relaunch to update' })).toBeEnabled();
  });

  it.each([
    ['deferred', `The update will install the next time ${PRODUCT_NAMES.desktop} quits.`],
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

    fireEvent.click(await screen.findByRole('button', { name: 'Relaunch to update' }));

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
