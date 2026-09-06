import { beforeEach, describe, expect, it, vi } from 'vitest';

const clerkState = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  users: {} as Record<string, unknown>,
  sessions: {} as Record<string, unknown>,
  middlewareOptions: undefined as unknown,
  matcherPatterns: undefined as unknown,
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => clerkState.auth,
  clerkClient: async () => ({ users: clerkState.users, sessions: clerkState.sessions }),
  clerkMiddleware: (handler: (session: unknown, request: unknown) => unknown, options: unknown) => {
    clerkState.middlewareOptions = options;
    return (request: unknown) => handler({}, request);
  },
  createRouteMatcher: (patterns: string[]) => {
    clerkState.matcherPatterns = patterns;
    return (request: { nextUrl: { pathname: string } }) =>
      patterns.includes(request.nextUrl.pathname);
  },
}));

const { ClerkIdentityProvider, clerkFrontendApiOrigin } = await import('../adapters/clerk');
type ClerkVerifyToken = NonNullable<
  ConstructorParameters<typeof ClerkIdentityProvider>[0]
>['verifyToken'];
const { IdentityConfigError } = await import('../types');

const SECRET = 'sk_test_secret';
const PARTIES = ['https://app.test'];
const PADDING_RUN_LENGTH = 100_000;
const PADDING_BUDGET_MS = 1_000;

function providerWith(verify: (token: string, options: unknown) => Promise<unknown>) {
  return new ClerkIdentityProvider({
    secretKey: SECRET,
    verifyToken: verify as unknown as ClerkVerifyToken,
  });
}

beforeEach(() => {
  clerkState.auth = {};
  clerkState.users = {};
  clerkState.sessions = {};
  clerkState.middlewareOptions = undefined;
  clerkState.matcherPatterns = undefined;
});

describe('verifySessionToken', () => {
  it('maps the subject, session, organization and email claims', async () => {
    const provider = providerWith(async () => ({
      sub: 'user_1',
      sid: 'sess_1',
      org_id: 'org_1',
      org_role: 'org:admin',
      email: 'a@b.test',
    }));

    await expect(
      provider.verifySessionToken('token', { authorizedParties: PARTIES }),
    ).resolves.toMatchObject({
      subject: 'user_1',
      sessionId: 'sess_1',
      organizationId: 'org_1',
      organizationRole: 'org:admin',
      email: 'a@b.test',
    });
  });

  it('passes the authorized parties and secret key through to the verifier', async () => {
    const seen: unknown[] = [];
    const provider = providerWith(async (_token, options) => {
      seen.push(options);
      return { sub: 'user_1' };
    });

    await provider.verifySessionToken('token', { authorizedParties: [' https://app.test ', ''] });

    expect(seen[0]).toEqual({ secretKey: SECRET, authorizedParties: ['https://app.test'] });
  });

  it('refuses to verify without an authorized-party allowlist', async () => {
    const provider = providerWith(async () => ({ sub: 'user_1' }));
    await expect(
      provider.verifySessionToken('token', { authorizedParties: [] }),
    ).rejects.toBeInstanceOf(IdentityConfigError);
  });

  it('returns null when the verifier rejects and when no subject claim is present', async () => {
    const rejecting = providerWith(async () => {
      throw new Error('bad token');
    });
    await expect(
      rejecting.verifySessionToken('token', { authorizedParties: PARTIES }),
    ).resolves.toBeNull();

    const subjectless = providerWith(async () => ({ sid: 'sess_1' }));
    await expect(
      subjectless.verifySessionToken('token', { authorizedParties: PARTIES }),
    ).resolves.toBeNull();
  });

  it('returns null when no secret key is configured', async () => {
    const provider = new ClerkIdentityProvider({
      secretKey: '',
      verifyToken: (() => {
        throw new Error('must not verify');
      }) as unknown as ClerkVerifyToken,
    });
    await expect(
      provider.verifySessionToken('token', { authorizedParties: PARTIES }),
    ).resolves.toBeNull();
  });
});

describe('currentRequestAuth', () => {
  it('reports a signed-in request with its session and organization', async () => {
    clerkState.auth = {
      userId: 'user_1',
      sessionId: 'sess_1',
      orgId: 'org_1',
      orgRole: 'org:member',
      getToken: async () => 'jwt',
    };

    const auth = await new ClerkIdentityProvider().currentRequestAuth();

    expect(auth).toMatchObject({
      subject: 'user_1',
      sessionId: 'sess_1',
      organizationId: 'org_1',
      organizationRole: 'org:member',
      isSignedIn: true,
    });
    await expect(auth.getToken()).resolves.toBe('jwt');
  });

  it('reports a signed-out request', async () => {
    clerkState.auth = { userId: null, getToken: async () => null };
    const auth = await new ClerkIdentityProvider().currentRequestAuth();
    expect(auth.isSignedIn).toBe(false);
    expect(auth.subject).toBeNull();
    await expect(auth.getToken()).resolves.toBeNull();
  });
});

describe('account and session reads', () => {
  it('normalizes a provider user onto the port shape', async () => {
    clerkState.users = {
      getUser: async () => ({
        id: 'user_1',
        emailAddresses: [{ emailAddress: 'first@b.test' }, { emailAddress: 'second@b.test' }],
        primaryEmailAddress: {
          emailAddress: 'primary@b.test',
          verification: { status: 'verified' },
        },
        firstName: 'Ada',
        lastName: 'Lovelace',
        username: 'ada',
        imageUrl: 'https://img.test/a.png',
        publicMetadata: { role: 'admin' },
        privateMetadata: { tier: 'gold' },
        banned: false,
        locked: false,
        twoFactorEnabled: true,
        createdAt: 10,
        lastSignInAt: 20,
      }),
    };

    await expect(new ClerkIdentityProvider().getUser('user_1')).resolves.toEqual({
      id: 'user_1',
      primaryEmail: 'primary@b.test',
      primaryEmailVerification: 'verified',
      emails: ['first@b.test', 'second@b.test'],
      firstName: 'Ada',
      lastName: 'Lovelace',
      fullName: 'Ada Lovelace',
      username: 'ada',
      imageUrl: 'https://img.test/a.png',
      publicMetadata: { role: 'admin' },
      privateMetadata: { tier: 'gold' },
      banned: false,
      locked: false,
      twoFactorEnabled: true,
      createdAt: 10,
      lastSignInAt: 20,
    });
  });

  it('suspends and restores an account through ban and unban', async () => {
    const banned: string[] = [];
    const unbanned: string[] = [];
    clerkState.users = {
      banUser: async (id: string) => banned.push(id),
      unbanUser: async (id: string) => unbanned.push(id),
    };

    const provider = new ClerkIdentityProvider();
    await provider.setUserSuspended('user_1', true);
    await provider.setUserSuspended('user_1', false);

    expect(banned).toEqual(['user_1']);
    expect(unbanned).toEqual(['user_1']);
  });

  it('pages sessions and reports the total count', async () => {
    clerkState.sessions = {
      getSessionList: async (params: Record<string, unknown>) => ({
        data: [
          {
            id: 'sess_1',
            userId: params['userId'],
            status: 'active',
            createdAt: 1,
            lastActiveAt: 2,
            expireAt: 3,
            latestActivity: {
              isMobile: true,
              ipAddress: '1.2.3.4',
              city: 'Austin',
              country: 'US',
              browserName: 'Chrome',
              browserVersion: '1',
              deviceType: 'Phone',
            },
          },
        ],
        totalCount: 7,
      }),
    };

    const page = await new ClerkIdentityProvider().listUserSessions('user_1', {
      status: 'active',
      limit: 1,
      offset: 0,
    });

    expect(page.totalCount).toBe(7);
    expect(page.sessions[0]).toEqual({
      id: 'sess_1',
      userId: 'user_1',
      status: 'active',
      createdAt: 1,
      lastActiveAt: 2,
      expireAt: 3,
      latestActivity: {
        ipAddress: '1.2.3.4',
        city: 'Austin',
        country: 'US',
        browserName: 'Chrome',
        browserVersion: '1',
        deviceType: 'Phone',
        isMobile: true,
      },
    });
  });

  it('lists organization memberships with their roles', async () => {
    clerkState.users = {
      getOrganizationMembershipList: async () => ({
        data: [{ role: 'org:admin', organization: { id: 'org_1', name: 'Acme' } }],
      }),
    };

    await expect(
      new ClerkIdentityProvider().listOrganizationMemberships('user_1'),
    ).resolves.toEqual([{ organizationId: 'org_1', organizationName: 'Acme', role: 'org:admin' }]);
  });
});

describe('middleware support', () => {
  it('derives the frontend api origin from the publishable key', () => {
    const key = `pk_test_${btoa('clerk.example.com$')}`;
    expect(clerkFrontendApiOrigin(key)).toBe('https://clerk.example.com');
  });

  it('yields no origin for a key it cannot decode into a hostname', () => {
    expect(clerkFrontendApiOrigin('not-a-key')).toBeNull();
    expect(clerkFrontendApiOrigin(`pk_live_${btoa('not a host')}`)).toBeNull();
    expect(clerkFrontendApiOrigin(undefined)).toBeNull();
  });

  it('strips a long padding run promptly instead of backtracking over it', () => {
    const run = '$'.repeat(PADDING_RUN_LENGTH);
    const started = Date.now();
    expect(clerkFrontendApiOrigin(`pk_live_${btoa(`${run}x`)}`)).toBeNull();
    expect(clerkFrontendApiOrigin(`pk_live_${btoa(`clerk.example.com${run}`)}`)).toBe(
      'https://clerk.example.com',
    );
    expect(Date.now() - started).toBeLessThan(PADDING_BUDGET_MS);
  });

  it('puts the frontend api origin first and telemetry only on connect', () => {
    const key = `pk_live_${btoa('clerk.example.com$')}`;
    const origins = new ClerkIdentityProvider({
      publishableKey: key,
    }).middleware.contentSecurityPolicyOrigins();

    expect(origins.script[0]).toBe('https://clerk.example.com');
    expect(origins.connect).toContain('https://clerk-telemetry.com');
    expect(origins.script).not.toContain('https://clerk-telemetry.com');
  });

  it('omits the frontend api origin when the publishable key is unusable', () => {
    const origins = new ClerkIdentityProvider({
      publishableKey: 'pk_live_',
    }).middleware.contentSecurityPolicyOrigins();
    expect(origins.script).toEqual(['https://*.clerk.accounts.dev', 'https://*.clerk.com']);
  });

  it('hands the authorized parties to the session middleware', async () => {
    const middleware = new ClerkIdentityProvider().middleware.withSession(
      () => new Response('ok'),
      { authorizedParties: PARTIES },
    );

    expect(clerkState.middlewareOptions).toEqual({ authorizedParties: PARTIES });
    const response = await middleware({} as never, {} as never);
    expect(await (response as Response).text()).toBe('ok');
  });

  it('builds a route matcher from the patterns it is given', () => {
    const matcher = new ClerkIdentityProvider().middleware.createRouteMatcher(['/chat']);
    expect(clerkState.matcherPatterns).toEqual(['/chat']);
    expect(matcher({ nextUrl: { pathname: '/chat' } } as never)).toBe(true);
    expect(matcher({ nextUrl: { pathname: '/pricing' } } as never)).toBe(false);
  });
});
