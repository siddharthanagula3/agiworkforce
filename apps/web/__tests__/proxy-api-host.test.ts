/**
 * The API host must not serve the app UI.
 *
 * `api.agiworkforce.com` is a rewrite target for the OpenAI-compatible
 * endpoints only. Everything else fell through to the same Next app, so the
 * marketing site and the signed-in chat UI both rendered there. A user who
 * landed on it saw their account in the sidebar and "Authentication required"
 * in the content, because the page was rendering on an origin the session does
 * not belong to.
 *
 * The narrow scoping is the part worth protecting: matching "any host that is
 * not the app host" would redirect every preview deployment and localhost to
 * production.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@clerk/nextjs/server', () => ({
  createRouteMatcher: (patterns: string[]) => (request: NextRequest) => {
    const pathname = request.nextUrl.pathname;
    return patterns.some((pattern) => {
      const prefix = pattern.replace(/\(\.\*\)$/u, '');
      return prefix.endsWith('/')
        ? pathname.startsWith(prefix)
        : pathname === prefix || pathname.startsWith(`${prefix}/`);
    });
  },
  clerkMiddleware:
    (handler: (auth: unknown, request: NextRequest, event: unknown) => Response) =>
    (request: NextRequest, event: unknown) =>
      handler({}, request, event),
}));

async function requestFrom(host: string, path: string) {
  vi.resetModules();
  process.env['NEXT_PUBLIC_APP_URL'] = 'https://agiworkforce.com';
  const { proxy } = await import('../proxy');
  return proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }), {} as never);
}

const originalAppUrl = process.env['NEXT_PUBLIC_APP_URL'];

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env['NEXT_PUBLIC_APP_URL'];
  else process.env['NEXT_PUBLIC_APP_URL'] = originalAppUrl;
});

describe('API host does not serve the app', () => {
  it.each([['/'], ['/chat'], ['/login'], ['/settings/billing']])(
    'redirects %s on the API host to the app host',
    async (path) => {
      const response = await requestFrom('api.agiworkforce.com', path);
      expect(response?.status).toBe(307);
      expect(response?.headers.get('location')).toBe(`https://agiworkforce.com${path}`);
    },
  );

  it('preserves the query string, so a redirectTo survives the bounce', async () => {
    const response = await requestFrom('api.agiworkforce.com', '/login?redirectTo=%2Fchat');
    expect(response?.headers.get('location')).toBe(
      'https://agiworkforce.com/login?redirectTo=%2Fchat',
    );
  });

  it('leaves rewritten API traffic alone — that is what the host is for', async () => {
    const response = await requestFrom('api.agiworkforce.com', '/api/llm/v1/chat/completions');
    expect(response?.status).not.toBe(307);
  });

  it.each([
    ['agiworkforce.com', 'the app host itself'],
    ['agiworkforce-abc123-team.vercel.app', 'a preview deployment'],
    ['localhost:3000', 'local development'],
  ])('does not redirect %s (%s)', async (host) => {
    const response = await requestFrom(host, '/chat');
    // /chat is protected, so a signed-out request redirects to /login — the
    // point is that it is NOT bounced to another host.
    const location = response?.headers.get('location') ?? null;
    expect(location === null || !location.startsWith('https://agiworkforce.com/chat')).toBe(true);
  });
});
