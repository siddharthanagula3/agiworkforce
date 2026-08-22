import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectMcpServer } from '../connect';

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
}

let server: Server;
let url = '';
const seen: string[] = [];

let streamResults = false;

function reply(response: ServerResponse, id: string | number, result: unknown): void {
  const payload = JSON.stringify({ jsonrpc: '2.0', id, result });
  if (streamResults) {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    response.write(`event: message\ndata: ${payload}\n\n`);
    response.end();
    return;
  }
  response.writeHead(200, {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(payload)),
  });
  response.end(payload);
}

function handle(request: IncomingMessage, response: ServerResponse): void {
  if (request.method !== 'POST') {
    response.writeHead(405).end();
    return;
  }
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => chunks.push(chunk));
  request.on('end', () => {
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8')) as JsonRpcMessage;
    seen.push(message.method ?? '');
    if (message.id === undefined) {
      response.writeHead(202).end();
      return;
    }
    if (message.method === 'initialize') {
      reply(response, message.id, {
        protocolVersion: String(message.params?.['protocolVersion'] ?? '2025-06-18'),
        capabilities: { tools: {} },
        serverInfo: { name: 'pinned-fixture', version: '0.0.1' },
      });
      return;
    }
    if (message.method === 'tools/list') {
      reply(response, message.id, {
        tools: [
          {
            name: 'ping',
            description: 'answers pong',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      });
      return;
    }
    if (message.method === 'tools/call') {
      reply(response, message.id, { content: [{ type: 'text', text: 'pong' }] });
      return;
    }
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32601, message: `no ${message.method}` },
    });
    response.writeHead(200, {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payload)),
    });
    response.end(payload);
  });
}

beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  url = `http://127.0.0.1:${port}/mcp`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('the pinned fetch carries a real MCP session', () => {
  it('handshakes, lists tools, and calls one over the DNS-pinned client', async () => {
    const handle = await connectMcpServer({
      serverName: 'local',
      config: { url },
      egressPolicy: { allowPrivateNetwork: true },
    });

    try {
      expect(handle.catalog.tools.map((tool) => tool.toolName)).toEqual(['ping']);
      const result = await handle.callTool('ping', {});
      expect(result.content).toEqual([{ type: 'text', text: 'pong' }]);
      expect(seen).toContain('initialize');
      expect(seen).toContain('tools/list');
      expect(seen).toContain('tools/call');
    } finally {
      await handle.close();
    }
  });

  it('reads a streamed event-stream reply through the hand-rolled response body', async () => {
    streamResults = true;
    try {
      const handle = await connectMcpServer({
        serverName: 'streamed',
        config: { url },
        egressPolicy: { allowPrivateNetwork: true },
      });
      try {
        expect(handle.catalog.tools.map((tool) => tool.toolName)).toEqual(['ping']);
        const result = await handle.callTool('ping', {});
        expect(result.content).toEqual([{ type: 'text', text: 'pong' }]);
      } finally {
        await handle.close();
      }
    } finally {
      streamResults = false;
    }
  });

  it('refuses the same loopback server from the managed-cloud trust context', async () => {
    await expect(
      connectMcpServer({ serverName: 'local', config: { url }, egressPolicy: {} }),
    ).rejects.toThrow(/private/i);
  });
});
