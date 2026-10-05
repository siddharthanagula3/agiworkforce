'use client';

import {
  useAuth,
  useClerk,
  useSession as useProviderSession,
  useSignUp,
  useUser,
} from '@clerk/nextjs';
import type { SessionVerificationResource } from '@clerk/nextjs/types';
import { useCallback, useMemo, useRef } from 'react';
import type { AuthProviderId } from '@agiworkforce/client-runtime';
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
  hasPassword: boolean;
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
  createdThisSession: boolean;
} {
  const { isLoaded: authLoaded, userId, sessionId } = useAuth();
  const { fetchStatus, signUp } = useSignUp();
  const isLoaded = authLoaded && fetchStatus === 'idle';
  return {
    isLoaded,
    createdThisSession:
      isLoaded &&
      signUp.status === 'complete' &&
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
      hasPassword: user.passwordEnabled === true,
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
  rename: (passkeyId: string, name: string) => Promise<void>;
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

  const rename = useCallback(
    async (passkeyId: string, name: string) => {
      const passkey = user?.passkeys.find((candidate) => candidate.id === passkeyId);
      if (!user || !passkey) throw new Error('That passkey is no longer on this account.');
      await passkey.update({ name });
      await user.reload();
    },
    [user],
  );

  const remove = useCallback(
    async (passkeyId: string) => {
      const passkey = user?.passkeys.find((candidate) => candidate.id === passkeyId);
      if (!user || !passkey) return;
      await passkey.delete();
      await user.reload();
    },
    [user],
  );

  return { isLoaded, isSupported: browserSupportsPasskeys(), passkeys, create, rename, remove };
}

export type IdentityVerificationLevel = 'first_factor' | 'second_factor';

export type IdentitySecondFactorMethod = 'authenticator' | 'backup_code';

export interface IdentityEmailCodeFactor {
  emailAddressId: string;
  destination: string | null;
}

export type IdentityReverificationStep =
  | { kind: 'complete' }
  | { kind: 'second_factor'; methods: readonly IdentitySecondFactorMethod[] }
  | {
      kind: 'first_factor';
      password: boolean;
      passkey: boolean;
      emailCode: IdentityEmailCodeFactor | null;
    }
  | { kind: 'unavailable' };

export interface IdentityReverification {
  start: (level: IdentityVerificationLevel) => Promise<IdentityReverificationStep>;
  sendEmailCode: (factor: IdentityEmailCodeFactor) => Promise<void>;
  verifyPassword: (password: string) => Promise<IdentityReverificationStep>;
  verifyEmailCode: (code: string) => Promise<IdentityReverificationStep>;
  verifyPasskey: () => Promise<IdentityReverificationStep>;
  verifySecondFactor: (
    method: IdentitySecondFactorMethod,
    code: string,
  ) => Promise<IdentityReverificationStep>;
  freshToken: () => Promise<string | null>;
}

const REVERIFICATION_SECOND_FACTORS: Readonly<Record<string, IdentitySecondFactorMethod>> = {
  totp: 'authenticator',
  backup_code: 'backup_code',
};

const SECOND_FACTOR_STRATEGIES: Readonly<
  Record<IdentitySecondFactorMethod, 'totp' | 'backup_code'>
> = {
  authenticator: 'totp',
  backup_code: 'backup_code',
};

function reverificationStep(verification: SessionVerificationResource): IdentityReverificationStep {
  if (verification.status === 'complete') return { kind: 'complete' };

  if (verification.status === 'needs_second_factor') {
    const methods = [
      ...new Set(
        (verification.supportedSecondFactors ?? [])
          .map((factor) => REVERIFICATION_SECOND_FACTORS[factor.strategy])
          .filter((method): method is IdentitySecondFactorMethod => method !== undefined),
      ),
    ];
    return methods.length > 0 ? { kind: 'second_factor', methods } : { kind: 'unavailable' };
  }

  const factors = verification.supportedFirstFactors ?? [];
  const email = factors.find((factor) => factor.strategy === 'email_code');
  const emailCode =
    email && 'emailAddressId' in email
      ? { emailAddressId: email.emailAddressId, destination: optional(email.safeIdentifier) }
      : null;
  const password = factors.some((factor) => factor.strategy === 'password');
  const passkey =
    factors.some((factor) => factor.strategy === 'passkey') && browserSupportsPasskeys();
  if (!password && !passkey && !emailCode) return { kind: 'unavailable' };
  return { kind: 'first_factor', password, passkey, emailCode };
}

export interface IdentityConnectedAccount {
  id: string;
  provider: string;
  email: string | null;
}

export interface IdentityConnectedAccountsState {
  isLoaded: boolean;
  accounts: readonly IdentityConnectedAccount[];
  connect: (provider: AuthProviderId, returnUrl: string) => Promise<void>;
  disconnect: (accountId: string) => Promise<void>;
}

const CONNECT_STRATEGIES = {
  google: 'oauth_google',
  github: 'oauth_github',
  microsoft: 'oauth_microsoft',
  apple: 'oauth_apple',
} as const satisfies Readonly<Record<AuthProviderId, string>>;

export function useConnectedAccounts(): IdentityConnectedAccountsState {
  const { isLoaded, user } = useUser();
  const accounts = useMemo<IdentityConnectedAccount[]>(
    () =>
      (user?.externalAccounts ?? []).map((account) => ({
        id: account.id,
        provider: account.provider,
        email: optional(account.emailAddress),
      })),
    [user],
  );

  const connect = useCallback(
    async (provider: AuthProviderId, returnUrl: string) => {
      if (!user) throw new Error('Sign in again to connect an account.');
      const account = await user.createExternalAccount({
        strategy: CONNECT_STRATEGIES[provider],
        redirectUrl: returnUrl,
      });
      const next = account.verification?.externalVerificationRedirectURL;
      if (!next) throw new Error('The sign-in provider did not start. Try again.');
      window.location.assign(next.toString());
    },
    [user],
  );

  const disconnect = useCallback(
    async (accountId: string) => {
      const account = user?.externalAccounts.find((candidate) => candidate.id === accountId);
      if (!user || !account) return;
      await account.destroy();
      await user.reload();
    },
    [user],
  );

  return { isLoaded, accounts, connect, disconnect };
}

const EMAIL_CODE_STRATEGY = 'email_code';

export interface IdentityEmailConfirmation {
  isLoaded: boolean;
  email: string | null;
  sendCode: () => Promise<void>;
  confirm: (code: string) => Promise<void>;
  endOtherSessions: () => Promise<void>;
}

export function usePrimaryEmailConfirmation(): IdentityEmailConfirmation {
  const { isLoaded, user } = useUser();
  const { session } = useProviderSession();
  const userRef = useRef(user);
  userRef.current = user;
  const sessionIdRef = useRef(session?.id ?? null);
  sessionIdRef.current = session?.id ?? null;

  const primaryAddress = useCallback(() => {
    const address = userRef.current?.primaryEmailAddress;
    if (!address) throw new Error('This account has no email address to confirm.');
    return address;
  }, []);

  const sendCode = useCallback(async () => {
    await primaryAddress().prepareVerification({ strategy: EMAIL_CODE_STRATEGY });
  }, [primaryAddress]);

  const confirm = useCallback(
    async (code: string) => {
      await primaryAddress().attemptVerification({ code });
    },
    [primaryAddress],
  );

  const endOtherSessions = useCallback(async () => {
    const current = userRef.current;
    const currentSessionId = sessionIdRef.current;
    if (!current || !currentSessionId) {
      throw new Error('Sign in again to finish confirming your email address.');
    }
    const sessions = await current.getSessions();
    if (!sessions.some((candidate) => candidate.id === currentSessionId)) {
      throw new Error('The sessions on this account could not be read. Try again.');
    }
    await Promise.all(
      sessions
        .filter((candidate) => candidate.id !== currentSessionId)
        .map((candidate) => candidate.revoke()),
    );
  }, []);

  return {
    isLoaded,
    email: optional(user?.primaryEmailAddress?.emailAddress),
    sendCode,
    confirm,
    endOtherSessions,
  };
}

export function useSessionReverification(): IdentityReverification {
  const { session } = useProviderSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const activeSession = useCallback(() => {
    const current = sessionRef.current;
    if (!current) throw new Error('You are signed out. Sign in again to continue.');
    return current;
  }, []);

  const start = useCallback(
    async (level: IdentityVerificationLevel) =>
      reverificationStep(await activeSession().startVerification({ level })),
    [activeSession],
  );

  const sendEmailCode = useCallback(
    async ({ emailAddressId }: IdentityEmailCodeFactor) => {
      await activeSession().prepareFirstFactorVerification({
        strategy: 'email_code',
        emailAddressId,
      });
    },
    [activeSession],
  );

  const verifyPassword = useCallback(
    async (password: string) =>
      reverificationStep(
        await activeSession().attemptFirstFactorVerification({ strategy: 'password', password }),
      ),
    [activeSession],
  );

  const verifyEmailCode = useCallback(
    async (code: string) =>
      reverificationStep(
        await activeSession().attemptFirstFactorVerification({ strategy: 'email_code', code }),
      ),
    [activeSession],
  );

  const verifyPasskey = useCallback(
    async () => reverificationStep(await activeSession().verifyWithPasskey()),
    [activeSession],
  );

  const verifySecondFactor = useCallback(
    async (method: IdentitySecondFactorMethod, code: string) =>
      reverificationStep(
        await activeSession().attemptSecondFactorVerification({
          strategy: SECOND_FACTOR_STRATEGIES[method],
          code,
        }),
      ),
    [activeSession],
  );

  const freshToken = useCallback(
    async () => (await activeSession().getToken({ skipCache: true })) ?? null,
    [activeSession],
  );

  return useMemo(
    () => ({
      start,
      sendEmailCode,
      verifyPassword,
      verifyEmailCode,
      verifyPasskey,
      verifySecondFactor,
      freshToken,
    }),
    [
      start,
      sendEmailCode,
      verifyPassword,
      verifyEmailCode,
      verifyPasskey,
      verifySecondFactor,
      freshToken,
    ],
  );
}

export interface IdentityEmailAddressVerification {
  sendCode: (emailAddressId: string) => Promise<void>;
  verifyCode: (emailAddressId: string, code: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useEmailAddressVerification(): IdentityEmailAddressVerification {
  const { user } = useUser();
  const userRef = useRef(user);
  userRef.current = user;

  const pendingAddress = useCallback(async (emailAddressId: string) => {
    const current = userRef.current;
    if (!current) throw new Error('You are signed out. Sign in again to continue.');
    const reloaded = await current.reload();
    const address = reloaded.emailAddresses.find((candidate) => candidate.id === emailAddressId);
    if (!address) throw new Error('That address is no longer on your account. Start again.');
    return address;
  }, []);

  const sendCode = useCallback(
    async (emailAddressId: string) => {
      await (await pendingAddress(emailAddressId)).prepareVerification({ strategy: 'email_code' });
    },
    [pendingAddress],
  );

  const verifyCode = useCallback(
    async (emailAddressId: string, code: string) => {
      await (await pendingAddress(emailAddressId)).attemptVerification({ code });
    },
    [pendingAddress],
  );

  const refresh = useCallback(async () => {
    await userRef.current?.reload();
  }, []);

  return useMemo(() => ({ sendCode, verifyCode, refresh }), [sendCode, verifyCode, refresh]);
}
