import { describe, expect, it } from 'vitest';
import { buildRemoteMcpConnectorEntry } from '../CustomRemoteMcpConnectorDialog';

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
});
