/**
 * Regression tests for connect.ts.
 *
 * Covers:
 *   - happy-path lifecycle: open -> listTools -> callTool -> close
 *   - listTools failure path: client.close() is called before propagating
 *   - buildMcpToolCatalog: per-server failures surface via console.error and
 *     don't poison the rest of the catalog
 *
 * We mock the MCP SDK Client so no real subprocess / socket is ever spawned.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  // Stub the transport resolver so we don't try to spawn anything.
  vi.doMock('../transport', () => ({
    resolveMcpTransport: vi.fn(() => ({
      /* fake transport */
    })),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface ToolListItem {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface ClientStubState {
  connectCalled: number;
  closeCalled: number;
  listToolsCalled: number;
  listToolsImpl: () => Promise<{ tools: ToolListItem[] }>;
  callToolImpl: (args: { name: string; arguments: Record<string, unknown> }) => Promise<{
    isError?: boolean;
    content?: unknown[];
  }>;
}

function installClientMock(state: ClientStubState): void {
  vi.doMock('@modelcontextprotocol/sdk/client/index.js', () => {
    class FakeClient {
      constructor(public info: { name: string; version: string }) {}
      async connect(_t: unknown): Promise<void> {
        state.connectCalled += 1;
      }
      async close(): Promise<void> {
        state.closeCalled += 1;
      }
      async listTools(): Promise<{ tools: ToolListItem[] }> {
        state.listToolsCalled += 1;
        return state.listToolsImpl();
      }
      async callTool(args: { name: string; arguments: Record<string, unknown> }): Promise<{
        isError?: boolean;
        content?: unknown[];
      }> {
        return state.callToolImpl(args);
      }
    }
    return { Client: FakeClient };
  });
}

function freshState(): ClientStubState {
  return {
    connectCalled: 0,
    closeCalled: 0,
    listToolsCalled: 0,
    listToolsImpl: async () => ({ tools: [] }),
    callToolImpl: async () => ({ content: [] }),
  };
}

describe('connectMcpServer — happy path lifecycle', () => {
  it('opens, lists tools, exposes a typed handle, and closes cleanly', async () => {
    const state = freshState();
    state.listToolsImpl = async () => ({
      tools: [
        {
          name: 'read_file',
          title: 'Read File',
          description: 'Reads a file from disk',
          inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
        },
        // Tool with no description -> fallback should kick in
        { name: 'sleep' },
      ],
    });
    state.callToolImpl = async (args) => ({
      content: [
        { type: 'text', text: `called ${args.name} with ${JSON.stringify(args.arguments)}` },
      ],
    });
    installClientMock(state);

    const { connectMcpServer } = await import('../connect');
    const handle = await connectMcpServer({
      serverName: 'fs',
      config: { command: '/bin/echo' },
    });

    expect(handle.serverName).toBe('fs');
    expect(handle.safeServerName).toBe('fs');
    expect(handle.catalog.tools).toHaveLength(2);
    expect(handle.catalog.tools[0]?.toolName).toBe('read_file');
    expect(handle.catalog.tools[0]?.title).toBe('Read File');
    expect(handle.catalog.tools[0]?.description).toBe('Reads a file from disk');
    expect(handle.catalog.tools[0]?.fallbackDescription).toBe('Tool read_file on MCP server fs');
    // Second tool inherits empty inputSchema and fallback description.
    expect(handle.catalog.tools[1]?.toolName).toBe('sleep');
    expect(handle.catalog.tools[1]?.fallbackDescription).toBe('Tool sleep on MCP server fs');
    expect(handle.catalog.tools[1]?.inputSchema).toEqual({ type: 'object', properties: {} });

    // Lifecycle assertions
    expect(state.connectCalled).toBe(1);
    expect(state.listToolsCalled).toBe(1);

    // callTool on the handle round-trips through the stub
    const result = await handle.callTool('read_file', { path: '/etc/hosts' });
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'called read_file with {"path":"/etc/hosts"}',
    });

    await handle.close();
    expect(state.closeCalled).toBe(1);
  });

  it('safeServerName lowercases and replaces unsafe chars', async () => {
    const state = freshState();
    installClientMock(state);
    const { connectMcpServer } = await import('../connect');
    const handle = await connectMcpServer({
      serverName: 'My Server / v2',
      config: { command: '/bin/echo' },
    });
    // Spaces, slash, dot — all collapse to underscores; lowercased.
    expect(handle.safeServerName).toBe('my_server_v2');
  });
});

describe('connectMcpServer — listTools failure', () => {
  it('closes the client when listTools throws and propagates the error', async () => {
    const state = freshState();
    state.listToolsImpl = async () => {
      throw new Error('listTools failed: server returned 500');
    };
    installClientMock(state);

    const { connectMcpServer } = await import('../connect');
    let caught: unknown;
    try {
      await connectMcpServer({
        serverName: 'broken',
        config: { command: '/bin/echo' },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/listTools failed/);
    // Critical regression: client.close MUST run before the throw propagates,
    // otherwise we leak an open transport for every failed connect.
    expect(state.closeCalled).toBe(1);
    expect(state.connectCalled).toBe(1);
    expect(state.listToolsCalled).toBe(1);
  });
});

describe('buildMcpToolCatalog — per-server failure isolation', () => {
  it('logs to console.error and continues when one server fails', async () => {
    let listCalls = 0;
    vi.doMock('@modelcontextprotocol/sdk/client/index.js', () => {
      class FakeClient {
        constructor(public info: unknown) {}
        async connect(): Promise<void> {}
        async close(): Promise<void> {}
        async listTools(): Promise<{ tools: ToolListItem[] }> {
          listCalls += 1;
          if (listCalls === 1) {
            // The "good" server (alphabetical first by Object.entries order
            // in mod.connectMcpServer) lists one tool.
            return { tools: [{ name: 't1' }] };
          }
          throw new Error('bad server: connection refused');
        }
        async callTool(): Promise<{ content: unknown[] }> {
          return { content: [] };
        }
      }
      return { Client: FakeClient };
    });

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { buildMcpToolCatalog } = await import('../connect');
    const result = await buildMcpToolCatalog({
      good: { command: '/bin/echo' },
      bad: { command: '/bin/false' },
    });

    // Catalog still produced; only the good server's tool surfaces.
    expect(result.catalog.tools).toHaveLength(1);
    expect(result.catalog.tools[0]?.toolName).toBe('t1');
    expect(Object.keys(result.catalog.servers)).toEqual(['good']);
    expect(result.handles).toHaveLength(1);

    // The bad server's failure was logged so operators can see it.
    const messages = errSpy.mock.calls.map((args) => args.join(' '));
    expect(messages.some((m) => m.includes('bad') && m.includes('connection refused'))).toBe(true);
  });

  it('returns an empty catalog when every server fails', async () => {
    vi.doMock('@modelcontextprotocol/sdk/client/index.js', () => {
      class FakeClient {
        constructor(public info: unknown) {}
        async connect(): Promise<void> {
          throw new Error('connect failed');
        }
        async close(): Promise<void> {}
        async listTools(): Promise<{ tools: ToolListItem[] }> {
          return { tools: [] };
        }
        async callTool(): Promise<{ content: unknown[] }> {
          return { content: [] };
        }
      }
      return { Client: FakeClient };
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { buildMcpToolCatalog } = await import('../connect');
    const result = await buildMcpToolCatalog({
      a: { command: '/bin/false' },
      b: { command: '/bin/false' },
    });
    expect(result.catalog.tools).toHaveLength(0);
    expect(Object.keys(result.catalog.servers)).toHaveLength(0);
    expect(result.handles).toHaveLength(0);
    expect(errSpy).toHaveBeenCalledTimes(2);
  });
});
