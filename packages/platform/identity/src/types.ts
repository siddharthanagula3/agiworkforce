import type { NextMiddleware, NextRequest } from 'next/server';

export const IDENTITY_PROVIDERS = ['clerk'] as const;

export type IdentityProviderName = (typeof IDENTITY_PROVIDERS)[number];

export class IdentityConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityConfigError';
    Object.setPrototypeOf(this, IdentityConfigError.prototype);
  }
}

export interface IdentityClaims {
  subject: string;
  sessionId: string | null;
  organizationId: string | null;
  organizationRole: string | null;
  email: string | null;
  raw: Readonly<Record<string, unknown>>;
}

export interface VerifySessionTokenOptions {
  /**
   * Required. A provider that skips the authorized-party check accepts a token
   * minted for another origin on the same instance, so the port refuses to
   * verify without one rather than leaving the decision to each caller.
   */
  authorizedParties: readonly string[];
}

export interface IdentityRequestAuth {
  subject: string | null;
  sessionId: string | null;
  organizationId: string | null;
  organizationRole: string | null;
  isSignedIn: boolean;
  getToken: () => Promise<string | null>;
}

export interface IdentityUser {
  id: string;
  primaryEmail: string | null;
  emails: readonly string[];
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  username: string | null;
  imageUrl: string | null;
  publicMetadata: Readonly<Record<string, unknown>>;
  privateMetadata: Readonly<Record<string, unknown>>;
  banned: boolean;
  locked: boolean;
  twoFactorEnabled: boolean;
  createdAt: number | null;
  lastSignInAt: number | null;
}

export interface IdentitySessionActivity {
  ipAddress: string | null;
  city: string | null;
  country: string | null;
  browserName: string | null;
  browserVersion: string | null;
  deviceType: string | null;
  isMobile: boolean | null;
}

export interface IdentitySession {
  id: string;
  userId: string;
  status: string;
  createdAt: number | null;
  lastActiveAt: number | null;
  expireAt: number | null;
  latestActivity: IdentitySessionActivity | null;
}

export interface ListUserSessionsOptions {
  status?: 'active';
  limit?: number;
  offset?: number;
}

export interface IdentitySessionPage {
  sessions: readonly IdentitySession[];
  totalCount: number;
}

export interface IdentityMembership {
  organizationId: string;
  organizationName: string | null;
  role: string;
}

export interface IdentityCookie {
  name: string;
  value: string;
}

export interface IdentityCspOrigins {
  script: readonly string[];
  connect: readonly string[];
}

export interface IdentitySignInRoute {
  path: string;
  redirectParam: string;
}

export interface SessionMiddlewareOptions {
  authorizedParties: readonly string[];
}

export type SessionMiddlewareHandler = (
  request: NextRequest,
) => Response | Promise<Response> | undefined | Promise<Response | undefined>;

/**
 * The request-lifecycle pieces a provider owns before any route runs: which
 * paths its session machinery must see, what a signed-out visitor is sent to,
 * which origins its scripts and network calls need in the page policy, and
 * which cookie proves a browser session exists.
 */
export interface IdentityMiddlewareSupport {
  createRouteMatcher(patterns: readonly string[]): (request: NextRequest) => boolean;
  withSession(handler: SessionMiddlewareHandler, options: SessionMiddlewareOptions): NextMiddleware;
  contentSecurityPolicyOrigins(): IdentityCspOrigins;
  signInRoute(): IdentitySignInRoute;
  hasBrowserSessionCookie(cookies: readonly IdentityCookie[]): boolean;
}

/**
 * Everything this product asks of an identity provider. A second provider is a
 * second implementation of this interface plus an entry in the composition
 * root; no route, guard or page changes.
 */
export interface IdentityProvider {
  readonly name: string;
  authorizedParties(): readonly string[];
  verifySessionToken(
    token: string,
    options: VerifySessionTokenOptions,
  ): Promise<IdentityClaims | null>;
  currentRequestAuth(): Promise<IdentityRequestAuth>;
  getUser(userId: string): Promise<IdentityUser | null>;
  deleteUser(userId: string): Promise<void>;
  setUserSuspended(userId: string, suspended: boolean): Promise<void>;
  listUserSessions(userId: string, options?: ListUserSessionsOptions): Promise<IdentitySessionPage>;
  getSession(sessionId: string): Promise<IdentitySession | null>;
  revokeSession(sessionId: string): Promise<void>;
  listOrganizationMemberships(userId: string): Promise<readonly IdentityMembership[]>;
  readonly middleware: IdentityMiddlewareSupport;
}
