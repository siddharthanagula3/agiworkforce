
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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

const LIVE_KEY = 'pk_live_Y2xlcmsuZXhhbXBsZS1wcm9kLmNvbSQ=';
const TEST_KEY = 'pk_test_d2lzZS1jYXQtNDIuY2xlcmsuYWNjb3VudHMuZGV2JA==';

async function cspFor(publishableKey: string | undefined): Promise<string> {
  vi.resetModules();
  if (publishableKey === undefined) {
    delete process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'];
  } else {
    process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = publishableKey;
  }
  const { proxy } = await import('../proxy');
  const response = await proxy(new NextRequest('http://localhost/login'), {} as never);
  return response?.headers.get('Content-Security-Policy') ?? '';
}

const originalKey = process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'];

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (originalKey === undefined) delete process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'];
  else process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = originalKey;
});

describe('Clerk Frontend API host in the CSP', () => {
  it('allows the production FAPI host in script-src and connect-src', async () => {
    const csp = await cspFor(LIVE_KEY);

    const scriptSrc = csp.match(/script-src [^;]+/u)?.[0] ?? '';
    expect(scriptSrc).toContain('https://clerk.example-prod.com');

    const connectSrc = csp.match(/connect-src [^;]+/u)?.[0] ?? '';
    expect(connectSrc).toContain('https://clerk.example-prod.com');
  });

  it('still allows a development instance host', async () => {
    const csp = await cspFor(TEST_KEY);
    expect(csp).toContain('https://wise-cat-42.clerk.accounts.dev');
    expect(csp).toContain('https://*.clerk.accounts.dev');
  });

  it('adds nothing when the key is absent or malformed, rather than widening the policy', async () => {
    for (const key of [
      undefined,
      '',
      'not-a-key',
      'pk_live_!!!not-base64!!!',
      'pk_live_' + btoa('* $'),
    ]) {
      const csp = await cspFor(key);
      const scriptSrc = csp.match(/script-src [^;]+/u)?.[0] ?? '';
      expect(scriptSrc, `key: ${String(key)}`).not.toMatch(/https:\/\/(?!\*\.)[^\s;]*\s*\*/u);
      expect(scriptSrc, `key: ${String(key)}`).toContain("'self'");
    }
  });
});
