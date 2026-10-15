import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Transport } from '@modelcontextprotocol/client';

import { connectMcpServer } from '../connect';
import * as transportModule from '../transport';

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

function jsonRpcReply(message: JsonRpcMessage, result: unknown): Response {
  return Response.json({ jsonrpc: '2.0', id: message.id, result });
}

function createServerFetch(methods: string[], signals: AbortSignal[]): transportModule.McpFetch {
  return async (_input, init) => {
    if (init?.signal) signals.push(init.signal);
    if (init?.method !== 'POST') return new Response(null, { status: 405 });
    const message = JSON.parse(String(init.body)) as JsonRpcMessage;
    methods.push(message.method);
    if (message.id === undefined) return new Response(null, { status: 202 });
    if (message.method === 'server/discover') {
      return Response.json({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: 'Method not found' },
      });
    }
    if (message.method === 'initialize') {
      return jsonRpcReply(message, {
        protocolVersion: message.params?.['protocolVersion'],
        capabilities: { tools: {} },
        serverInfo: { name: 'lifecycle-fixture', version: '1.0.0' },
      });
    }
    if (message.method === 'tools/list') {
      return jsonRpcReply(message, {
        tools: [{ name: 'ping', inputSchema: { type: 'object', properties: {} } }],
      });
    }
    if (message.method === 'tools/call') {
      return jsonRpcReply(message, { content: [{ type: 'text', text: 'pong' }] });
    }
    throw new Error(`Unexpected fixture method: ${message.method}`);
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('connection lifecycle with the installed MCP SDK', () => {
  it('aborts an in-flight discovery probe on timeout and permits a fresh connection', async () => {
    vi.useFakeTimers();
    const resolveTransport = transportModule.resolveMcpTransport;
    let transport: Transport | undefined;
    vi.spyOn(transportModule, 'resolveMcpTransport').mockImplementation((...args) => {
      transport = resolveTransport(...args);
      return transport;
    });
    let probeSignal: AbortSignal | null | undefined;
    let markProbeStarted: () => void = () => {};
    const probeStarted = new Promise<void>((resolve) => {
      markProbeStarted = resolve;
    });
    const methods: string[] = [];
    const stalledFetch: transportModule.McpFetch = async (_input, init) => {
      const message = JSON.parse(String(init?.body)) as JsonRpcMessage;
      methods.push(message.method);
      probeSignal = init?.signal;
      markProbeStarted();
      return new Promise<Response>((_resolve, reject) => {
        if (probeSignal?.aborted) {
          reject(probeSignal.reason);
          return;
        }
        probeSignal?.addEventListener('abort', () => reject(probeSignal?.reason), {
          once: true,
        });
      });
    };
    const outcome = connectMcpServer({
      serverName: 'stalled',
      config: { url: 'https://mcp.example.test/mcp', connectionTimeoutMs: 25 },
      egressPolicy: { fetch: stalledFetch },
    }).catch((error: unknown) => error);

    try {
      await probeStarted;
      expect(probeSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(25);
      const error = await outcome;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('mcp.connect timed out after 25ms');
      expect(probeSignal?.aborted).toBe(true);
      expect(methods).toEqual(['server/discover']);
    } finally {
      await transport?.close();
    }

    const recoveredMethods: string[] = [];
    const recoveredSignals: AbortSignal[] = [];
    const handle = await connectMcpServer({
      serverName: 'recovered',
      config: { url: 'https://mcp.example.test/mcp' },
      egressPolicy: { fetch: createServerFetch(recoveredMethods, recoveredSignals) },
    });
    try {
      expect(handle.protocolEra).toBe('legacy');
      expect(handle.catalog.tools.map((tool) => tool.toolName)).toEqual(['ping']);
      const result = await handle.callTool('ping', {});
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('pong'),
      });
      expect(recoveredSignals.every((signal) => !signal.aborted)).toBe(true);
    } finally {
      await handle.close();
    }
    expect(recoveredMethods).toContain('tools/call');
    expect(recoveredSignals.every((signal) => signal.aborted)).toBe(true);
  });

  it('closes the connected HTTP transport when tool discovery fails', async () => {
    const methods: string[] = [];
    const signals: AbortSignal[] = [];
    const serverFetch = createServerFetch(methods, signals);
    const fetch: transportModule.McpFetch = async (input, init) => {
      if (init?.method === 'POST') {
        const message = JSON.parse(String(init.body)) as JsonRpcMessage;
        if (message.method === 'tools/list') {
          return new Response('Tool discovery unavailable', { status: 503 });
        }
      }
      return serverFetch(input, init);
    };
    await expect(
      connectMcpServer({
        serverName: 'unavailable',
        config: { url: 'https://mcp.example.test/mcp' },
        egressPolicy: { fetch },
      }),
    ).rejects.toThrow('Tool discovery unavailable');
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(methods).not.toContain('tools/call');
  });

  it('keeps a refused host from reaching the HTTP transport fetch', async () => {
    const refusal = new Error('Host egress policy refused the connector');
    const fetch = vi.fn<transportModule.McpFetch>();
    const assertAllowedUrl = vi.fn(async () => {
      throw refusal;
    });
    await expect(
      connectMcpServer({
        serverName: 'refused',
        config: { url: 'https://mcp.example.test/mcp' },
        egressPolicy: { fetch, assertAllowedUrl },
      }),
    ).rejects.toMatchObject({
      code: 'ERA_NEGOTIATION_FAILED',
      data: { cause: refusal },
    });
    expect(assertAllowedUrl).toHaveBeenCalledWith('https://mcp.example.test/mcp');
    expect(fetch).not.toHaveBeenCalled();
  });
});
