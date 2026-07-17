import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const clerkState = vi.hoisted(() => ({
  clerkPaths: [] as string[],
}));

vi.mock('@clerk/nextjs/server', () => ({
  createRouteMatcher:
    (patterns: string[]) =>
    (request: NextRequest): boolean => {
      const pathname = request.nextUrl.pathname;
      return patterns.some((pattern) => {
        const prefix = pattern.replace(/\(\.\*\)$/u, '');
        if (prefix.endsWith('/')) {
          return pathname.startsWith(prefix);
        }
        return pathname === prefix || pathname.startsWith(`${prefix}/`);
      });
    },
  clerkMiddleware:
    (
      handler: (
        auth: unknown,
        request: NextRequest,
        event: unknown,
      ) => Response | Promise<Response>,
    ) =>
    (request: NextRequest, event: unknown) => {
      clerkState.clerkPaths.push(request.nextUrl.pathname);
      return handler({}, request, event);
    },
}));

describe('web proxy', () => {
  it('keeps public marketing pages out of Clerk session middleware while preserving CSP', async () => {
    clerkState.clerkPaths = [];
    const { proxy } = await import('../proxy');

    const response = await proxy(new NextRequest('http://localhost/'), {} as never);

    expect(clerkState.clerkPaths).toEqual([]);
    expect(response?.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it('keeps authenticated app routes on the Clerk-aware path', async () => {
    clerkState.clerkPaths = [];
    const { proxy } = await import('../proxy');

    const response = await proxy(
      new NextRequest('http://localhost/chat', {
        headers: { Cookie: '__session=test-session' },
      }),
      {} as never,
    );

    expect(clerkState.clerkPaths).toEqual(['/chat']);
    expect(response?.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it('redirects signed-out app routes before Clerk session middleware', async () => {
    clerkState.clerkPaths = [];
    const { proxy } = await import('../proxy');

    const response = await proxy(
      new NextRequest('http://localhost/chat?panel=artifacts'),
      {} as never,
    );

    expect(clerkState.clerkPaths).toEqual([]);
    expect(response?.status).toBe(307);
    expect(response?.headers.get('Location')).toBe(
      'http://localhost/login?redirectTo=%2Fchat%3Fpanel%3Dartifacts',
    );
    expect(response?.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it('protects the schedule manager and preserves its requested URL', async () => {
    clerkState.clerkPaths = [];
    const { proxy } = await import('../proxy');

    const response = await proxy(
      new NextRequest('http://localhost/schedules?view=active'),
      {} as never,
    );

    expect(clerkState.clerkPaths).toEqual([]);
    expect(response?.status).toBe(307);
    expect(response?.headers.get('Location')).toBe(
      'http://localhost/login?redirectTo=%2Fschedules%3Fview%3Dactive',
    );
  });

  it('keeps public health checks out of Clerk session middleware', async () => {
    clerkState.clerkPaths = [];
    const { proxy } = await import('../proxy');

    const response = await proxy(new NextRequest('http://localhost/api/health'), {} as never);

    expect(clerkState.clerkPaths).toEqual([]);
    expect(response?.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });
});
