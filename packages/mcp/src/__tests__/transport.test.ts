/**
 * Tests for transport.ts env-var filtering.
 *
 * We can't easily test the full resolveMcpTransport flow without spawning
 * real processes, so we test the filtering behavior by importing the module
 * and checking that the transport constructor receives filtered env vars.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the MCP SDK transports before importing our module.
const mockStdioTransport = vi.fn();
const mockSSETransport = vi.fn();
const mockStreamableTransport = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: mockStdioTransport,
}));
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: mockSSETransport,
}));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: mockStreamableTransport,
}));

import { resolveMcpTransport } from '../transport';

beforeEach(() => {
  vi.clearAllMocks();
  // Suppress console.warn from the env filtering
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('env var filtering', () => {
  const baseConfig = {
    command: 'node',
    args: ['server.js'],
    signedManifest: true,
  };

  it('passes safe env vars through', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { MY_API_KEY: 'sk-123', CUSTOM_VAR: 'value' },
    });
    expect(mockStdioTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        env: { MY_API_KEY: 'sk-123', CUSTOM_VAR: 'value' },
      }),
    );
  });

  it('filters LD_PRELOAD', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { LD_PRELOAD: '/evil.so', SAFE_VAR: 'ok' },
    });
    const passedEnv = mockStdioTransport.mock.calls[0][0].env;
    expect(passedEnv).toEqual({ SAFE_VAR: 'ok' });
  });

  it('filters DYLD_INSERT_LIBRARIES', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { DYLD_INSERT_LIBRARIES: '/evil.dylib', SAFE: '1' },
    });
    const passedEnv = mockStdioTransport.mock.calls[0][0].env;
    expect(passedEnv).toEqual({ SAFE: '1' });
  });

  it('filters NODE_OPTIONS', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { NODE_OPTIONS: '--require /tmp/evil.js', OK: 'yes' },
    });
    const passedEnv = mockStdioTransport.mock.calls[0][0].env;
    expect(passedEnv).toEqual({ OK: 'yes' });
  });

  it('filters BASH_ENV and IFS', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { BASH_ENV: '/tmp/evil.sh', IFS: '/', GOOD: 'val' },
    });
    const passedEnv = mockStdioTransport.mock.calls[0][0].env;
    expect(passedEnv).toEqual({ GOOD: 'val' });
  });

  it('filters PATH and HOME', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { PATH: '/evil/bin', HOME: '/tmp', API_KEY: 'abc' },
    });
    const passedEnv = mockStdioTransport.mock.calls[0][0].env;
    expect(passedEnv).toEqual({ API_KEY: 'abc' });
  });

  it('filters BASH_FUNC_ prefixed vars', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { 'BASH_FUNC_evil%%': '() { evil; }', SAFE: 'ok' },
    });
    const passedEnv = mockStdioTransport.mock.calls[0][0].env;
    expect(passedEnv).toEqual({ SAFE: 'ok' });
  });

  it('case-insensitive blocking', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { ld_preload: '/evil.so', safe: 'ok' },
    });
    const passedEnv = mockStdioTransport.mock.calls[0][0].env;
    expect(passedEnv).toEqual({ safe: 'ok' });
  });

  it('returns undefined env when all keys are blocked', () => {
    resolveMcpTransport({
      ...baseConfig,
      env: { LD_PRELOAD: '/evil.so', PATH: '/evil' },
    });
    const passedConfig = mockStdioTransport.mock.calls[0][0];
    expect(passedConfig.env).toBeUndefined();
  });

  it('omits env entirely when not provided', () => {
    resolveMcpTransport(baseConfig);
    const passedConfig = mockStdioTransport.mock.calls[0][0];
    expect('env' in passedConfig).toBe(false);
  });
});
