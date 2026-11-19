import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type EgressModule = typeof import('@/lib/egress-policy');

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
const transport = vi.hoisted(() => ({
  respond: (_signal: AbortSignal | undefined): Response => new Response('{}'),
}));

vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));
vi.mock('@/lib/egress-policy', async (importOriginal) => ({
  ...(await importOriginal<EgressModule>()),
  pinnedPublicFetch: async (_input: string | URL | Request, init?: RequestInit) =>
    transport.respond(init?.signal ?? undefined),
}));

import { McpOAuthEgressRefusedError, mcpOAuthFetch } from '@/lib/connectors/mcp-oauth-fetch';

const METADATA_URL = 'https://auth.acme.example/.well-known/oauth-authorization-server';

function stalledBody(signal: AbortSignal | undefined): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"issuer":'));
      signal?.addEventListener('abort', () => controller.error(signal.reason), { once: true });
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
}

function settle(work: Promise<unknown>): { state: () => 'pending' | 'resolved' | 'rejected' } {
  let state: 'pending' | 'resolved' | 'rejected' = 'pending';
  work.then(
    () => {
      state = 'resolved';
    },
    () => {
      state = 'rejected';
    },
  );
  return { state: () => state };
}

describe('MCP OAuth fetch keeps the whole exchange inside its deadline', () => {
  beforeEach(() => {
    dnsMocks.lookup.mockReset();
    dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses a body the server never finishes once the request deadline passes', async () => {
    vi.useFakeTimers();
    transport.respond = stalledBody;

    const read = settle(mcpOAuthFetch(METADATA_URL).then((response) => response.text()));
    await vi.advanceTimersByTimeAsync(11_000);

    expect(read.state()).toBe('rejected');
  });

  it('lets the caller cancel while the body is still arriving', async () => {
    vi.useFakeTimers();
    transport.respond = stalledBody;
    const caller = new AbortController();

    const read = settle(
      mcpOAuthFetch(METADATA_URL, { signal: caller.signal }).then((response) => response.text()),
    );
    await vi.advanceTimersByTimeAsync(100);
    caller.abort();
    await vi.advanceTimersByTimeAsync(100);

    expect(read.state()).toBe('rejected');
  });

  it('refuses a metadata body larger than any OAuth document', async () => {
    transport.respond = () => new Response('x'.repeat(2 * 1024 * 1024), { status: 200 });

    await expect(mcpOAuthFetch(METADATA_URL)).rejects.toBeInstanceOf(McpOAuthEgressRefusedError);
  });

  it('hands back the status, headers and JSON body of an ordinary answer', async () => {
    transport.respond = () =>
      new Response(JSON.stringify({ issuer: 'https://auth.acme.example' }), {
        status: 201,
        statusText: 'Created',
        headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' },
      });

    const response = await mcpOAuthFetch(METADATA_URL, { method: 'POST', body: '{}' });

    expect(response.status).toBe(201);
    expect(response.statusText).toBe('Created');
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    expect(await response.json()).toEqual({ issuer: 'https://auth.acme.example' });
  });

  it('hands back a bodiless answer without inventing a body', async () => {
    transport.respond = () => new Response(null, { status: 204 });

    const response = await mcpOAuthFetch(METADATA_URL, { method: 'POST', body: '{}' });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });
});
