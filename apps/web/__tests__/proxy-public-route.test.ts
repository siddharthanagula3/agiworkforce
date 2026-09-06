import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest, NextResponse } from 'next/server';

const clerkState = vi.hoisted(() => ({
  clerkPaths: [] as string[],
  response: null as Response | null,
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
      if (clerkState.response) return clerkState.response;
      return handler({}, request, event);
    },
}));

describe('web proxy', () => {
  beforeEach(() => {
    clerkState.clerkPaths = [];
    clerkState.response = null;
  });

  it('keeps Desktop-readable CORS headers on Clerk rejections before the API route', async () => {
    clerkState.response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { proxy } = await import('../proxy');

    const response = await proxy(
      new NextRequest('http://localhost/api/me?surface=desktop', {
        headers: { Origin: 'https://tauri.localhost' },
      }),
      {} as never,
    );

    expect(response?.status).toBe(401);
    expect(response?.headers.get('Access-Control-Allow-Origin')).toBe('https://tauri.localhost');
    expect(response?.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('keeps Workflow SDK callbacks outside the global proxy matcher', async () => {
    const { config } = await import('../proxy');
    const matchesProxy = (pathname: string) =>
      unstable_doesMiddlewareMatch({ config, url: `http://localhost${pathname}` });

    expect(matchesProxy('/.well-known/workflow/v1/flow')).toBe(false);
    expect(matchesProxy('/.well-known/workflow/v1/step')).toBe(false);
    expect(matchesProxy('/chat')).toBe(true);
  });

  it('keeps signed raw-body video webhooks outside every proxy matcher', async () => {
    const { config } = await import('../proxy');
    const matchesProxy = (pathname: string) =>
      unstable_doesMiddlewareMatch({ config, url: `http://localhost${pathname}` });

    expect(matchesProxy('/api/media/video/openrouter-webhook')).toBe(false);
    expect(matchesProxy('/api/stripe-webhook')).toBe(false);
    expect(matchesProxy('/api/mobile/iap/apple-notifications')).toBe(false);
    expect(matchesProxy('/api/mobile/iap/google-notifications')).toBe(false);
    expect(matchesProxy('/api/llm/v1/audio/transcriptions')).toBe(false);
    expect(matchesProxy('/api/media/video/status')).toBe(true);
    expect(matchesProxy('/api/files/example.png')).toBe(true);
  });

  it('runs the auth-aware root page through Clerk session middleware while preserving CSP', async () => {
    clerkState.clerkPaths = [];
    const { proxy } = await import('../proxy');

    const response = await proxy(new NextRequest('http://localhost/'), {} as never);

    expect(clerkState.clerkPaths).toEqual(['/']);
    expect(response?.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it('leaves / alone with no session cookie', async () => {
    const { proxy } = await import('../proxy');

    const response = await proxy(new NextRequest('http://localhost/'), {} as never);

    expect(response?.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('leaves / alone when __client_uat is 0', async () => {
    const { proxy } = await import('../proxy');

    const response = await proxy(
      new NextRequest('http://localhost/', { headers: { Cookie: '__client_uat=0' } }),
      {} as never,
    );

    expect(response?.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('rewrites / to /chat when __client_uat is a nonzero timestamp', async () => {
    const { proxy } = await import('../proxy');

    const response = await proxy(
      new NextRequest('http://localhost/', { headers: { Cookie: '__client_uat=1700000000' } }),
      {} as never,
    );

    expect(response?.headers.get('x-middleware-rewrite')).toBe('http://localhost/chat');
  });

  it('does not treat an anonymous clerk dev-browser cookie as a signed-in session', async () => {
    const { proxy } = await import('../proxy');

    const response = await proxy(
      new NextRequest('http://localhost/', {
        headers: { Cookie: '__clerk_db_jwt=anonymous-dev-browser-token' },
      }),
      {} as never,
    );

    expect(response?.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('leaves /agi-work alone with no session cookie, still through Clerk session middleware', async () => {
    clerkState.clerkPaths = [];
    const { proxy } = await import('../proxy');

    const response = await proxy(new NextRequest('http://localhost/agi-work'), {} as never);

    expect(clerkState.clerkPaths).toEqual(['/agi-work']);
    expect(response?.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response?.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it('rewrites /agi-work to /chat for a signed-in visitor', async () => {
    const { proxy } = await import('../proxy');

    const response = await proxy(
      new NextRequest('http://localhost/agi-work', {
        headers: { Cookie: '__client_uat=1700000000' },
      }),
      {} as never,
    );

    expect(response?.headers.get('x-middleware-rewrite')).toBe('http://localhost/chat');
  });

  it('leaves /agi-code alone with no session cookie, still through Clerk session middleware', async () => {
    clerkState.clerkPaths = [];
    const { proxy } = await import('../proxy');

    const response = await proxy(new NextRequest('http://localhost/agi-code'), {} as never);

    expect(clerkState.clerkPaths).toEqual(['/agi-code']);
    expect(response?.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response?.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it('rewrites /agi-code to /code for a signed-in visitor', async () => {
    const { proxy } = await import('../proxy');

    const response = await proxy(
      new NextRequest('http://localhost/agi-code', {
        headers: { Cookie: '__client_uat=1700000000' },
      }),
      {} as never,
    );

    expect(response?.headers.get('x-middleware-rewrite')).toBe('http://localhost/code');
  });

  it('runs the post-login acceptance checkpoint through Clerk session middleware', async () => {
    const { proxy } = await import('../proxy');

    const response = await proxy(
      new NextRequest('http://localhost/login/complete?redirectTo=%2Fchat'),
      {} as never,
    );

    expect(clerkState.clerkPaths).toEqual(['/login/complete']);
    expect(response?.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it('keeps ordinary public marketing pages outside Clerk session middleware', async () => {
    clerkState.clerkPaths = [];
    const { proxy } = await import('../proxy');

    const response = await proxy(new NextRequest('http://localhost/about'), {} as never);

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

  it('allows direct uploads only to the configured exact public and private R2 origins', async () => {
    const original = process.env['CLOUDFLARE_R2_ACCOUNT_ID'];
    const originalBucket = process.env['CLOUDFLARE_R2_BUCKET_NAME'];
    const originalPrivateBucket = process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'];
    try {
      process.env['CLOUDFLARE_R2_ACCOUNT_ID'] = '0123456789abcdef0123456789abcdef';
      process.env['CLOUDFLARE_R2_BUCKET_NAME'] = 'agiworkforce-media';
      process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'] = 'agiworkforce-media-private';
      const { proxy } = await import('../proxy');

      const response = await proxy(
        new NextRequest('http://localhost/chat', {
          headers: { Cookie: '__session=test-session' },
        }),
        {} as never,
      );

      expect(response?.headers.get('Content-Security-Policy')).toContain(
        "connect-src 'self' https://agiworkforce-media.0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com ",
      );
      expect(response?.headers.get('Content-Security-Policy')).toContain(
        'https://agiworkforce-media-private.0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',
      );
    } finally {
      if (original === undefined) delete process.env['CLOUDFLARE_R2_ACCOUNT_ID'];
      else process.env['CLOUDFLARE_R2_ACCOUNT_ID'] = original;
      if (originalBucket === undefined) delete process.env['CLOUDFLARE_R2_BUCKET_NAME'];
      else process.env['CLOUDFLARE_R2_BUCKET_NAME'] = originalBucket;
      if (originalPrivateBucket === undefined)
        delete process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'];
      else process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'] = originalPrivateBucket;
    }
  });

  it('does not trust a malformed R2 account id as a CSP origin', async () => {
    const original = process.env['CLOUDFLARE_R2_ACCOUNT_ID'];
    const originalBucket = process.env['CLOUDFLARE_R2_BUCKET_NAME'];
    try {
      process.env['CLOUDFLARE_R2_ACCOUNT_ID'] = 'evil.example.com';
      process.env['CLOUDFLARE_R2_BUCKET_NAME'] = 'agiworkforce-media';
      const { proxy } = await import('../proxy');

      const response = await proxy(
        new NextRequest('http://localhost/chat', {
          headers: { Cookie: '__session=test-session' },
        }),
        {} as never,
      );

      const csp = response?.headers.get('Content-Security-Policy') ?? '';
      expect(csp).not.toContain('evil.example.com');
      expect(csp).not.toContain('.r2.cloudflarestorage.com');
    } finally {
      if (original === undefined) delete process.env['CLOUDFLARE_R2_ACCOUNT_ID'];
      else process.env['CLOUDFLARE_R2_ACCOUNT_ID'] = original;
      if (originalBucket === undefined) delete process.env['CLOUDFLARE_R2_BUCKET_NAME'];
      else process.env['CLOUDFLARE_R2_BUCKET_NAME'] = originalBucket;
    }
  });

  it('does not trust a malformed R2 bucket name as a CSP origin', async () => {
    const original = process.env['CLOUDFLARE_R2_ACCOUNT_ID'];
    const originalBucket = process.env['CLOUDFLARE_R2_BUCKET_NAME'];
    try {
      process.env['CLOUDFLARE_R2_ACCOUNT_ID'] = '0123456789abcdef0123456789abcdef';
      process.env['CLOUDFLARE_R2_BUCKET_NAME'] = 'bucket.attacker.example';
      const { proxy } = await import('../proxy');

      const response = await proxy(
        new NextRequest('http://localhost/chat', {
          headers: { Cookie: '__session=test-session' },
        }),
        {} as never,
      );

      expect(response?.headers.get('Content-Security-Policy')).not.toContain(
        '.r2.cloudflarestorage.com',
      );
    } finally {
      if (original === undefined) delete process.env['CLOUDFLARE_R2_ACCOUNT_ID'];
      else process.env['CLOUDFLARE_R2_ACCOUNT_ID'] = original;
      if (originalBucket === undefined) delete process.env['CLOUDFLARE_R2_BUCKET_NAME'];
      else process.env['CLOUDFLARE_R2_BUCKET_NAME'] = originalBucket;
    }
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

  it('protects the task history and preserves its requested URL', async () => {
    clerkState.clerkPaths = [];
    const { proxy } = await import('../proxy');

    const response = await proxy(
      new NextRequest('http://localhost/tasks?status=running'),
      {} as never,
    );

    expect(clerkState.clerkPaths).toEqual([]);
    expect(response?.status).toBe(307);
    expect(response?.headers.get('Location')).toBe(
      'http://localhost/login?redirectTo=%2Ftasks%3Fstatus%3Drunning',
    );
  });

  it('covers task history subpaths, not just the index', async () => {
    clerkState.clerkPaths = [];
    const { proxy } = await import('../proxy');

    const signedOut = await proxy(new NextRequest('http://localhost/tasks/run-1'), {} as never);

    expect(clerkState.clerkPaths).toEqual([]);
    expect(signedOut?.status).toBe(307);
    expect(signedOut?.headers.get('Location')).toBe(
      'http://localhost/login?redirectTo=%2Ftasks%2Frun-1',
    );

    const signedIn = await proxy(
      new NextRequest('http://localhost/tasks/run-1', {
        headers: { Cookie: '__session=test-session' },
      }),
      {} as never,
    );

    expect(clerkState.clerkPaths).toEqual(['/tasks/run-1']);
    expect(signedIn?.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it('keeps public health checks out of Clerk session middleware', async () => {
    clerkState.clerkPaths = [];
    const { proxy } = await import('../proxy');

    const response = await proxy(new NextRequest('http://localhost/api/health'), {} as never);

    expect(clerkState.clerkPaths).toEqual([]);
    expect(response?.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it('allows same-origin framing only for the explicit generated PDF preview request', async () => {
    clerkState.clerkPaths = [];
    const { proxy } = await import('../proxy');

    const preview = await proxy(
      new NextRequest(
        'http://localhost/api/files/11111111-2222-4333-8444-555555555555?preview=pdf',
      ),
      {} as never,
    );
    const ordinaryFile = await proxy(
      new NextRequest('http://localhost/api/files/11111111-2222-4333-8444-555555555555'),
      {} as never,
    );

    expect(preview?.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'self'");
    expect(ordinaryFile?.headers.get('Content-Security-Policy')).toContain(
      "frame-ancestors 'none'",
    );
  });
});
