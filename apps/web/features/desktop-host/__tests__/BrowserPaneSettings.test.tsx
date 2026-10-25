import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserPaneSettings } from '../components/BrowserPaneSettings';

function installHost(sites = { allowed: ['example.com'], blocked: [] as string[] }) {
  let current = sites;
  const invokeRuntime = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case 'browser_pane_state':
        return { ok: true, value: { open: false } };
      case 'browser_sites_read':
        return { ok: true, value: current };
      case 'browser_sites_remove':
        current = {
          allowed: current.allowed.filter((site) => site !== args?.['host']),
          blocked: current.blocked.filter((site) => site !== args?.['host']),
        };
        return { ok: true, value: current };
      case 'browser_sites_block':
        current = { ...current, blocked: [...current.blocked, String(args?.['host'])] };
        return { ok: true, value: current };
      case 'browser_pane_clear_data':
        return { ok: true, value: true };
      default:
        return { ok: false, error: { code: 'unknown-command', message: command } };
    }
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

describe('the browser settings page', () => {
  it('lists allowed sites and removes one', async () => {
    const user = userEvent.setup();
    const { invokeRuntime } = installHost();
    render(<BrowserPaneSettings />);
    const row = (await screen.findByText('example.com')).closest('div') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Remove' }));
    expect(invokeRuntime).toHaveBeenCalledWith('browser_sites_remove', { host: 'example.com' });
    await waitFor(() => expect(screen.queryByText('example.com')).not.toBeInTheDocument());
  });

  it('blocks a typed site and refuses a malformed one', async () => {
    const user = userEvent.setup();
    const { invokeRuntime } = installHost();
    render(<BrowserPaneSettings />);
    await screen.findByText('example.com');
    const field = screen.getByLabelText('Site to block');
    await user.type(field, 'bad site');
    await user.click(screen.getByRole('button', { name: 'Block' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a site name');
    await user.clear(field);
    await user.type(field, 'Tracker.example');
    await user.click(screen.getByRole('button', { name: 'Block' }));
    expect(invokeRuntime).toHaveBeenCalledWith('browser_sites_block', { host: 'tracker.example' });
  });

  it('asks before clearing browsing data and names what is lost', async () => {
    const user = userEvent.setup();
    const { invokeRuntime } = installHost();
    render(<BrowserPaneSettings />);
    await screen.findByText('example.com');
    await user.click(screen.getByRole('button', { name: 'Clear browsing data' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/signed out of every site/)).toBeInTheDocument();
    expect(invokeRuntime).not.toHaveBeenCalledWith('browser_pane_clear_data', expect.anything());
    await user.click(within(dialog).getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(invokeRuntime).toHaveBeenCalledWith('browser_pane_clear_data', {}));
  });

  it('shows nothing in a shell without the browser pane', async () => {
    const { invokeRuntime } = installHost();
    invokeRuntime.mockResolvedValue({ ok: false, error: { code: 'unknown-command', message: '' } });
    const { container } = render(<BrowserPaneSettings />);
    await waitFor(() => expect(invokeRuntime).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
