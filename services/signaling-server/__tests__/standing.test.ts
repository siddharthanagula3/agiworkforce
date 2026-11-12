import { describe, expect, it, vi } from 'vitest';

import { fetchPairingStanding, standingConfig, type StandingQuery } from '../src/standing.js';

const SECRET = 'standing-test-secret';
const config = standingConfig({
  NODE_ENV: 'production',
  SIGNALING_STANDING_URL: 'https://web.example/api/pair/standing',
  SIGNALING_INTERNAL_SECRET: SECRET,
});
const queries: StandingQuery[] = [
  { code: 'ABCDEFGHJK23', userId: 'user-1', deviceIds: [], workspace: null },
];

function answering(response: Response) {
  return vi.fn<typeof fetch>(() => Promise.resolve(response));
}

function throwing(error: unknown) {
  return vi.fn<typeof fetch>(() => Promise.reject(error));
}

describe('why the web app could not answer a standing check', () => {
  it.each([
    ['a refused secret', new Response(null, { status: 401 }), 'client_error', 401],
    ['an undeployed route', new Response(null, { status: 404 }), 'client_error', 404],
    ['an outage', new Response(null, { status: 503 }), 'server_error', 503],
    [
      'a redirect to another host',
      new Response(null, { status: 308, headers: { location: 'https://www.web.example/' } }),
      'redirect',
      308,
    ],
    [
      'an HTML page',
      new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      'non_json',
      200,
    ],
    ['an unexpected body', Response.json({ verdicts: [] }), 'invalid_body', 200],
  ] as const)('names %s with its status', async (_case, response, reason, status) => {
    expect(await fetchPairingStanding(config, queries, answering(response))).toEqual({
      kind: 'failed',
      reason,
      status,
    });
  });

  it('names a timeout and a network failure without a status', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    expect(await fetchPairingStanding(config, queries, throwing(timeout))).toEqual({
      kind: 'failed',
      reason: 'timeout',
      status: null,
    });
    expect(
      await fetchPairingStanding(config, queries, throwing(new TypeError('fetch failed'))),
    ).toEqual({ kind: 'failed', reason: 'network', status: null });
  });

  it('never follows a redirect, so the secret is sent only to the configured URL', async () => {
    const fetchImpl = answering(new Response(null, { status: 308 }));
    await fetchPairingStanding(config, queries, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('returns the verdicts it was asked for', async () => {
    const fetchImpl = answering(
      Response.json({
        results: [
          { code: 'ABCDEFGHJK23', standing: 'ended' },
          { code: 'NOTASKED0000', standing: 'active' },
        ],
      }),
    );
    const answer = await fetchPairingStanding(config, queries, fetchImpl);
    expect(answer.kind).toBe('answered');
    if (answer.kind !== 'answered') return;
    expect([...answer.verdicts.entries()]).toEqual([['ABCDEFGHJK23', 'ended']]);
  });
});
