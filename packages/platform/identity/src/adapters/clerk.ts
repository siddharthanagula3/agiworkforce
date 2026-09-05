import { auth, clerkClient, clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import type { NextMiddleware, NextRequest } from 'next/server';

import { APP_URL_ENV, resolveDeploymentOrigin } from '../deployment-origin';
import { clerkHasBrowserSessionCookie } from '../session-cookie';
import {
  IdentityConfigError,
  type IdentityClaims,
  type IdentityCspOrigins,
  type IdentityMembership,
  type IdentityMiddlewareSupport,
  type IdentityProvider,
  type IdentityRequestAuth,
  type IdentitySession,
  type IdentitySessionActivity,
  type IdentitySessionPage,
  type IdentitySignInRoute,
  type IdentityUser,
  type ListUserSessionsOptions,
  type SessionMiddlewareHandler,
  type SessionMiddlewareOptions,
  type VerifySessionTokenOptions,
} from '../types';

export const CLERK_PROVIDER_NAME = 'clerk';

export const CLERK_SECRET_KEY_ENV = 'CLERK_SECRET_KEY';
export const CLERK_PUBLISHABLE_KEY_ENV = 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY';
export const CLERK_AUTHORIZED_PARTIES_ENV = 'CLERK_AUTHORIZED_PARTIES';

const CLERK_PUBLISHABLE_KEY_PREFIX = /^pk_(test|live)_/u;
const CLERK_FAPI_HOST_PADDING = /\$+$/u;
const HOSTNAME_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})+$/u;

const CLERK_ACCOUNTS_ORIGIN = 'https://*.clerk.accounts.dev';
const CLERK_API_ORIGIN = 'https://*.clerk.com';
const CLERK_TELEMETRY_ORIGIN = 'https://clerk-telemetry.com';

const SIGN_IN_PATH = '/login';
const SIGN_IN_REDIRECT_PARAM = 'redirectTo';

type ClerkClient = Awaited<ReturnType<typeof clerkClient>>;
type ClerkUser = Awaited<ReturnType<ClerkClient['users']['getUser']>>;
type ClerkSession = Awaited<ReturnType<ClerkClient['sessions']['getSession']>>;
type ClerkSessionActivity = NonNullable<ClerkSession['latestActivity']>;
type ClerkBackendModule = typeof import('@clerk/backend');

export interface ClerkIdentityConfig {
  secretKey?: string | undefined;
  publishableKey?: string | undefined;
  authorizedParties?: readonly string[] | undefined;
  appUrl?: string | undefined;
  loadBackend?: () => Promise<ClerkBackendModule>;
}

function optional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function readEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  return process.env[name];
}

function readRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readStringClaim(claims: Record<string, unknown>, key: string): string | null {
  const value = claims[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Clerk encodes its frontend API host in the publishable key, and the page
 * policy has to name that origin. It is not derivable from any other
 * configuration, so an unparseable key yields no origin rather than a guess.
 */
export function clerkFrontendApiOrigin(publishableKey: string | undefined): string | null {
  const key = optional(publishableKey);
  const encoded = key?.replace(CLERK_PUBLISHABLE_KEY_PREFIX, '');
  if (!encoded || encoded === key) return null;
  let host: string;
  try {
    host = atob(encoded).replace(CLERK_FAPI_HOST_PADDING, '');
  } catch {
    return null;
  }
  if (!HOSTNAME_PATTERN.test(host)) return null;
  return `https://${host}`;
}

function toUser(user: ClerkUser): IdentityUser {
  const emails = user.emailAddresses.map((address) => address.emailAddress).filter(Boolean);
  return {
    id: user.id,
    primaryEmail: optional(user.primaryEmailAddress?.emailAddress) ?? emails[0] ?? null,
    emails,
    firstName: optional(user.firstName),
    lastName: optional(user.lastName),
    fullName: optional([user.firstName, user.lastName].filter(Boolean).join(' ')),
    username: optional(user.username),
    imageUrl: optional(user.imageUrl),
    publicMetadata: readRecord(user.publicMetadata),
    privateMetadata: readRecord(user.privateMetadata),
    banned: user.banned,
    locked: user.locked,
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt,
    lastSignInAt: user.lastSignInAt,
  };
}

function toActivity(activity: ClerkSessionActivity | undefined): IdentitySessionActivity | null {
  if (!activity) return null;
  return {
    ipAddress: optional(activity.ipAddress),
    city: optional(activity.city),
    country: optional(activity.country),
    browserName: optional(activity.browserName),
    browserVersion: optional(activity.browserVersion),
    deviceType: optional(activity.deviceType),
    isMobile: activity.isMobile,
  };
}

function toSession(session: ClerkSession): IdentitySession {
  return {
    id: session.id,
    userId: session.userId,
    status: session.status,
    createdAt: session.createdAt,
    lastActiveAt: session.lastActiveAt,
    expireAt: session.expireAt,
    latestActivity: toActivity(session.latestActivity),
  };
}

export class ClerkIdentityProvider implements IdentityProvider {
  readonly name = CLERK_PROVIDER_NAME;

  private client: Promise<ClerkClient> | null = null;

  constructor(private readonly config: ClerkIdentityConfig = {}) {}

  private secretKey(): string | null {
    return optional(this.config.secretKey ?? readEnv(CLERK_SECRET_KEY_ENV));
  }

  /**
   * An empty allowlist makes Clerk skip the azp check altogether, so an
   * unresolvable one throws rather than authenticating every origin.
   */
  authorizedParties(): readonly string[] {
    const configured = (
      this.config.authorizedParties ?? (readEnv(CLERK_AUTHORIZED_PARTIES_ENV) ?? '').split(',')
    )
      .map((party) => party.trim())
      .filter(Boolean);
    if (configured.length > 0) return configured;

    const origin = resolveDeploymentOrigin(this.config.appUrl);
    if (origin) return [origin];

    throw new IdentityConfigError(
      `Session-token verification requires an authorized-party allowlist: set ${CLERK_AUTHORIZED_PARTIES_ENV}, or a valid absolute ${APP_URL_ENV} to fall back to this deployment origin.`,
    );
  }

  private publishableKey(): string | undefined {
    return this.config.publishableKey ?? readEnv(CLERK_PUBLISHABLE_KEY_ENV);
  }

  private apiClient(): Promise<ClerkClient> {
    this.client ??= clerkClient();
    return this.client;
  }

  async verifySessionToken(
    token: string,
    options: VerifySessionTokenOptions,
  ): Promise<IdentityClaims | null> {
    const secretKey = this.secretKey();
    if (!secretKey) return null;

    const authorizedParties = options.authorizedParties
      .map((party) => party.trim())
      .filter(Boolean);
    if (authorizedParties.length === 0) {
      throw new IdentityConfigError(
        'Session-token verification needs an authorized-party allowlist: an empty list skips the azp check, which accepts a token minted for another origin on the same instance.',
      );
    }

    try {
      const { verifyToken } = await (this.config.loadBackend ?? (() => import('@clerk/backend')))();
      const claims = (await verifyToken(token, { secretKey, authorizedParties })) as Record<
        string,
        unknown
      >;
      const subject = readStringClaim(claims, 'sub');
      if (!subject) return null;
      return {
        subject,
        sessionId: readStringClaim(claims, 'sid'),
        organizationId: readStringClaim(claims, 'org_id'),
        organizationRole: readStringClaim(claims, 'org_role'),
        email: readStringClaim(claims, 'email'),
        raw: claims,
      };
    } catch {
      return null;
    }
  }

  async currentRequestAuth(): Promise<IdentityRequestAuth> {
    const session = await auth();
    return {
      subject: session.userId ?? null,
      sessionId: session.sessionId ?? null,
      organizationId: session.orgId ?? null,
      organizationRole: session.orgRole ?? null,
      isSignedIn: Boolean(session.userId),
      getToken: async () => (await session.getToken()) ?? null,
    };
  }

  async getUser(userId: string): Promise<IdentityUser | null> {
    return toUser(await (await this.apiClient()).users.getUser(userId));
  }

  async deleteUser(userId: string): Promise<void> {
    await (await this.apiClient()).users.deleteUser(userId);
  }

  async setUserSuspended(userId: string, suspended: boolean): Promise<void> {
    const users = (await this.apiClient()).users;
    if (suspended) await users.banUser(userId);
    else await users.unbanUser(userId);
  }

  async listUserSessions(
    userId: string,
    options: ListUserSessionsOptions = {},
  ): Promise<IdentitySessionPage> {
    const response = await (
      await this.apiClient()
    ).sessions.getSessionList({
      userId,
      ...(options.status ? { status: options.status } : {}),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      ...(options.offset === undefined ? {} : { offset: options.offset }),
    });
    return { sessions: response.data.map(toSession), totalCount: response.totalCount };
  }

  async getSession(sessionId: string): Promise<IdentitySession | null> {
    return toSession(await (await this.apiClient()).sessions.getSession(sessionId));
  }

  async revokeSession(sessionId: string): Promise<void> {
    await (await this.apiClient()).sessions.revokeSession(sessionId);
  }

  async listOrganizationMemberships(userId: string): Promise<readonly IdentityMembership[]> {
    const response = await (await this.apiClient()).users.getOrganizationMembershipList({ userId });
    return response.data.map((membership) => ({
      organizationId: membership.organization.id,
      organizationName: optional(membership.organization.name),
      role: membership.role,
    }));
  }

  readonly middleware: IdentityMiddlewareSupport = {
    createRouteMatcher: (patterns: readonly string[]): ((request: NextRequest) => boolean) =>
      createRouteMatcher([...patterns]),
    withSession: (
      handler: SessionMiddlewareHandler,
      options: SessionMiddlewareOptions,
    ): NextMiddleware =>
      clerkMiddleware((_session, request) => handler(request), {
        authorizedParties: [...options.authorizedParties],
      }),
    contentSecurityPolicyOrigins: (): IdentityCspOrigins => {
      const frontendApi = clerkFrontendApiOrigin(this.publishableKey());
      const shared = frontendApi
        ? [frontendApi, CLERK_ACCOUNTS_ORIGIN, CLERK_API_ORIGIN]
        : [CLERK_ACCOUNTS_ORIGIN, CLERK_API_ORIGIN];
      return { script: shared, connect: [...shared, CLERK_TELEMETRY_ORIGIN] };
    },
    signInRoute: (): IdentitySignInRoute => ({
      path: SIGN_IN_PATH,
      redirectParam: SIGN_IN_REDIRECT_PARAM,
    }),
    hasBrowserSessionCookie: clerkHasBrowserSessionCookie,
  };
}
