import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalMcpSettings } from '../components/LocalMcpSettings';

const GROUP = {
  rootId: 'root-1',
  name: 'app',
  path: '/work/app',
  branch: 'main',
  sessions: [],
};

const SERVERS = [
  { name: 'files', transport: 'stdio', scope: 'user', status: 'configured' },
  { name: 'repo-tools', transport: 'stdio', scope: 'project', status: 'needs_approval' },
];

function installHost(overrides: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  const invokeRuntime = vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    if (overrides[command]) return { ok: true, value: overrides[command](args) };
    switch (command) {
      case 'developer_session_list':
        return { ok: true, value: { groups: [GROUP] } };
      case 'developer_mcp_list':
        return { ok: true, value: SERVERS };
      case 'developer_mcp_test':
        return { ok: true, value: { name: 'files', connected: true, elapsedMs: 42, toolCount: 3 } };
      case 'developer_mcp_logs':
        return {
          ok: true,
          value: { name: 'files', lines: ['started', 'ready'], truncated: false },
        };
      case 'developer_mcp_open_config':
        return { ok: true, value: true };
      default:
        return { ok: true, value: {} };
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
      readPreferences: vi.fn(async () => ({ preferences: {} })),
      invokeRuntime,
    },
  });
  return { invokeRuntime };
}

afterEach(() => {
  Reflect.deleteProperty(window, 'agiHost');
  vi.restoreAllMocks();
});

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('div.flex.flex-col') as HTMLElement;
}

describe('the developer page', () => {
  it('lists servers with where they come from and what they need', async () => {
    installHost();
    render(<LocalMcpSettings />);
    expect(await screen.findByText('files')).toBeInTheDocument();
    expect(screen.getByText(/Yours · Ready/)).toBeInTheDocument();
    expect(screen.getByText(/Project · Needs approval/)).toBeInTheDocument();
    expect(screen.getByText(/Review it in the Code rail/)).toBeInTheDocument();
    expect(within(rowOf('repo-tools')).queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('tests a server and shows its logs', async () => {
    const user = userEvent.setup();
    const { invokeRuntime } = installHost();
    render(<LocalMcpSettings />);
    await screen.findByText('files');
    await user.click(within(rowOf('files')).getByRole('button', { name: 'Test' }));
    expect(await screen.findByText('Connected in 42 ms with 3 tools.')).toBeInTheDocument();
    await user.click(within(rowOf('files')).getByRole('button', { name: 'Logs' }));
    expect(await screen.findByText(/started\s+ready/)).toBeInTheDocument();
    expect(invokeRuntime).toHaveBeenCalledWith('developer_mcp_logs', {
      rootId: 'root-1',
      name: 'files',
      limit: 200,
    });
  });

  it('asks before removing a server and names what is lost', async () => {
    const user = userEvent.setup();
    const { invokeRuntime } = installHost();
    render(<LocalMcpSettings />);
    await screen.findByText('files');
    await user.click(within(rowOf('files')).getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/cannot be recovered/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(invokeRuntime).toHaveBeenCalledWith('developer_mcp_remove', {
        rootId: 'root-1',
        name: 'files',
      }),
    );
  });

  it('adds a program with its arguments and environment', async () => {
    const user = userEvent.setup();
    const { invokeRuntime } = installHost();
    render(<LocalMcpSettings />);
    await screen.findByText('files');
    await user.click(screen.getByRole('button', { name: 'Add server' }));
    await user.type(screen.getByLabelText('Name'), 'search');
    await user.type(screen.getByLabelText('Command'), 'npx');
    await user.type(screen.getByLabelText('Arguments, one per line'), '-y{Enter}search-mcp');
    await user.type(screen.getByLabelText('Environment, NAME=value per line'), 'TOKEN=abc');
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Add server' }),
    );
    await waitFor(() =>
      expect(invokeRuntime).toHaveBeenCalledWith('developer_mcp_add', {
        rootId: 'root-1',
        name: 'search',
        command: 'npx',
        args: ['-y', 'search-mcp'],
        env: { TOKEN: 'abc' },
      }),
    );
  });

  it('reads the list again when the window comes back, after the config was edited elsewhere', async () => {
    const { invokeRuntime } = installHost();
    render(<LocalMcpSettings />);
    await screen.findByText('files');
    const listed = () =>
      invokeRuntime.mock.calls.filter(([command]) => command === 'developer_mcp_list').length;
    const before = listed();
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(listed()).toBe(before + 1));
  });

  it('explains what to do with no approved folder', async () => {
    installHost({ developer_session_list: () => ({ groups: [] }) });
    render(<LocalMcpSettings />);
    expect(
      await screen.findByText(/Approve a folder for coding sessions first/),
    ).toBeInTheDocument();
  });
});
