import { createClerkClient } from '@clerk/backend';
import type {
  IdentityProvider,
  IdentitySession,
  IdentitySessionActivity,
  IdentitySessionPage,
  ListUserSessionsOptions,
} from '../types';

type ClerkClient = ReturnType<typeof createClerkClient>;
type ClerkSession = Awaited<ReturnType<ClerkClient['sessions']['getSession']>>;

export type IdentitySessionManager = Pick<
  IdentityProvider,
  'listUserSessions' | 'getSession' | 'revokeSession'
>;

function optional(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function toActivity(activity: ClerkSession['latestActivity']): IdentitySessionActivity | null {
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

export class ClerkSessionManager implements IdentitySessionManager {
  constructor(private readonly client: () => Promise<Pick<ClerkClient, 'sessions'>>) {}

  async listUserSessions(
    userId: string,
    options: ListUserSessionsOptions = {},
  ): Promise<IdentitySessionPage> {
    const response = await (
      await this.client()
    ).sessions.getSessionList({
      userId,
      ...(options.status ? { status: options.status } : {}),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      ...(options.offset === undefined ? {} : { offset: options.offset }),
    });
    return { sessions: response.data.map(toSession), totalCount: response.totalCount };
  }

  async getSession(sessionId: string): Promise<IdentitySession | null> {
    return toSession(await (await this.client()).sessions.getSession(sessionId));
  }

  async revokeSession(sessionId: string): Promise<void> {
    await (await this.client()).sessions.revokeSession(sessionId);
  }
}

export function createClerkSessionManager(secretKey: string): IdentitySessionManager {
  let client: ClerkClient | undefined;
  return new ClerkSessionManager(async () => {
    client ??= createClerkClient({ secretKey });
    return client;
  });
}
