import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@clerk/nextjs/server', () => ({
  createRouteMatcher:
    (patterns: string[]) =>
    (request: NextRequest): boolean => {
      const pathname = request.nextUrl.pathname;
      return patterns.some((pattern) => {
        const prefix = pattern.replace(/\(\.\*\)$/u, '');
        if (prefix.endsWith('/')) return pathname.startsWith(prefix);
        return pathname === prefix || pathname.startsWith(`${prefix}/`);
      });
    },
  clerkMiddleware:
    (handler: (auth: unknown, request: NextRequest, event: unknown) => Response) =>
    (request: NextRequest, event: unknown) =>
      handler({}, request, event),
}));

const EVENT = {} as never;

function request(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new Request(url, { headers }));
}

describe('every response the proxy builds carries a content security policy', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('serves the region-block page with a policy, not just a region header', async () => {
    vi.stubEnv('AGI_BLOCK_EEA_TRAFFIC', '1');
    const { proxy } = await import('../proxy');

    const response = await proxy(
      request('https://agiworkforce.com/chat', { 'x-vercel-ip-country': 'DE' }),
      EVENT,
    );

    expect(response?.status).toBe(451);
    expect(response?.headers.get('x-agi-region-block')).toBe('DE');
    const policy = response?.headers.get('Content-Security-Policy');
    expect(
      policy,
      'the blocked page is rendered, so it needs a policy like every other page',
    ).toBeTruthy();
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toMatch(/script-src [^;]*'nonce-/u);
  });

  it('gives each blocked request its own nonce rather than a shared one', async () => {
    vi.stubEnv('AGI_BLOCK_EEA_TRAFFIC', '1');
    const { proxy } = await import('../proxy');

    const nonces = new Set<string>();
    for (const country of ['DE', 'FR', 'IT']) {
      const response = await proxy(
        request('https://agiworkforce.com/chat', { 'x-vercel-ip-country': country }),
        EVENT,
      );
      const nonce = /'nonce-([^']+)'/u.exec(
        response?.headers.get('Content-Security-Policy') ?? '',
      )?.[1];
      expect(nonce).toBeTruthy();
      nonces.add(nonce as string);
    }
    expect(nonces.size).toBe(3);
  });

  it('leaves the block page itself reachable, still with a policy', async () => {
    vi.stubEnv('AGI_BLOCK_EEA_TRAFFIC', '1');
    const { proxy } = await import('../proxy');

    const response = await proxy(
      request('https://agiworkforce.com/region-unavailable', { 'x-vercel-ip-country': 'DE' }),
      EVENT,
    );

    expect(response?.status).not.toBe(451);
    expect(response?.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it('carries a policy on the api host bounce as well', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://agiworkforce.com');
    const { proxy } = await import('../proxy');

    const response = await proxy(
      request('https://api.agiworkforce.com/pricing', { host: 'api.agiworkforce.com' }),
      EVENT,
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get('location')).toBe('https://agiworkforce.com/pricing');
    expect(response?.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it('does not block a request from outside the EEA', async () => {
    vi.stubEnv('AGI_BLOCK_EEA_TRAFFIC', '1');
    const { proxy } = await import('../proxy');

    const response = await proxy(
      request('https://agiworkforce.com/pricing', { 'x-vercel-ip-country': 'US' }),
      EVENT,
    );

    expect(response?.status).not.toBe(451);
    expect(response?.headers.get('x-agi-region-block')).toBeNull();
  });
});
