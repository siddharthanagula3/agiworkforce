import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface ClientCtorOptions {
  versionNegotiation?: { mode?: string };
}

interface EraMockOptions {
  discoverResult?: unknown;
  inputRequired?: boolean;
  callToolResult?: { isError?: boolean; content?: unknown[] };
}

const constructorOptions: ClientCtorOptions[] = [];

function installEraMock(options: EraMockOptions): void {
  vi.doMock('@modelcontextprotocol/client', () => {
    class FakeClient {
      constructor(
        public info: { name: string; version: string },
        public opts: ClientCtorOptions,
      ) {
        constructorOptions.push(opts);
      }
      async connect(): Promise<void> {}
      getDiscoverResult(): unknown {
        return options.discoverResult;
      }
      async close(): Promise<void> {}
      async listTools(): Promise<{ tools: Array<{ name: string }> }> {
        return { tools: [{ name: 'read_file' }] };
      }
      async callTool(): Promise<{ isError?: boolean; content?: unknown[] }> {
        return options.callToolResult ?? { content: [] };
      }
    }
    return {
      Client: FakeClient,
      isInputRequiredResult: () => options.inputRequired === true,
    };
  });
}

beforeEach(() => {
  constructorOptions.length = 0;
  vi.resetModules();
  vi.doMock('../transport', () => ({
    resolveMcpTransport: vi.fn(() => ({})),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MCP 2026-07-28 pivot — version negotiation', () => {
  it("constructs the SDK v2 client with mode 'auto', not the SDK's legacy default", async () => {
    installEraMock({ discoverResult: undefined });
    const { connectMcpServer } = await import('../connect');
    await connectMcpServer({ serverName: 'fs', config: { command: '/bin/echo' } });

    expect(constructorOptions).toHaveLength(1);
    expect(constructorOptions[0]?.versionNegotiation).toEqual({ mode: 'auto' });
  });
});

describe('MCP 2026-07-28 pivot — protocol era on the handle', () => {
  it("reports 'modern' when the server answers the server/discover probe", async () => {
    installEraMock({
      discoverResult: { protocolVersions: ['2026-07-28'], serverInfo: { name: 'srv' } },
    });
    const { connectMcpServer } = await import('../connect');
    const handle = await connectMcpServer({ serverName: 'fs', config: { command: '/bin/echo' } });

    expect(handle.protocolEra).toBe('modern');
  });

  it("reports 'legacy' when the probe yields no discover result", async () => {
    installEraMock({ discoverResult: undefined });
    const { connectMcpServer } = await import('../connect');
    const handle = await connectMcpServer({ serverName: 'fs', config: { command: '/bin/echo' } });

    expect(handle.protocolEra).toBe('legacy');
  });
});

describe('MCP 2026-07-28 pivot — input_required results', () => {
  it('surfaces an input_required result as an explicit error, never as empty success', async () => {
    installEraMock({
      discoverResult: { protocolVersions: ['2026-07-28'] },
      inputRequired: true,
      callToolResult: { content: [] },
    });
    const { connectMcpServer } = await import('../connect');
    const handle = await connectMcpServer({ serverName: 'fs', config: { command: '/bin/echo' } });

    const result = await handle.callTool('read_file', { path: '/etc/hosts' });

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    const block = result.content[0] as { type: string; text: string };
    expect(block.type).toBe('text');
    expect(block.text).toMatch(/input_required/);
    expect(block.text).toMatch(/did not complete/);
  });

  it('passes a normal complete result through untouched', async () => {
    installEraMock({
      discoverResult: { protocolVersions: ['2026-07-28'] },
      inputRequired: false,
      callToolResult: { content: [{ type: 'text', text: 'ok' }] },
    });
    const { connectMcpServer } = await import('../connect');
    const handle = await connectMcpServer({ serverName: 'fs', config: { command: '/bin/echo' } });

    const result = await handle.callTool('read_file', {});

    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([{ type: 'text', text: 'ok' }]);
  });
});
