import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const clerkState = vi.hoisted(() => ({
  options: undefined as unknown,
  constructed: 0,
}));

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
  clerkMiddleware: (
    handler: (auth: unknown, request: NextRequest, event: unknown) => Response | Promise<Response>,
    options?: unknown,
  ) => {
    clerkState.constructed += 1;
    clerkState.options = options;
    return (request: NextRequest, event: unknown) => handler({}, request, event);
  },
}));

const SAVED = {
  parties: process.env['CLERK_AUTHORIZED_PARTIES'],
  appUrl: process.env['NEXT_PUBLIC_APP_URL'],
};

async function loadProxy(): Promise<(typeof import('../proxy'))['proxy']> {
  vi.resetModules();
  clerkState.options = undefined;
  clerkState.constructed = 0;
  const mod = await import('../proxy');
  return mod.proxy;
}

beforeEach(() => {
  delete process.env['CLERK_AUTHORIZED_PARTIES'];
  process.env['NEXT_PUBLIC_APP_URL'] = 'https://app.agiworkforce.test';
});

afterEach(() => {
  if (SAVED.parties === undefined) delete process.env['CLERK_AUTHORIZED_PARTIES'];
  else process.env['CLERK_AUTHORIZED_PARTIES'] = SAVED.parties;
  if (SAVED.appUrl === undefined) delete process.env['NEXT_PUBLIC_APP_URL'];
  else process.env['NEXT_PUBLIC_APP_URL'] = SAVED.appUrl;
});

describe('proxy Clerk authorized parties', () => {
  it('binds clerkMiddleware to the configured authorized parties', async () => {
    process.env['CLERK_AUTHORIZED_PARTIES'] =
      'https://agiworkforce.com, chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const proxy = await loadProxy();

    await proxy(new NextRequest('https://app.agiworkforce.test/api/consent'), {} as never);

    expect(clerkState.constructed).toBe(1);
    expect(clerkState.options).toEqual({
      authorizedParties: [
        'https://agiworkforce.com',
        'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
      ],
    });
  });

  it('falls back to this deployment origin when the allowlist env is unset', async () => {
    const proxy = await loadProxy();

    await proxy(new NextRequest('https://app.agiworkforce.test/api/consent'), {} as never);

    expect(clerkState.options).toEqual({
      authorizedParties: ['https://app.agiworkforce.test'],
    });
  });

  it('refuses Clerk-session routes instead of verifying without an azp binding', async () => {
    delete process.env['NEXT_PUBLIC_APP_URL'];
    const proxy = await loadProxy();

    const response = await proxy(
      new NextRequest('https://app.agiworkforce.test/api/consent'),
      {} as never,
    );

    expect(clerkState.constructed).toBe(0);
    expect(response?.status).toBe(503);
  });

  it('keeps unauthenticated public API routes serving when Clerk is bound', async () => {
    const proxy = await loadProxy();

    const response = await proxy(
      new NextRequest('https://app.agiworkforce.test/api/health'),
      {} as never,
    );

    expect(response).toBeInstanceOf(NextResponse);
    expect(response?.status).toBe(200);
  });
});
