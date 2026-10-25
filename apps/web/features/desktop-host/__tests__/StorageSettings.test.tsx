import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorageUsage } from '@agiworkforce/local-runtime-contract';
import { StorageSettings } from '../components/StorageSettings';

const USAGE: StorageUsage = {
  categories: [
    { category: 'sessions', bytes: 2_048, partial: false },
    { category: 'worktrees', bytes: 4_096, partial: true },
    { category: 'web-cache', bytes: 1_024, partial: false },
    { category: 'logs', bytes: 0, partial: false },
    { category: 'caches', bytes: 0, partial: false },
    { category: 'app-data', bytes: 1_024, partial: false },
  ],
  totalBytes: 8_192,
  dataPath: '/Users/me/.agiworkforce',
  measuredAtMs: 1,
};

function installHost(clean: (cleanup: string) => unknown = () => ({ ok: true, value: USAGE })) {
  const invokeRuntime = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    if (command === 'desktop_storage_read') return { ok: true, value: USAGE };
    if (command === 'desktop_storage_clean') return clean(String(args?.['cleanup']));
    return { ok: false, error: { code: 'unknown-command', message: command } };
  });
  Object.assign(window, {
    agiHost: {
      shell: 'electron',
      platform: 'electron-darwin',
      appVersion: '1.2.0',
      onRuntimeEvent: vi.fn(() => () => undefined),
      onDeepLink: vi.fn(() => () => undefined),
      onVoiceHotkey: vi.fn(() => () => undefined),
      onHostCommand: vi.fn(() => () => undefined),
      invokeRuntime,
    },
  });
  return { invokeRuntime };
}

afterEach(() => {
  Reflect.deleteProperty(window, 'agiHost');
  vi.restoreAllMocks();
});

describe('the storage page', () => {
  it('renders nothing in a browser', () => {
    const { container } = render(<StorageSettings />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the total, each category, and marks a size it could not finish measuring', async () => {
    installHost();
    render(<StorageSettings />);
    expect(await screen.findByText('Coding sessions')).toBeInTheDocument();
    const worktrees = screen.getByText('Worktrees').closest('li') as HTMLElement;
    expect(within(worktrees).getByText(/at least/)).toBeInTheDocument();
    expect(screen.getByText(/\/Users\/me\/\.agiworkforce/)).toBeInTheDocument();
  });

  it('asks before clearing and names what is lost, then clears', async () => {
    const user = userEvent.setup();
    const { invokeRuntime } = installHost();
    render(<StorageSettings />);
    await screen.findByText('Coding sessions');

    const row = screen.getByText('Old logs').closest('div') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/cannot be recovered/)).toBeInTheDocument();
    expect(invokeRuntime).not.toHaveBeenCalledWith('desktop_storage_clean', expect.anything());

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(invokeRuntime).toHaveBeenCalledWith('desktop_storage_clean', { cleanup: 'old-logs' }),
    );
  });

  it('says why a cleanup was refused', async () => {
    const user = userEvent.setup();
    installHost(() => ({
      ok: false,
      error: {
        code: 'invalid-arguments',
        message: 'A command is running. Clear temporary command files after it finishes.',
      },
    }));
    render(<StorageSettings />);
    await screen.findByText('Coding sessions');

    const row = screen.getByText('Temporary command files').closest('div') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('A command is running');
  });
});
