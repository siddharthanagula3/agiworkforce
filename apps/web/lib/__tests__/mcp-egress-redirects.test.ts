import { beforeEach, describe, expect, it, vi } from 'vitest';

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
const transport = vi.hoisted(() => ({
  impl: (async () => new Response(null, { status: 500 })) as unknown as typeof fetch,
}));

vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));
vi.mock('@/lib/egress-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/egress-policy')>()),
  pinnedPublicFetch: (input: string | URL | Request, init?: RequestInit) =>
    transport.impl(input, init),
}));

import { MCP_EGRESS_POLICY, McpEgressRefusedError } from '@/lib/mcp-egress-policy';

const PUBLIC_ADDRESS = '93.184.216.34';
const REGISTERED = 'https://mcp.acme.example/v1/sse';
const USER_CREDENTIAL = 'Bearer user-token-do-not-leak-4b19';

interface Attempt {
  url: string;
  authorization: string | undefined;
  body: string;
}

/**
 * Stands in for the transport, including the part that matters: a caller that
 * leaves redirects to the client has the client follow them, carrying whatever
 * the request was holding.
 */
function installTransport(plan: (call: number, url: string) => Response): Attempt[] {
  const attempts: Attempt[] = [];
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    let current = typeof input === 'string' ? input : input.toString();
    for (let hop = 0; hop < 20; hop += 1) {
      const headers = new Headers(init.headers ?? {});
      attempts.push({
        url: current,
        authorization: headers.get('authorization') ?? undefined,
        body: typeof init.body === 'string' ? init.body : String(init.body ?? ''),
      });
      const response = plan(attempts.length, current);
      if (response.status < 300 || response.status >= 400) return response;
      if (init.redirect === 'manual') return response;
      const location = response.headers.get('location');
      if (!location) return response;
      current = new URL(location, current).toString();
    }
    throw new TypeError('too many redirects');
  }) as unknown as typeof fetch;
  transport.impl = impl;
  return attempts;
}

const policyFetch = MCP_EGRESS_POLICY.fetch;
const policyAssert = MCP_EGRESS_POLICY.assertAllowedUrl;

function dial(url = REGISTERED): Promise<Response> {
  if (!policyFetch) throw new Error('the MCP policy hands the client no fetch of its own');
  return policyFetch(url, {
    method: 'POST',
    headers: { authorization: USER_CREDENTIAL, 'content-type': 'application/json' },
    body: '{"jsonrpc":"2.0","method":"initialize"}',
  }) as Promise<Response>;
}

function ok(): Response {
  return new Response('{"jsonrpc":"2.0","result":{}}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function redirect(status: number, location: string): Response {
  return new Response(null, { status, headers: { location } });
}

beforeEach(() => {
  dnsMocks.lookup.mockReset();
  dnsMocks.lookup.mockResolvedValue([{ address: PUBLIC_ADDRESS, family: 4 }]);
});

describe('an MCP dial carries the credential no further than the server it was registered for', () => {
  it('completes an ordinary dial with the credential attached', async () => {
    const attempts = installTransport(() => ok());

    const response = await dial();

    expect(response.status).toBe(200);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.authorization).toBe(USER_CREDENTIAL);
  });

  it('follows a redirect that stays on the registered origin, still credentialed', async () => {
    const attempts = installTransport((call) =>
      call === 1 ? redirect(307, 'https://mcp.acme.example/v1/stream') : ok(),
    );

    const response = await dial();

    expect(response.status).toBe(200);
    expect(attempts.map((attempt) => attempt.url)).toEqual([
      REGISTERED,
      'https://mcp.acme.example/v1/stream',
    ]);
    for (const attempt of attempts) expect(attempt.authorization).toBe(USER_CREDENTIAL);
  });

  it.each([301, 302, 303, 307, 308])(
    'refuses a %s that leaves the registered origin, and sends the credential nowhere',
    async (status) => {
      const attempts = installTransport((call) =>
        call === 1 ? redirect(status, 'https://attacker.example/collect') : ok(),
      );

      const error = await dial().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(McpEgressRefusedError);
      expect((error as McpEgressRefusedError).refusal).toBe('cross_origin_redirect');
      expect(attempts).toHaveLength(1);
      expect(
        attempts.every((attempt) => new URL(attempt.url).origin === new URL(REGISTERED).origin),
      ).toBe(true);
    },
  );

  it('treats a different port on the same host as a different origin', async () => {
    const attempts = installTransport((call) =>
      call === 1 ? redirect(307, 'https://mcp.acme.example:8443/v1/sse') : ok(),
    );

    const error = await dial().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(McpEgressRefusedError);
    expect(attempts).toHaveLength(1);
  });

  it('treats a downgrade to http on the same host as a different origin', async () => {
    const attempts = installTransport((call) =>
      call === 1 ? redirect(307, 'http://mcp.acme.example/v1/sse') : ok(),
    );

    const error = await dial().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(McpEgressRefusedError);
    expect(attempts).toHaveLength(1);
  });

  it.each([
    ['the cloud metadata endpoint', 'http://169.254.169.254/latest/meta-data/'],
    ['loopback', 'http://127.0.0.1:9000/'],
    ['IPv6 loopback', 'http://[::1]/'],
    ['decimal IPv4 for loopback', 'http://2130706433/'],
    ['a private address', 'http://10.0.0.5/'],
  ])('refuses a redirect to %s', async (_label, target) => {
    const attempts = installTransport((call) => (call === 1 ? redirect(307, target) : ok()));

    const error = await dial().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(McpEgressRefusedError);
    expect(attempts).toHaveLength(1);
  });

  it('refuses a registered url whose host resolves private, before the credential is sent', async () => {
    dnsMocks.lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    const attempts = installTransport(() => ok());

    const error = await dial().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(McpEgressRefusedError);
    expect((error as McpEgressRefusedError).refusal).toBe('blocked_host');
    expect(attempts).toEqual([]);
  });

  it('refuses the second hop when the registered host starts resolving private', async () => {
    dnsMocks.lookup
      .mockResolvedValueOnce([{ address: PUBLIC_ADDRESS, family: 4 }])
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const attempts = installTransport((call) =>
      call === 1 ? redirect(307, 'https://mcp.acme.example/v1/stream') : ok(),
    );

    const error = await dial().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(McpEgressRefusedError);
    expect((error as McpEgressRefusedError).refusal).toBe('blocked_host');
    expect(attempts).toHaveLength(1);
  });

  it('bounds a same-origin redirect loop rather than following it forever', async () => {
    const attempts = installTransport(() => redirect(307, 'https://mcp.acme.example/v1/sse'));

    const error = await dial().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(McpEgressRefusedError);
    expect((error as McpEgressRefusedError).refusal).toBe('too_many_redirects');
    expect(attempts.length).toBeLessThanOrEqual(4);
  });

  it('refuses a redirect to a scheme that is not http', async () => {
    const attempts = installTransport((call) =>
      call === 1 ? redirect(307, 'file:///etc/passwd') : ok(),
    );

    const error = await dial().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(McpEgressRefusedError);
    expect(attempts).toHaveLength(1);
  });

  it('says which refusal happened without repeating the credential', async () => {
    installTransport((call) =>
      call === 1 ? redirect(307, 'https://attacker.example/collect') : ok(),
    );

    const error = (await dial().catch((caught: unknown) => caught)) as McpEgressRefusedError;

    expect(`${error.message}\n${error.stack ?? ''}`).not.toContain('user-token-do-not-leak');
    expect(error.message).toContain('attacker.example');
  });

  it('still vets a url handed to assertAllowedUrl on its own', async () => {
    dnsMocks.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    expect(policyAssert).toBeTypeOf('function');
    await expect(policyAssert!(REGISTERED)).rejects.toThrow();
  });
});
