import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/tauri-mock', () => ({
  invoke,
  isTauri: true,
  listen: vi.fn(async () => () => undefined),
  openUrl: vi.fn(),
}));

import { useCloudStore } from '../../../stores/cloudStore';
import { CloudStoragePanel } from '../CloudStoragePanel';

const DRIVE = { accountId: 'drive-1', provider: 'google_drive' as const, label: 'Work Drive' };

describe('CloudStoragePanel disconnect', () => {
  let connected: boolean;

  beforeEach(() => {
    connected = true;
    invoke.mockReset();
    invoke.mockImplementation(async (command: string) => {
      if (command === 'cloud_list_accounts') {
        return connected
          ? [{ account_id: DRIVE.accountId, provider: DRIVE.provider, label: DRIVE.label }]
          : [];
      }
      if (command === 'cloud_disconnect') connected = false;
      if (command === 'cloud_list') return [];
      return undefined;
    });
    useCloudStore.setState({
      accounts: [DRIVE],
      activeAccountId: DRIVE.accountId,
      files: [],
      currentPath: '/',
      loading: false,
      error: null,
      pendingAuth: null,
      lastShareLink: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('asks before disconnecting and names what stops working', async () => {
    render(<CloudStoragePanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Work Drive' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Disconnect Work Drive?');
    expect(dialog.textContent).toContain('uploads, downloads and share links for it stop working');
    expect(dialog.textContent).toContain('Nothing in Google Drive is deleted');
    expect(invoke).not.toHaveBeenCalledWith('cloud_disconnect', expect.anything());
  });

  it('leaves the account connected when the question is cancelled', async () => {
    render(<CloudStoragePanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Work Drive' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(invoke).not.toHaveBeenCalledWith('cloud_disconnect', expect.anything());
    expect(useCloudStore.getState().accounts).toEqual([DRIVE]);
  });

  it('disconnects once confirmed', async () => {
    render(<CloudStoragePanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Work Drive' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(
      Array.from(dialog.querySelectorAll('button')).find(
        (button) => button.textContent === 'Disconnect',
      ) as HTMLButtonElement,
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('cloud_disconnect', { accountId: 'drive-1' }),
    );
    await waitFor(() => expect(useCloudStore.getState().accounts).toEqual([]));
    expect(useCloudStore.getState().activeAccountId).toBeNull();
  });
});
