/**
 * The provider SDK is resolved from the host application's dependencies rather
 * than declared here, and that is deliberate. This repository installs peer
 * dependencies automatically, so declaring these would give this package its
 * own copy of the SDK under a different peer resolution: two provider
 * singletons in one process, a second copy of the framework's types that broke
 * the host's typecheck, and a module identity the host's tests cannot intercept
 * when they stand the provider in. `check:boundaries` is what keeps the import
 * honest instead: the SDK is reachable from this adapter and nowhere else.
 */
import { verifyToken as clerkVerifyToken } from '@clerk/backend';
import { isClerkAPIResponseError } from '@clerk/backend/errors';
import * as clerkServer from '@clerk/nextjs/server';

import { APP_URL_ENV, resolveDeploymentOrigin } from '../deployment-origin';
import { clerkHasBrowserSessionCookie } from '../session-cookie';
import {
  IdentityConfigError,
  IdentityRequestRejectedError,
  type IdentityClaims,
  type IdentityCspOrigins,
  type IdentityEmailAddress,
  type IdentityEmailVerification,
  type IdentityFactorAge,
  type IdentityMembership,
  type IdentityMiddlewareSupport,
  type IdentityProvider,
  type IdentityRequestAuth,
  type IdentitySecondFactorRegistration,
  type IdentitySession,
  type IdentitySessionActivity,
  type IdentitySessionPage,
  type IdentitySessionMiddleware,
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
const CLERK_FAPI_HOST_PADDING_CHAR = '$';
const HOSTNAME_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})+$/u;

const CLERK_ACCOUNTS_ORIGIN = 'https://*.clerk.accounts.dev';
const CLERK_API_ORIGIN = 'https://*.clerk.com';
const CLERK_TELEMETRY_ORIGIN = 'https://clerk-telemetry.com';

const SIGN_IN_PATH = '/login';
const SIGN_IN_REDIRECT_PARAM = 'redirectTo';

type ClerkClient = Awaited<ReturnType<typeof clerkServer.clerkClient>>;
type ClerkUser = Awaited<ReturnType<ClerkClient['users']['getUser']>>;
type ClerkSession = Awaited<ReturnType<ClerkClient['sessions']['getSession']>>;
type ClerkSessionActivity = NonNullable<ClerkSession['latestActivity']>;
type ClerkEmailAddress = ClerkUser['emailAddresses'][number];

const CLIENT_ERROR_STATUS_MIN = 400;
const SERVER_ERROR_STATUS_MIN = 500;
const RATE_LIMITED_STATUS = 429;
const LOCKED_ACCOUNT_CODE = 'user_locked';

export interface ClerkIdentityConfig {
  secretKey?: string | undefined;
  publishableKey?: string | undefined;
  authorizedParties?: readonly string[] | undefined;
  appUrl?: string | undefined;
  verifyToken?: typeof clerkVerifyToken;
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

function stripFapiHostPadding(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === CLERK_FAPI_HOST_PADDING_CHAR) end -= 1;
  return value.slice(0, end);
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
    host = stripFapiHostPadding(atob(encoded));
  } catch {
    return null;
  }
  if (!HOSTNAME_PATTERN.test(host)) return null;
  return `https://${host}`;
}

const VERIFIED_STATUS = 'verified';

function toFactorAge(value: unknown): IdentityFactorAge | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [first, second] = value as unknown[];
  if (typeof first !== 'number' || typeof second !== 'number') return null;
  return {
    firstFactorMinutes: first < 0 ? null : first,
    secondFactorMinutes: second < 0 ? null : second,
  };
}

function toEmailAddress(address: ClerkEmailAddress): IdentityEmailAddress {
  return {
    id: address.id,
    emailAddress: address.emailAddress,
    verified: address.verification?.status === VERIFIED_STATUS,
  };
}

function rejectionOf(error: unknown): IdentityRequestRejectedError | null {
  if (!isClerkAPIResponseError(error)) return null;
  const { status } = error;
  if (
    status < CLIENT_ERROR_STATUS_MIN ||
    status >= SERVER_ERROR_STATUS_MIN ||
    status === RATE_LIMITED_STATUS
  ) {
    return null;
  }
  const first = error.errors[0];
  return new IdentityRequestRejectedError(
    first?.longMessage ?? first?.message ?? error.message,
    first?.code ?? null,
  );
}

async function rejectingInput<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw rejectionOf(error) ?? error;
  }
}

function toEmailVerification(primary: ClerkUser['primaryEmailAddress']): IdentityEmailVerification {
  const status = primary?.verification?.status ?? null;
  if (status === VERIFIED_STATUS) return 'verified';
  if (status === null) return 'unknown';
  return 'unverified';
}

function toUser(user: ClerkUser): IdentityUser {
  // Defensive over provider data: a field the API stops returning must degrade
  // the mapping, not throw inside whichever gate happens to be reading it.
  const emails = (user.emailAddresses ?? []).map((address) => address.emailAddress).filter(Boolean);
  return {
    id: user.id,
    primaryEmail: optional(user.primaryEmailAddress?.emailAddress) ?? emails[0] ?? null,
    primaryEmailVerification: toEmailVerification(user.primaryEmailAddress),
    primaryEmailAddressId: optional(user.primaryEmailAddressId),
    emails,
    emailAddresses: (user.emailAddresses ?? [])
      .filter((address) => Boolean(address.id))
      .map(toEmailAddress),
    firstName: optional(user.firstName),
    lastName: optional(user.lastName),
    fullName: optional([user.firstName, user.lastName].filter(Boolean).join(' ')),
    username: optional(user.username),
    imageUrl: optional(user.imageUrl),
    publicMetadata: readRecord(user.publicMetadata),
    privateMetadata: readRecord(user.privateMetadata),
    banned: user.banned,
    locked: user.locked,
    passwordEnabled: user.passwordEnabled === true,
    twoFactorEnabled: user.twoFactorEnabled,
    totpEnabled: user.totpEnabled === true,
    backupCodesEnabled: user.backupCodeEnabled === true,
    createdAt: user.createdAt,
    lastSignInAt: user.lastSignInAt,
    enterpriseAccounts: (user.enterpriseAccounts ?? []).map((account) => ({
      connectionId: optional(account.enterpriseConnection?.id),
      emailAddress: account.emailAddress,
      active: account.active,
    })),
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

export class ClerkIdentityProvider<Request = unknown> implements IdentityProvider<Request> {
  readonly name = CLERK_PROVIDER_NAME;

  private client: Promise<ClerkClient> | null = null;

  constructor(private readonly config: ClerkIdentityConfig = {}) {}

  private secretKey(): string | null {
    return optional(this.config.secretKey ?? readEnv(CLERK_SECRET_KEY_ENV));
  }

  canVerifySessionTokens(): boolean {
    return this.secretKey() !== null;
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
    this.client ??= clerkServer.clerkClient();
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

    // The verifier is imported statically and resolved before the try, so only
    // the verification itself can be swallowed as "not a valid token". Loading
    // it lazily inside the try turned an unresolvable module into a silent 401
    // on every bearer request.
    const verify = this.config.verifyToken ?? clerkVerifyToken;

    let claims: Record<string, unknown>;
    try {
      claims = (await verify(token, { secretKey, authorizedParties })) as Record<string, unknown>;
    } catch {
      return null;
    }

    const subject = readStringClaim(claims, 'sub');
    if (!subject) return null;
    return {
      subject,
      sessionId: readStringClaim(claims, 'sid'),
      organizationId: readStringClaim(claims, 'org_id'),
      organizationRole: readStringClaim(claims, 'org_role'),
      email: readStringClaim(claims, 'email'),
      factorAge: toFactorAge(claims['fva']),
      raw: claims,
    };
  }

  async currentRequestAuth(): Promise<IdentityRequestAuth> {
    const session = await clerkServer.auth();
    return {
      subject: session.userId ?? null,
      sessionId: session.sessionId ?? null,
      organizationId: session.orgId ?? null,
      organizationRole: session.orgRole ?? null,
      isSignedIn: Boolean(session.userId),
      factorAge: toFactorAge(session.factorVerificationAge),
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

  async createSignInToken(userId: string, expiresInSeconds: number): Promise<string> {
    const signInToken = await (
      await this.apiClient()
    ).signInTokens.createSignInToken({ userId, expiresInSeconds });
    return signInToken.token;
  }

  async listOrganizationMemberships(userId: string): Promise<readonly IdentityMembership[]> {
    const response = await (await this.apiClient()).users.getOrganizationMembershipList({ userId });
    return response.data.map((membership) => ({
      organizationId: membership.organization.id,
      organizationName: optional(membership.organization.name),
      role: membership.role,
    }));
  }

  async registerSecondFactor(
    userId: string,
    registration: IdentitySecondFactorRegistration,
  ): Promise<void> {
    const client = await this.apiClient();
    await rejectingInput(() =>
      client.users.updateUser(userId, {
        ...(registration.totpSecret ? { totpSecret: registration.totpSecret } : {}),
        ...(registration.backupCodes ? { backupCodes: [...registration.backupCodes] } : {}),
      }),
    );
  }

  async removeSecondFactor(userId: string): Promise<void> {
    await (await this.apiClient()).users.disableUserMFA(userId);
  }

  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const client = await this.apiClient();
    try {
      await client.users.verifyPassword({ userId, password });
      return true;
    } catch (error) {
      const rejection = rejectionOf(error);
      if (!rejection || rejection.code === LOCKED_ACCOUNT_CODE) throw rejection ?? error;
      return false;
    }
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const client = await this.apiClient();
    await rejectingInput(() => client.users.updateUser(userId, { password }));
  }

  async addEmailAddress(userId: string, emailAddress: string): Promise<IdentityEmailAddress> {
    const client = await this.apiClient();
    const created = await rejectingInput(() =>
      client.emailAddresses.createEmailAddress({
        userId,
        emailAddress,
        verified: false,
        primary: false,
      }),
    );
    return toEmailAddress(created);
  }

  async setPrimaryEmailAddress(userId: string, emailAddressId: string): Promise<void> {
    const client = await this.apiClient();
    await rejectingInput(() =>
      client.users.updateUser(userId, {
        primaryEmailAddressID: emailAddressId,
        notifyPrimaryEmailAddressChanged: true,
      }),
    );
  }

  async removeEmailAddress(emailAddressId: string): Promise<void> {
    const client = await this.apiClient();
    await rejectingInput(() => client.emailAddresses.deleteEmailAddress(emailAddressId));
  }

  /**
   * The two casts here are the whole reason the port keeps the request type
   * abstract: Clerk types these against the Next request, and naming that type
   * in the port would bind this package to a second copy of Next's types.
   */
  readonly middleware: IdentityMiddlewareSupport<Request> = {
    createRouteMatcher: (patterns: readonly string[]): ((request: Request) => boolean) =>
      clerkServer.createRouteMatcher([...patterns]) as unknown as (request: Request) => boolean,
    withSession: (
      handler: SessionMiddlewareHandler<Request>,
      options: SessionMiddlewareOptions,
    ): IdentitySessionMiddleware<Request> =>
      clerkServer.clerkMiddleware((_session, request) => handler(request as Request), {
        authorizedParties: [...options.authorizedParties],
      }) as unknown as IdentitySessionMiddleware<Request>,
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
