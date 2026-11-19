import { beforeEach, describe, expect, it, vi } from 'vitest';
type EgressModule = typeof import('@/lib/egress-policy');

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
const transport = vi.hoisted(() => ({ signals: [] as AbortSignal[] }));

vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));
vi.mock('@/lib/egress-policy', async (importOriginal) => ({
  ...(await importOriginal<EgressModule>()),
  pinnedPublicFetch: async (_input: string | URL | Request, init?: RequestInit) => {
    if (init?.signal) transport.signals.push(init.signal);
    return new Response(new ReadableStream({ start() {} }), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  },
}));

import { MCP_EGRESS_POLICY } from '@/lib/mcp-egress-policy';

const MCP_URL = 'https://mcp.acme.example/v1/mcp';

describe('MCP egress policy fetch cancellation', () => {
  beforeEach(() => {
    transport.signals.length = 0;
    dnsMocks.lookup.mockReset();
    dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  it('still cancels the underlying request when the caller aborts after the response arrived', async () => {
    const caller = new AbortController();
    const response = await MCP_EGRESS_POLICY.fetch!(MCP_URL, {
      method: 'GET',
      signal: caller.signal,
    });
    expect(response.status).toBe(200);
    expect(transport.signals).toHaveLength(1);
    const dialSignal = transport.signals[0]!;
    expect(dialSignal.aborted).toBe(false);

    caller.abort();

    expect(dialSignal.aborted).toBe(true);
  });

  it('does not cut a long-lived stream at the dial timeout once the response arrived', async () => {
    vi.useFakeTimers();
    try {
      const response = await MCP_EGRESS_POLICY.fetch!(MCP_URL, { method: 'GET' });
      expect(response.status).toBe(200);
      const dialSignal = transport.signals[0]!;
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(dialSignal.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
