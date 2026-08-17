import { describe, it, expect } from 'vitest';

import {
  parseCustomMcpJsonConfig,
  describeCustomMcpJsonImportError,
} from '../custom-mcp-json-import';

describe('parseCustomMcpJsonConfig', () => {
  it('parses a bare single-server config', () => {
    const result = parseCustomMcpJsonConfig(JSON.stringify({ url: 'https://mcp.example.com/mcp' }));
    expect(result).toEqual({
      ok: true,
      value: {
        name: null,
        url: 'https://mcp.example.com/mcp',
        transport: null,
        authToken: null,
        droppedHeaderNames: [],
      },
    });
  });

  it('parses the mcpServers-wrapped shape and takes the entry name', () => {
    const result = parseCustomMcpJsonConfig(
      JSON.stringify({
        mcpServers: {
          linear: { url: 'https://mcp.linear.app/mcp', transport: 'streamable-http' },
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.name).toBe('linear');
    expect(result.value.url).toBe('https://mcp.linear.app/mcp');
    expect(result.value.transport).toBe('streamable-http');
  });

  it('extracts a bearer token from an Authorization header', () => {
    const result = parseCustomMcpJsonConfig(
      JSON.stringify({
        url: 'https://mcp.example.com/mcp',
        headers: { Authorization: 'Bearer secret-token' },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.authToken).toBe('secret-token');
    expect(result.value.droppedHeaderNames).toEqual([]);
  });

  it('prefers an explicit authToken field over a header-derived one', () => {
    const result = parseCustomMcpJsonConfig(
      JSON.stringify({
        url: 'https://mcp.example.com/mcp',
        authToken: 'explicit-token',
        headers: { Authorization: 'Bearer header-token' },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.authToken).toBe('explicit-token');
  });

  it('reports non-Authorization headers as dropped rather than silently discarding them', () => {
    const result = parseCustomMcpJsonConfig(
      JSON.stringify({
        url: 'https://mcp.example.com/mcp',
        headers: { 'X-Custom': 'value', Authorization: 'Bearer t' },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.droppedHeaderNames).toEqual(['X-Custom']);
  });

  it('rejects invalid JSON with a specific error', () => {
    const result = parseCustomMcpJsonConfig('{not json');
    expect(result).toEqual({ ok: false, error: { kind: 'invalid_json' } });
  });

  it('rejects a stdio (command-based) config instead of silently ignoring it', () => {
    const result = parseCustomMcpJsonConfig(
      JSON.stringify({
        mcpServers: { local: { command: 'python3', args: ['server.py'] } },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toEqual({ kind: 'stdio_unsupported', serverName: 'local' });
    expect(describeCustomMcpJsonImportError(result.error)).toMatch(/stdio transport/);
  });

  it('rejects a config declaring more than one server', () => {
    const result = parseCustomMcpJsonConfig(
      JSON.stringify({
        mcpServers: {
          a: { url: 'https://a.example.com/mcp' },
          b: { url: 'https://b.example.com/mcp' },
        },
      }),
    );
    expect(result).toEqual({ ok: false, error: { kind: 'multiple_servers', count: 2 } });
  });

  it('rejects an empty mcpServers map', () => {
    const result = parseCustomMcpJsonConfig(JSON.stringify({ mcpServers: {} }));
    expect(result).toEqual({ ok: false, error: { kind: 'no_servers' } });
  });

  it('rejects a non-http(s) URL', () => {
    const result = parseCustomMcpJsonConfig(JSON.stringify({ url: 'ftp://example.com/mcp' }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.kind).toBe('invalid_url');
  });

  it('rejects a shape that matches neither the bare nor wrapped schema', () => {
    const result = parseCustomMcpJsonConfig(JSON.stringify({ foo: 'bar' }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.kind).toBe('invalid_shape');
  });

  it('never executes the payload — a config carrying script-like strings is treated as inert data', () => {
    const result = parseCustomMcpJsonConfig(
      JSON.stringify({ url: 'https://mcp.example.com/mcp', name: '<script>alert(1)</script>' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    // Passed through as an inert string, not interpreted.
    expect(result.value.name).toBe('<script>alert(1)</script>');
  });
});
