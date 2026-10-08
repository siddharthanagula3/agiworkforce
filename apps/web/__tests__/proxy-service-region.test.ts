import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';

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

function from(
  country: string | null,
  path: string,
  { region, method = 'GET', host }: { region?: string; method?: string; host?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (country) headers['x-vercel-ip-country'] = country;
  if (region) headers['x-vercel-ip-country-region'] = region;
  if (host) headers['host'] = host;
  return new NextRequest(
    new Request(`https://${host ?? 'agiworkforce.com'}${path}`, { method, headers }),
  );
}

describe('the proxy refuses the countries and regions where AGI is not offered', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://agiworkforce.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('serves the region page with a 451 and a policy for a page request', async () => {
    const { proxy } = await import('../proxy');

    for (const country of ['CU', 'IR', 'KP', 'RU', 'CN', 'SY']) {
      const response = await proxy(from(country, '/chat'), EVENT);

      expect(response?.status, country).toBe(451);
      expect(response?.headers.get('x-agi-region-block'), country).toBe(country);
      expect(response?.headers.get('x-middleware-rewrite'), country).toContain(
        '/region-unavailable',
      );
      expect(response?.headers.get('Content-Security-Policy'), country).toMatch(
        /script-src [^;]*'nonce-/u,
      );
    }
  });

  it('answers an api request with a 451 json refusal, not a page', async () => {
    const { proxy } = await import('../proxy');

    for (const path of ['/api/chat/conversations', '/api/llm/v1/chat/completions', '/trpc/x']) {
      const response = await proxy(from('IR', path, { method: 'POST' }), EVENT);

      expect(response?.status, path).toBe(451);
      expect(response?.headers.get('x-middleware-rewrite'), path).toBeNull();
      expect(response?.headers.get('content-type'), path).toContain('application/json');
      expect(response?.headers.get('Content-Security-Policy'), path).toContain(
        "default-src 'self'",
      );
      const body = (await response?.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('REGION_UNAVAILABLE');
      expect(body.error.message).toContain('/supported-countries');
    }
  });

  it('answers the api host with json too', async () => {
    const { proxy } = await import('../proxy');

    const response = await proxy(
      from('KP', '/v1/chat/completions', { host: 'api.agiworkforce.com', method: 'POST' }),
      EVENT,
    );

    expect(response?.status).toBe(451);
    expect(response?.headers.get('content-type')).toContain('application/json');
  });

  it('refuses the excluded regions of Ukraine and serves the rest of the country', async () => {
    const { proxy } = await import('../proxy');

    for (const region of ['43', '40', '14', '09', '65', '23']) {
      const response = await proxy(from('UA', '/chat', { region }), EVENT);
      expect(response?.status, region).toBe(451);
      expect(response?.headers.get('x-agi-region-block'), region).toBe(`UA-${region}`);
    }
    for (const region of ['30', '46', undefined]) {
      const response = await proxy(from('UA', '/pricing', { region }), EVENT);
      expect(response?.status, String(region)).not.toBe(451);
      expect(response?.headers.get('x-agi-region-block'), String(region)).toBeNull();
    }
  });

  it('serves a supported country, its territories, and a request with no country header', async () => {
    const { proxy } = await import('../proxy');

    for (const country of ['US', 'GB', 'DE', 'IN', 'PR', 'GU', 'JE', null]) {
      const response = await proxy(from(country, '/pricing'), EVENT);
      expect(response?.status, String(country)).not.toBe(451);
      expect(response?.headers.get('x-agi-region-block'), String(country)).toBeNull();
    }
  });

  it('keeps the legal pages, the region page, deploy checks and signed callbacks reachable', async () => {
    const { proxy } = await import('../proxy');

    const pages = ['/region-unavailable', ...Object.values(CANONICAL_POLICY_ROUTES)];
    for (const path of pages) {
      const response = await proxy(from('IR', path), EVENT);
      expect(response?.status, path).not.toBe(451);
      expect(response?.headers.get('x-agi-region-block'), path).toBeNull();
    }

    for (const [path, method] of [
      ['/api/health', 'GET'],
      ['/api/version', 'GET'],
      ['/api/webhooks/slack', 'POST'],
      ['/api/github/webhook', 'POST'],
      ['/api/cron/run-schedules', 'GET'],
    ] as const) {
      const response = await proxy(from('CU', path, { method }), EVENT);
      expect(response?.status, path).toBe(200);
      expect(response?.headers.get('x-agi-region-block'), path).toBeNull();
    }
  });

  it('does not let a look-alike path borrow an exemption', async () => {
    const { proxy } = await import('../proxy');

    for (const path of [
      '/api/health/extra',
      '/api/healthz',
      '/api/version/x',
      '/terms/extra',
      '/supported-countries-x',
      '/region-unavailable/x',
    ]) {
      const response = await proxy(from('IR', path), EVENT);
      expect(response?.status, path).toBe(451);
    }
  });
});
