import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MCPServerCard from '../MCPServerCard';
import { useMcpStore } from '../../../stores/mcpStore';
import { McpClient } from '../../../api/mcp';
import type { McpServerInfo } from '../../../types/mcp';

function server(overrides: Partial<McpServerInfo> = {}): McpServerInfo {
  return {
    name: 'github',
    enabled: true,
    connected: true,
    toolCount: 3,
    local: true,
    sandboxed: true,
    ...overrides,
  };
}

describe('MCPServerCard sandbox setting', () => {
  const refreshServers = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useMcpStore.setState({ refreshServers, stats: {}, isLoading: false });
  });

  it('turns the sandbox off through the host command, which asks first', async () => {
    const user = userEvent.setup();
    const setSandbox = vi.fn().mockResolvedValue(undefined);
    render(<MCPServerCard server={server()} setSandbox={setSandbox} />);

    expect(screen.getByText(/only write to its workspace and package caches/)).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Run in sandbox' }));

    await waitFor(() => expect(setSandbox).toHaveBeenCalledWith('github', false));
    expect(refreshServers).toHaveBeenCalled();
  });

  it('shows the declined confirmation as an error and keeps the server sandboxed', async () => {
    const user = userEvent.setup();
    const setSandbox = vi.fn().mockRejectedValue('The sandbox stays on for this server.');
    render(<MCPServerCard server={server()} setSandbox={setSandbox} />);

    await user.click(screen.getByRole('switch', { name: 'Run in sandbox' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The sandbox stays on');
    expect(refreshServers).not.toHaveBeenCalled();
  });

  it('shows the tool count from the server list until live stats arrive', () => {
    const { rerender } = render(<MCPServerCard server={server()} setSandbox={vi.fn()} />);
    expect(screen.getByText('Available Tools:').nextElementSibling).toHaveTextContent('3');

    useMcpStore.setState({ stats: { github: 7 } });
    rerender(<MCPServerCard server={server()} setSandbox={vi.fn()} />);
    expect(screen.getByText('Available Tools:').nextElementSibling).toHaveTextContent('7');
  });

  it('names the consequence for an unsandboxed server', () => {
    render(<MCPServerCard server={server({ sandboxed: false })} setSandbox={vi.fn()} />);
    expect(screen.getByText(/full user rights/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Run in sandbox' })).not.toBeChecked();
  });

  it('says why a server the user let out is being kept in the sandbox', () => {
    const reason = 'The sandbox stays on for this server: it runs from the folder /ws.';
    render(<MCPServerCard server={server({ sandboxNotice: reason })} setSandbox={vi.fn()} />);

    expect(screen.getByRole('switch', { name: 'Run in sandbox' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent(reason);
  });

  it('has no sandbox setting for a remote server', () => {
    render(<MCPServerCard server={server({ local: false })} setSandbox={vi.fn()} />);
    expect(screen.queryByRole('switch', { name: 'Run in sandbox' })).not.toBeInTheDocument();
  });
});

describe('MCPServerCard enabled setting and logs', () => {
  const enableServer = vi.fn().mockResolvedValue(undefined);
  const disableServer = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useMcpStore.setState({ enableServer, disableServer, stats: {}, isLoading: false });
  });

  it('turns a server off and says that this also stops it', async () => {
    const user = userEvent.setup();
    render(<MCPServerCard server={server()} setSandbox={vi.fn()} />);

    await user.click(screen.getByRole('switch', { name: 'Enabled' }));

    expect(disableServer).toHaveBeenCalledWith('github');
    expect(enableServer).not.toHaveBeenCalled();
  });

  it('turns a disabled server back on and offers no connect button until it is', async () => {
    const user = userEvent.setup();
    render(
      <MCPServerCard server={server({ enabled: false, connected: false })} setSandbox={vi.fn()} />,
    );

    expect(screen.queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument();
    expect(screen.getByText(/also stops it if it is running/)).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Enabled' }));

    expect(enableServer).toHaveBeenCalledWith('github');
  });

  it('says which of the user secrets a server gets, at the switch that turns it on', () => {
    render(
      <MCPServerCard
        server={server({
          enabled: false,
          connected: false,
          receivesSecrets: [{ kind: 'apiKey', provider: 'anthropic' }],
        })}
        setSandbox={vi.fn()}
      />,
    );

    expect(screen.getByRole('switch', { name: 'Enabled' })).toHaveAccessibleDescription(
      'Turning this on gives this server your Anthropic API key.',
    );
  });

  it('names the files a project approval covers, at the switch that approves it', () => {
    render(
      <MCPServerCard
        server={server({
          enabled: false,
          connected: false,
          approvalCoversFiles: ['server.js', 'package.json'],
        })}
        setSandbox={vi.fn()}
      />,
    );

    expect(screen.getByRole('switch', { name: 'Enabled' })).toHaveAccessibleDescription(
      "Turning this on approves this project's server as it is now, including the content of server.js, package.json. If one of them changes, the server turns off and asks again. What those files load is not checked.",
    );
  });

  it('says why a project server is approved one start at a time', () => {
    const notice =
      'This server is approved one start at a time: server.js is larger than 16 MB, the most an approval reads of one file.';
    render(
      <MCPServerCard
        server={server({ enabled: false, connected: false, approvalNotice: notice })}
        setSandbox={vi.fn()}
      />,
    );

    expect(screen.getByRole('switch', { name: 'Enabled' })).toHaveAccessibleDescription(notice);
  });

  it('says nothing about approval for a server no project file lists', () => {
    render(<MCPServerCard server={server({ enabled: false })} setSandbox={vi.fn()} />);

    expect(screen.queryByText(/approves this project's server/)).not.toBeInTheDocument();
  });

  it('opens the server log on request', async () => {
    const user = userEvent.setup();
    const getServerLogs = vi
      .spyOn(McpClient, 'getServerLogs')
      .mockResolvedValue(['[stderr] listening on stdio']);
    render(<MCPServerCard server={server()} setSandbox={vi.fn()} />);

    expect(getServerLogs).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'View logs' }));

    expect(await screen.findByText('[stderr] listening on stdio')).toBeInTheDocument();
    expect(getServerLogs).toHaveBeenCalledWith('github', 200);
  });
});
