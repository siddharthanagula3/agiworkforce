'use client';

import { useAuth, useClerk, useSignUp, useUser } from '@clerk/nextjs';
import { useCallback, useMemo } from 'react';
import { getHostBridge } from '@agiworkforce/local-runtime-contract';
import { isAuthPath } from '@agiworkforce/types/product-routes';
import { AUTH_LOGIN_PATH } from '@/features/auth/authRoutes';
import { browserSupportsPasskeys } from '@/lib/identity/passkey-support';

/**
 * The browser half of the identity port. Components take the session, the
 * current account and sign-out from here in this product's own shapes, so a
 * provider swap replaces this file rather than every component that asks who
 * is signed in.
 */
export interface IdentitySessionState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
}

export interface IdentityCurrentUser {
  id: string;
  email: string | null;
  emails: readonly string[];
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  username: string | null;
  imageUrl: string | null;
  publicMetadata: Readonly<Record<string, unknown>>;
}

export interface IdentityCurrentUserState {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: IdentityCurrentUser | null;
}

export interface IdentitySignOutOptions {
  redirectUrl?: string;
  sessionId?: string;
}

export type IdentitySignOut = (options?: IdentitySignOutOptions) => Promise<void>;

function optional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function useSession(): IdentitySessionState {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const readToken = useCallback(async () => (await getToken()) ?? null, [getToken]);
  return {
    isLoaded,
    isSignedIn: isSignedIn === true,
    userId: userId ?? null,
    getToken: readToken,
  };
}

export function useCompletedSignUpForCurrentSession(): {
  isLoaded: boolean;
  isCurrentSession: boolean;
} {
  const { isLoaded: authLoaded, userId, sessionId } = useAuth();
  const { fetchStatus, signUp } = useSignUp();
  const isLoaded = authLoaded && fetchStatus === 'idle';
  return {
    isLoaded,
    isCurrentSession:
      isLoaded &&
      signUp.status === 'complete' &&
      typeof signUp.legalAcceptedAt === 'number' &&
      signUp.legalAcceptedAt > 0 &&
      userId !== null &&
      sessionId !== null &&
      signUp.createdUserId === userId &&
      signUp.createdSessionId === sessionId,
  };
}

export function useCurrentUser(): IdentityCurrentUserState {
  const { isLoaded, isSignedIn, user } = useUser();
  const mapped = useMemo<IdentityCurrentUser | null>(() => {
    if (!user) return null;
    return {
      id: user.id,
      email: optional(user.primaryEmailAddress?.emailAddress),
      emails: (user.emailAddresses ?? []).map((address) => address.emailAddress).filter(Boolean),
      firstName: optional(user.firstName),
      lastName: optional(user.lastName),
      fullName: optional(user.fullName),
      username: optional(user.username),
      imageUrl: optional(user.imageUrl),
      publicMetadata: (user.publicMetadata ?? {}) as Readonly<Record<string, unknown>>,
    };
  }, [user]);

  return { isLoaded, isSignedIn: isSignedIn === true, user: mapped };
}

/**
 * Where a sign-out lands.
 *
 * In a browser the caller's choice stands. The desktop shell holds the product
 * and the sign-in flow and hands the rest of the site to the browser, so a
 * hosted sign-out aimed at the marketing home would open a browser window and
 * leave the app sitting on the screen the user just signed out of. Every
 * destination that is not part of signing in becomes the sign-in route there.
 */
export function signedOutRedirectUrl(
  redirectUrl: string | undefined,
  hosted: boolean,
): string | undefined {
  if (!hosted) return redirectUrl;
  if (redirectUrl === undefined || !redirectUrl.startsWith('/')) return AUTH_LOGIN_PATH;
  return isAuthPath(redirectUrl) ? redirectUrl : AUTH_LOGIN_PATH;
}

export function useSignOut(): IdentitySignOut {
  const { signOut } = useClerk();
  return useCallback(
    async (options?: IdentitySignOutOptions) => {
      const redirectUrl = signedOutRedirectUrl(options?.redirectUrl, getHostBridge() !== null);
      await signOut(redirectUrl === undefined ? options : { ...options, redirectUrl });
    },
    [signOut],
  );
}

export interface IdentityPasskey {
  id: string;
  name: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface IdentityPasskeysState {
  isLoaded: boolean;
  isSupported: boolean;
  passkeys: readonly IdentityPasskey[];
  create: () => Promise<void>;
  remove: (passkeyId: string) => Promise<void>;
}

export function usePasskeys(): IdentityPasskeysState {
  const { isLoaded, user } = useUser();
  const passkeys = useMemo<IdentityPasskey[]>(
    () =>
      (user?.passkeys ?? []).map((passkey) => ({
        id: passkey.id,
        name: optional(passkey.name),
        createdAt: passkey.createdAt,
        lastUsedAt: passkey.lastUsedAt,
      })),
    [user],
  );

  const create = useCallback(async () => {
    if (!user) throw new Error('Sign in again to add a passkey.');
    await user.createPasskey();
    await user.reload();
  }, [user]);

  const remove = useCallback(
    async (passkeyId: string) => {
      const passkey = user?.passkeys.find((candidate) => candidate.id === passkeyId);
      if (!user || !passkey) return;
      await passkey.delete();
      await user.reload();
    },
    [user],
  );

  return { isLoaded, isSupported: browserSupportsPasskeys(), passkeys, create, remove };
}
