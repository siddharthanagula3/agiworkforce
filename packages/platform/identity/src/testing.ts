import {
  IdentityConfigError,
  type IdentityClaims,
  type IdentityCookie,
  type IdentityCspOrigins,
  type IdentityEmailAddress,
  type IdentityMembership,
  type IdentityMiddlewareSupport,
  type IdentityProvider,
  type IdentityRequestAuth,
  type IdentitySecondFactorRegistration,
  type IdentitySession,
  type IdentitySessionPage,
  type IdentitySessionMiddleware,
  type IdentitySignInRoute,
  type IdentityUser,
  type ListUserSessionsOptions,
  type SessionMiddlewareHandler,
  type SessionMiddlewareOptions,
  type VerifySessionTokenOptions,
} from './types';

export const FAKE_PROVIDER_NAME = 'fake';

const SIGNED_OUT: IdentityRequestAuth = {
  subject: null,
  sessionId: null,
  organizationId: null,
  organizationRole: null,
  isSignedIn: false,
  getToken: async () => null,
};

export interface FakeSignInInput {
  subject: string;
  sessionId?: string | null;
  organizationId?: string | null;
  organizationRole?: string | null;
  token?: string | null;
}

export interface FakeIdentityUserInput extends Partial<Omit<IdentityUser, 'id'>> {
  id: string;
}

export interface FakeIdentityCalls {
  deletedUsers: string[];
  suspendedUsers: Array<{ userId: string; suspended: boolean }>;
  revokedSessions: string[];
  verifiedTokens: string[];
  authorizedParties: string[][];
  secondFactorRegistrations: Array<{
    userId: string;
    registration: IdentitySecondFactorRegistration;
  }>;
  removedSecondFactors: string[];
  passwordsSet: string[];
  removedEmailAddresses: string[];
}

function buildUser(input: FakeIdentityUserInput): IdentityUser {
  return {
    primaryEmail: null,
    primaryEmailVerification: 'unknown',
    primaryEmailAddressId: null,
    emails: [],
    emailAddresses: [],
    firstName: null,
    lastName: null,
    fullName: null,
    username: null,
    imageUrl: null,
    publicMetadata: {},
    privateMetadata: {},
    banned: false,
    locked: false,
    passwordEnabled: false,
    twoFactorEnabled: false,
    totpEnabled: false,
    backupCodesEnabled: false,
    createdAt: null,
    lastSignInAt: null,
    enterpriseAccounts: [],
    ...input,
  };
}

const FAKE_SIGN_IN_PATH = '/login';
const FAKE_SIGN_IN_REDIRECT_PARAM = 'redirectTo';
const FAKE_SESSION_COOKIE = 'fake_session';
const FAKE_SCRIPT_ORIGIN = 'https://identity.test';
const FAKE_AUTHORIZED_PARTY = 'https://app.test';

/**
 * The contract-conforming stand-in the web suites hand to the composition root
 * in place of a live provider. It exists so a test states the identity facts it
 * needs, rather than reproducing one vendor SDK's module shape, which is how a
 * mock drifts from the thing it stands for.
 */
export class FakeIdentityProvider<
  Request extends { nextUrl: { pathname: string } } = { nextUrl: { pathname: string } },
> implements IdentityProvider<Request> {
  readonly name = FAKE_PROVIDER_NAME;

  readonly calls: FakeIdentityCalls = {
    deletedUsers: [],
    suspendedUsers: [],
    revokedSessions: [],
    verifiedTokens: [],
    authorizedParties: [],
    secondFactorRegistrations: [],
    removedSecondFactors: [],
    passwordsSet: [],
    removedEmailAddresses: [],
  };

  private requestAuth: IdentityRequestAuth = SIGNED_OUT;
  private readonly users = new Map<string, IdentityUser>();
  private readonly sessions = new Map<string, IdentitySession>();
  private readonly memberships = new Map<string, IdentityMembership[]>();
  private readonly tokens = new Map<string, IdentityClaims>();
  private readonly passwords = new Map<string, string>();
  private emailAddressSequence = 0;
  private matchedRoutes: readonly string[] = [];
  private parties: readonly string[] = [FAKE_AUTHORIZED_PARTY];

  canVerifySessionTokens(): boolean {
    return true;
  }

  authorizedParties(): readonly string[] {
    if (this.parties.length === 0) {
      throw new IdentityConfigError(
        'Session-token verification requires an authorized-party allowlist.',
      );
    }
    return this.parties;
  }

  setAuthorizedParties(parties: readonly string[]): this {
    this.parties = [...parties];
    return this;
  }

  signIn(input: FakeSignInInput): this {
    const token = input.token ?? null;
    this.requestAuth = {
      subject: input.subject,
      sessionId: input.sessionId ?? null,
      organizationId: input.organizationId ?? null,
      organizationRole: input.organizationRole ?? null,
      isSignedIn: true,
      getToken: async () => token,
    };
    if (token) {
      this.setToken(token, {
        subject: input.subject,
        sessionId: input.sessionId ?? null,
        organizationId: input.organizationId ?? null,
        organizationRole: input.organizationRole ?? null,
        email: null,
        raw: {},
      });
    }
    return this;
  }

  signOut(): this {
    this.requestAuth = SIGNED_OUT;
    return this;
  }

  setUser(input: FakeIdentityUserInput): this {
    this.users.set(input.id, buildUser(input));
    return this;
  }

  setSession(session: IdentitySession): this {
    this.sessions.set(session.id, session);
    return this;
  }

  setMemberships(userId: string, memberships: readonly IdentityMembership[]): this {
    this.memberships.set(userId, [...memberships]);
    return this;
  }

  setToken(token: string, claims: IdentityClaims): this {
    this.tokens.set(token, claims);
    return this;
  }

  /** Paths `middleware.createRouteMatcher` should report as a match. */
  setMatchedRoutes(paths: readonly string[]): this {
    this.matchedRoutes = [...paths];
    return this;
  }

  reset(): this {
    this.requestAuth = SIGNED_OUT;
    this.users.clear();
    this.sessions.clear();
    this.memberships.clear();
    this.tokens.clear();
    this.matchedRoutes = [];
    this.parties = [FAKE_AUTHORIZED_PARTY];
    this.calls.deletedUsers.length = 0;
    this.calls.suspendedUsers.length = 0;
    this.calls.revokedSessions.length = 0;
    this.calls.verifiedTokens.length = 0;
    this.calls.authorizedParties.length = 0;
    this.calls.secondFactorRegistrations.length = 0;
    this.calls.removedSecondFactors.length = 0;
    this.calls.passwordsSet.length = 0;
    this.calls.removedEmailAddresses.length = 0;
    this.passwords.clear();
    this.emailAddressSequence = 0;
    return this;
  }

  async verifySessionToken(
    token: string,
    options: VerifySessionTokenOptions,
  ): Promise<IdentityClaims | null> {
    this.calls.verifiedTokens.push(token);
    this.calls.authorizedParties.push([...options.authorizedParties]);
    if (options.authorizedParties.length === 0) {
      throw new IdentityConfigError(
        'Session-token verification needs an authorized-party allowlist.',
      );
    }
    return this.tokens.get(token) ?? null;
  }

  async currentRequestAuth(): Promise<IdentityRequestAuth> {
    return this.requestAuth;
  }

  async getUser(userId: string): Promise<IdentityUser | null> {
    return this.users.get(userId) ?? null;
  }

  async deleteUser(userId: string): Promise<void> {
    this.calls.deletedUsers.push(userId);
    this.users.delete(userId);
  }

  async setUserSuspended(userId: string, suspended: boolean): Promise<void> {
    this.calls.suspendedUsers.push({ userId, suspended });
    const user = this.users.get(userId);
    if (user) this.users.set(userId, { ...user, banned: suspended });
  }

  async listUserSessions(
    userId: string,
    options: ListUserSessionsOptions = {},
  ): Promise<IdentitySessionPage> {
    const owned = [...this.sessions.values()].filter(
      (session) =>
        session.userId === userId && (!options.status || session.status === options.status),
    );
    const offset = options.offset ?? 0;
    const limit = options.limit ?? owned.length;
    return { sessions: owned.slice(offset, offset + limit), totalCount: owned.length };
  }

  async getSession(sessionId: string): Promise<IdentitySession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async revokeSession(sessionId: string): Promise<void> {
    this.calls.revokedSessions.push(sessionId);
    this.sessions.delete(sessionId);
  }

  async listOrganizationMemberships(userId: string): Promise<readonly IdentityMembership[]> {
    return this.memberships.get(userId) ?? [];
  }

  private updateUser(userId: string, change: Partial<IdentityUser>): void {
    const user = this.users.get(userId);
    if (user) this.users.set(userId, { ...user, ...change });
  }

  async registerSecondFactor(
    userId: string,
    registration: IdentitySecondFactorRegistration,
  ): Promise<void> {
    this.calls.secondFactorRegistrations.push({ userId, registration });
    const user = this.users.get(userId);
    const totpEnabled = Boolean(registration.totpSecret) || user?.totpEnabled === true;
    const backupCodesEnabled =
      (registration.backupCodes?.length ?? 0) > 0 || user?.backupCodesEnabled === true;
    this.updateUser(userId, {
      totpEnabled,
      backupCodesEnabled,
      twoFactorEnabled: totpEnabled || backupCodesEnabled,
    });
  }

  async removeSecondFactor(userId: string): Promise<void> {
    this.calls.removedSecondFactors.push(userId);
    this.updateUser(userId, {
      totpEnabled: false,
      backupCodesEnabled: false,
      twoFactorEnabled: false,
    });
  }

  async verifyPassword(userId: string, password: string): Promise<boolean> {
    return this.passwords.get(userId) === password;
  }

  async setPassword(userId: string, password: string): Promise<void> {
    this.calls.passwordsSet.push(userId);
    this.passwords.set(userId, password);
    this.updateUser(userId, { passwordEnabled: true });
  }

  async addEmailAddress(userId: string, emailAddress: string): Promise<IdentityEmailAddress> {
    this.emailAddressSequence += 1;
    const address: IdentityEmailAddress = {
      id: `email_${this.emailAddressSequence}`,
      emailAddress,
      verified: false,
    };
    const user = this.users.get(userId);
    if (user) {
      this.users.set(userId, {
        ...user,
        emails: [...user.emails, emailAddress],
        emailAddresses: [...user.emailAddresses, address],
      });
    }
    return address;
  }

  verifyEmailAddress(userId: string, emailAddressId: string): this {
    const user = this.users.get(userId);
    if (user) {
      this.users.set(userId, {
        ...user,
        emailAddresses: user.emailAddresses.map((address) =>
          address.id === emailAddressId ? { ...address, verified: true } : address,
        ),
      });
    }
    return this;
  }

  async setPrimaryEmailAddress(userId: string, emailAddressId: string): Promise<void> {
    const user = this.users.get(userId);
    const address = user?.emailAddresses.find((candidate) => candidate.id === emailAddressId);
    if (!user || !address) return;
    this.users.set(userId, {
      ...user,
      primaryEmail: address.emailAddress,
      primaryEmailAddressId: address.id,
      primaryEmailVerification: address.verified ? 'verified' : 'unverified',
    });
  }

  async removeEmailAddress(emailAddressId: string): Promise<void> {
    this.calls.removedEmailAddresses.push(emailAddressId);
    for (const [userId, user] of this.users) {
      const removed = user.emailAddresses.find((address) => address.id === emailAddressId);
      if (!removed) continue;
      this.users.set(userId, {
        ...user,
        emails: user.emails.filter((email) => email !== removed.emailAddress),
        emailAddresses: user.emailAddresses.filter((address) => address.id !== emailAddressId),
      });
    }
  }

  readonly middleware: IdentityMiddlewareSupport<Request> = {
    createRouteMatcher:
      (_patterns: readonly string[]) =>
      (request: Request): boolean =>
        this.matchedRoutes.includes(request.nextUrl.pathname),
    withSession:
      (
        handler: SessionMiddlewareHandler<Request>,
        _options: SessionMiddlewareOptions,
      ): IdentitySessionMiddleware<Request> =>
      (request) =>
        handler(request),
    contentSecurityPolicyOrigins: (): IdentityCspOrigins => ({
      script: [FAKE_SCRIPT_ORIGIN],
      connect: [FAKE_SCRIPT_ORIGIN],
    }),
    signInRoute: (): IdentitySignInRoute => ({
      path: FAKE_SIGN_IN_PATH,
      redirectParam: FAKE_SIGN_IN_REDIRECT_PARAM,
    }),
    hasBrowserSessionCookie: (cookies: readonly IdentityCookie[]): boolean =>
      cookies.some(({ name, value }) => name === FAKE_SESSION_COOKIE && value.length > 0),
  };
}

export function createFakeIdentityProvider<
  Request extends { nextUrl: { pathname: string } } = { nextUrl: { pathname: string } },
>(): FakeIdentityProvider<Request> {
  return new FakeIdentityProvider<Request>();
}
