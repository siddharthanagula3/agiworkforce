import { getClerkInstance } from '@clerk/expo';

const DEVELOPMENT_CLERK_PUBLISHABLE_KEY =
  'pk_test_aGFuZHktamF3ZmlzaC03My5jbGVyay5hY2NvdW50cy5kZXYk';
const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const configuredPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

if (
  (appEnv === 'production' || appEnv === 'preview') &&
  !configuredPublishableKey?.startsWith('pk_live_')
) {
  throw new Error(
    `[clerk] ${appEnv} builds require EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to be a live Clerk publishable key.`,
  );
}

export const CLERK_PUBLISHABLE_KEY = configuredPublishableKey || DEVELOPMENT_CLERK_PUBLISHABLE_KEY;

export const CLERK_NATIVE_AUTH_OPTIONS = {
  treatPendingAsSignedOut: false,
} as const;

let tokenGetter: (() => Promise<string | null>) | null = null;
let userIdGetter: (() => string | null) | null = null;
let tokenRefreshGetter: (() => Promise<string | null>) | null = null;

export function setClerkTokenGetter(
  getToken: (() => Promise<string | null>) | null,
  getUserId: (() => string | null) | null = null,
  getTokenFresh: (() => Promise<string | null>) | null = null,
): void {
  tokenGetter = getToken;
  userIdGetter = getUserId;
  tokenRefreshGetter = getTokenFresh;
}

export async function getClerkToken(): Promise<string | null> {
  if (tokenGetter) {
    try {
      return await tokenGetter();
    } catch (err) {
      console.warn('[clerk] token bridge error:', err);
      return null;
    }
  }
  try {
    const clerk = getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY });
    return (await clerk.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}

export async function getClerkTokenFresh(): Promise<string | null> {
  if (tokenRefreshGetter) {
    try {
      return await tokenRefreshGetter();
    } catch (err) {
      console.warn('[clerk] force-refresh token error:', err);
      return null;
    }
  }
  try {
    const clerk = getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY });
    return (await clerk.session?.getToken({ skipCache: true })) ?? null;
  } catch {
    return null;
  }
}

export function getClerkUserId(): string | null {
  if (userIdGetter) {
    try {
      return userIdGetter();
    } catch {
      return null;
    }
  }
  try {
    return getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY }).user?.id ?? null;
  } catch {
    return null;
  }
}
