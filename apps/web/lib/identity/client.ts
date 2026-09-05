'use client';

import { useAuth, useClerk, useUser } from '@clerk/nextjs';
import { useCallback, useMemo } from 'react';

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

export function useSignOut(): IdentitySignOut {
  const { signOut } = useClerk();
  return useCallback(
    async (options?: IdentitySignOutOptions) => {
      await signOut(options);
    },
    [signOut],
  );
}
