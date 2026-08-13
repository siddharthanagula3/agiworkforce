import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  buildRemoteMcpConnectorEntry,
  CustomRemoteMcpConnectorDialog,
} from '../CustomRemoteMcpConnectorDialog';
import { McpClient } from '@/api/mcp';

vi.mock('@/api/mcp', () => ({
  McpClient: {
    saveApiKey: vi.fn(),
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
    connect: vi.fn(),
  },
}));

describe('buildRemoteMcpConnectorEntry', () => {
  it('builds a Tauri-compatible HTTP MCP server config', () => {
    const entry = buildRemoteMcpConnectorEntry({
      displayName: 'Acme Data MCP',
      url: 'https://mcp.example.com/sse',
      bearerToken: 'token-123',
      headersJson: '{"X-Workspace":"engineering"}',
      timeoutSecs: 45,
      verifySsl: true,
    });

    expect(entry.serverName).toBe('custom-acme-data-mcp');
    expect(entry.config).toEqual({
      command: '',
      args: [],
      env: {},
      enabled: true,
      transport: {
        type: 'http',
        url: 'https://mcp.example.com/sse',
        api_key: null,
        bearer_token: '<from_api_key:custom-acme-data-mcp>',
        headers: {
          'X-Workspace': 'engineering',
        },
        timeout_secs: 45,
        verify_ssl: true,
      },
    });
  });

  it('rejects non-http urls', () => {
    expect(() =>
      buildRemoteMcpConnectorEntry({
        displayName: 'Bad MCP',
        url: 'file:///tmp/server',
        bearerToken: '',
        headersJson: '',
        timeoutSecs: 30,
        verifySsl: true,
      }),
    ).toThrow('Remote MCP URL must start with http:// or https://');
  });

  it('rejects header values that are not strings', () => {
    expect(() =>
      buildRemoteMcpConnectorEntry({
        displayName: 'Bad headers',
        url: 'https://mcp.example.com',
        bearerToken: '',
        headersJson: '{"X-Workspace":42}',
        timeoutSecs: 30,
        verifySsl: true,
      }),
    ).toThrow('Header "X-Workspace" must be a string');
  });

  it('keeps advanced connector fields collapsed until requested', async () => {
    const user = userEvent.setup();
    render(<CustomRemoteMcpConnectorDialog open onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: /Add custom connector/i })).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Remote MCP URL')).toBeInTheDocument();
    expect(screen.queryByLabelText('Bearer token')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Advanced settings' }));

    expect(screen.getByLabelText('Bearer token')).toBeInTheDocument();
    expect(screen.getByLabelText('Headers JSON')).toBeInTheDocument();
    expect(screen.getByLabelText('Timeout')).toBeInTheDocument();
  });

  it('saves custom connector configuration without connecting it', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    vi.mocked(McpClient.getConfig).mockResolvedValue({ mcpServers: {} });
    vi.mocked(McpClient.updateConfig).mockResolvedValue(
      'Configuration updated. Connect a server explicitly to start it.',
    );

    render(<CustomRemoteMcpConnectorDialog open onClose={vi.fn()} onSaved={onSaved} />);

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Acme MCP');
    await user.type(screen.getByLabelText('Remote MCP URL'), 'https://mcp.example.com/sse');
    await user.click(screen.getByRole('button', { name: 'Save connector' }));

    expect(McpClient.updateConfig).toHaveBeenCalledOnce();
    expect(McpClient.connect).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(
      'custom-acme-mcp',
      'Configuration updated. Connect a server explicitly to start it.',
    );
  });
});
