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
import type { RequestAuthority, SessionAuthority } from './request-authority';
import { bindNativeSession, nativeSessionFor } from './native-session-authority';
import { browserSupportsPasskeys } from '@/lib/identity/passkey-support';

/**
 * The browser half of the identity port. Components take the session, the
 * current account and sign-out from here in this product's own shapes, so a
 * provider swap replaces this file rather than every component that asks who
 * is signed in.
 */
export type NativeIdentitySession = NonNullable<ReturnType<typeof useClerk>['session']>;

export interface IdentitySessionState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  sessionId: string | null;
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
  const { isLoaded, isSignedIn, userId, sessionId, getToken } = useAuth();
  const readToken = useCallback(async () => (await getToken()) ?? null, [getToken]);
  return {
    isLoaded,
    isSignedIn: isSignedIn === true,
    userId: userId ?? null,
    sessionId: sessionId ?? null,
    getToken: readToken,
  };
}

export function useProviderAuth() {
  return useAuth();
}

export function useProviderClerk() {
  return useClerk();
}

type NativeClerkSession = NonNullable<ReturnType<typeof useClerk>['session']>;

export function nativeClerkSession(authority: RequestAuthority): NativeClerkSession {
  return nativeSessionFor<NativeClerkSession>(authority.session);
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
      if (options?.sessionId === undefined) {
        try {
          const { disableWebPush } = await import('@/features/notifications/lib/web-push-client');
          await disableWebPush();
        } catch {
          // Leaving the browser registered must not keep the person signed in.
        }
      }
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

export const MAX_PASSKEY_NAME_CHARS = 50;

export interface IdentityPasskeyOperation {
  isCurrent: () => boolean;
  execute: (name?: string) => Promise<void>;
}

export interface IdentityPasskeyScope {
  authority: RequestAuthority;
  onDispatch: () => void;
}

export interface IdentityPasskeysState {
  isCurrent: () => boolean;
  isLoaded: boolean;
  isSupported: boolean;
  passkeys: readonly IdentityPasskey[];
  capture: (
    kind: 'create' | 'rename' | 'remove',
    scope: IdentityPasskeyScope,
    passkeyId?: string,
  ) => IdentityPasskeyOperation;
}

export function usePasskeys(): IdentityPasskeysState {
  const { isLoaded: userLoaded, user } = useUser();
  const clerk = useClerk();
  const isLoaded = Boolean(
    userLoaded && clerk.loaded && user && clerk.user === user && clerk.session?.user === user,
  );
  const passkeys: IdentityPasskey[] = isLoaded
    ? (user?.passkeys ?? []).map((passkey) => ({
        id: passkey.id,
        name: optional(passkey.name),
        createdAt: passkey.createdAt,
        lastUsedAt: passkey.lastUsedAt,
      }))
    : [];
  const capture = useCallback<IdentityPasskeysState['capture']>(
    (kind, submitted, passkeyId) => {
      const { authority, onDispatch } = submitted;
      authority.assertCurrent();
      const session = nativeClerkSession(authority);
      const capturedUser = session.user;
      if (
        !isLoaded ||
        !capturedUser ||
        capturedUser !== user ||
        capturedUser.id !== authority.session.userId
      ) {
        throw new Error('The account changed. Open passkey settings again.');
      }
      const target =
        kind === 'create' ? null : capturedUser.passkeys.find((key) => key.id === passkeyId);
      if (kind !== 'create' && !target)
        throw new Error('That passkey is no longer on this account.');
      const assertCurrent = () => {
        if (
          session.user !== capturedUser ||
          clerk.user !== capturedUser ||
          capturedUser.id !== authority.session.userId
        )
          authority.retire();
        authority.assertCurrent();
      };
      let dispatched = false;
      let stop: (() => void) | undefined;
      const release = () => {
        stop?.();
        stop = undefined;
      };
      const observe = () => {
        if (
          !authority.isCurrent() ||
          session.user !== capturedUser ||
          clerk.user !== capturedUser ||
          (!dispatched &&
            target &&
            !capturedUser.passkeys.some((key) => key === target && key.id === passkeyId))
        )
          authority.retire();
      };
      authority.signal.addEventListener('abort', release, { once: true });
      stop = authority.session.subscribe?.(observe);
      if (authority.signal.aborted) release();
      return {
        isCurrent: () => {
          observe();
          return authority.isCurrent();
        },
        execute: async (name) => {
          assertCurrent();
          if (dispatched) throw new Error('This passkey operation has already started.');
          if (
            target &&
            !capturedUser.passkeys.some((key) => key === target && key.id === passkeyId)
          ) {
            throw new Error('That passkey is no longer on this account.');
          }
          const submittedName = name?.trim();
          if (
            kind === 'rename' &&
            (!submittedName || submittedName.length > MAX_PASSKEY_NAME_CHARS)
          ) {
            throw new Error(`Enter a passkey name of 1 to ${MAX_PASSKEY_NAME_CHARS} characters.`);
          }
          assertCurrent();
          dispatched = true;
          onDispatch();
          assertCurrent();
          try {
            if (kind === 'create') await capturedUser.createPasskey();
            else if (kind === 'rename' && target) await target.update({ name: submittedName! });
            else if (target) await target.delete();
            assertCurrent();
            const refreshed = await capturedUser.reload();
            assertCurrent();
            if (refreshed.id !== authority.session.userId) {
              authority.retire();
              throw new Error('The refreshed account could not be confirmed.');
            }
          } catch (cause) {
            assertCurrent();
            throw cause;
          }
        },
      };
    },
    [clerk, isLoaded, user],
  );
  return {
    isCurrent: () =>
      Boolean(isLoaded && clerk.loaded && clerk.user === user && clerk.session?.user === user),
    isLoaded,
    isSupported: browserSupportsPasskeys(),
    passkeys,
    capture,
  };
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
  isCurrent: () => boolean;
  capture: (
    selection:
      | { kind: 'connect'; provider: AuthProviderId; returnUrl: string }
      | { kind: 'disconnect'; accountId: string },
    scope: IdentityPasskeyScope,
  ) => IdentityPasskeyOperation;
}

const VERIFIED_EMAIL_STATUS = 'verified';

export const UNCONFIRMED_EMAIL_CONNECT_MESSAGE =
  'Confirm your email address before you connect another way to sign in.';

const CONNECT_STRATEGIES = {
  google: 'oauth_google',
  github: 'oauth_github',
  microsoft: 'oauth_microsoft',
  apple: 'oauth_apple',
} as const satisfies Readonly<Record<AuthProviderId, string>>;

export function useConnectedAccounts(): IdentityConnectedAccountsState {
  const { isLoaded: userLoaded, user } = useUser();
  const clerk = useClerk();
  const isCurrent = () =>
    Boolean(
      userLoaded && clerk.loaded && user && clerk.user === user && clerk.session?.user === user,
    );
  const isLoaded = isCurrent();
  const accounts: IdentityConnectedAccount[] = (isLoaded ? (user?.externalAccounts ?? []) : []).map(
    (account) => ({
      id: account.id,
      provider: account.provider,
      email: optional(account.emailAddress),
    }),
  );
  const capture = useCallback<IdentityConnectedAccountsState['capture']>(
    (selection, { authority, onDispatch }) => {
      authority.assertCurrent();
      const native = nativeClerkSession(authority);
      const capturedUser = native.user;
      if (
        !isLoaded ||
        !capturedUser ||
        capturedUser !== user ||
        clerk.user !== user ||
        capturedUser.id !== authority.session.userId
      ) {
        throw new Error('The account changed. Open sign-in settings again.');
      }
      const submitted = { ...selection };
      const targets =
        submitted.kind === 'disconnect'
          ? capturedUser.externalAccounts.filter((account) => account.id === submitted.accountId)
          : [];
      const target = targets[0] ?? null;
      if (submitted.kind === 'disconnect' && targets.length !== 1)
        throw new Error('That account is no longer uniquely connected.');
      let dispatched = false;
      const observe = () => {
        if (
          native.user !== capturedUser ||
          clerk.user !== capturedUser ||
          capturedUser.id !== authority.session.userId ||
          (!dispatched &&
            target &&
            submitted.kind === 'disconnect' &&
            (target.id !== submitted.accountId ||
              !capturedUser.externalAccounts.includes(target) ||
              capturedUser.externalAccounts.filter((account) => account.id === submitted.accountId)
                .length !== 1))
        )
          authority.retire();
        return authority.isCurrent();
      };
      const assertCurrent = () => {
        observe();
        authority.assertCurrent();
      };
      let stop: (() => void) | undefined;
      const release = () => {
        stop?.();
        stop = undefined;
      };
      authority.signal.addEventListener('abort', release, { once: true });
      stop = authority.session.subscribe?.(observe);
      if (authority.signal.aborted) release();
      return {
        isCurrent: observe,
        execute: async () => {
          assertCurrent();
          if (dispatched) throw new Error('This sign-in change has already started.');
          if (
            submitted.kind === 'connect' &&
            capturedUser.primaryEmailAddress?.verification?.status !== VERIFIED_EMAIL_STATUS
          ) {
            throw new Error(UNCONFIRMED_EMAIL_CONNECT_MESSAGE);
          }
          dispatched = true;
          onDispatch();
          assertCurrent();
          try {
            if (submitted.kind === 'connect') {
              const account = await capturedUser.createExternalAccount({
                strategy: CONNECT_STRATEGIES[submitted.provider],
                redirectUrl: submitted.returnUrl,
              });
              assertCurrent();
              const next = account.verification?.externalVerificationRedirectURL;
              if (!next) throw new Error('The sign-in provider did not start.');
              const destination = next.toString();
              assertCurrent();
              window.location.assign(destination);
            } else if (target) {
              await target.destroy();
              assertCurrent();
              const refreshed = await capturedUser.reload();
              assertCurrent();
              if (refreshed.id !== capturedUser.id)
                throw new Error('The refreshed account could not be confirmed.');
            }
          } catch (cause) {
            assertCurrent();
            throw cause;
          }
        },
      };
    },
    [clerk, isLoaded, user],
  );
  return { isLoaded, accounts, isCurrent, capture };
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

export function useSessionReverification(authority?: RequestAuthority): IdentityReverification {
  const { session } = useProviderSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const activeSession = useCallback(() => {
    authority?.assertCurrent();
    const current = authority ? nativeClerkSession(authority) : sessionRef.current;
    if (!current) throw new Error('You are signed out. Sign in again to continue.');
    return current;
  }, [authority]);

  const checked = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      authority?.assertCurrent();
      const result = await operation();
      authority?.assertCurrent();
      return result;
    },
    [authority],
  );

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
      start: (level: IdentityVerificationLevel) => checked(() => start(level)),
      sendEmailCode: (factor: IdentityEmailCodeFactor) => checked(() => sendEmailCode(factor)),
      verifyPassword: (password: string) => checked(() => verifyPassword(password)),
      verifyEmailCode: (code: string) => checked(() => verifyEmailCode(code)),
      verifyPasskey: () => checked(verifyPasskey),
      verifySecondFactor: (method: IdentitySecondFactorMethod, code: string) =>
        checked(() => verifySecondFactor(method, code)),
      freshToken: () => checked(freshToken),
    }),
    [
      checked,
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

export interface EmailAddressVerificationScope {
  readonly authority: RequestAuthority;
  readonly emailAddress: string;
  readonly onDispatch?: () => void;
}

export interface IdentityEmailAddressVerification {
  sendCode: (emailAddressId: string, scope: EmailAddressVerificationScope) => Promise<void>;
  verifyCode: (
    emailAddressId: string,
    code: string,
    scope: EmailAddressVerificationScope,
  ) => Promise<void>;
  requireVerified: (emailAddressId: string, scope: EmailAddressVerificationScope) => Promise<void>;
  refresh: (authority: RequestAuthority) => Promise<void>;
}

export function useEmailAddressVerification(): IdentityEmailAddressVerification {
  return useMemo<IdentityEmailAddressVerification>(() => {
    type NativeUser = NonNullable<NativeClerkSession['user']>;
    const owned = async <T>(
      authority: RequestAuthority,
      work: (user: NativeUser, assertCurrent: () => void) => Promise<T>,
    ): Promise<T> => {
      authority.assertCurrent();
      const session = nativeClerkSession(authority);
      const user = session.user;
      if (!user || user.id !== authority.session.userId) {
        authority.retire();
        authority.assertCurrent();
        throw new Error('You are signed out. Sign in again to continue.');
      }
      const observe = () => {
        if (
          !authority.isCurrent() ||
          session.user !== user ||
          user.id !== authority.session.userId
        ) {
          authority.retire();
        }
      };
      const assertCurrent = () => {
        observe();
        authority.assertCurrent();
      };
      let stop: (() => void) | undefined;
      const release = () => {
        stop?.();
        stop = undefined;
      };
      authority.signal.addEventListener('abort', release, { once: true });
      stop = authority.session.subscribe?.(observe);
      if (authority.signal.aborted) release();
      try {
        assertCurrent();
        const result = await work(user, assertCurrent);
        assertCurrent();
        return result;
      } finally {
        release();
        authority.signal.removeEventListener('abort', release);
      }
    };
    const matches = (
      address: { id: string; emailAddress: string } | null | undefined,
      emailAddressId: string,
      scope: EmailAddressVerificationScope,
    ) =>
      address?.id === emailAddressId &&
      address.emailAddress.trim().toLowerCase() === scope.emailAddress.trim().toLowerCase();
    const pendingAddress = async (
      user: NativeUser,
      assertCurrent: () => void,
      emailAddressId: string,
      scope: EmailAddressVerificationScope,
    ) => {
      assertCurrent();
      const reloaded = await user.reload();
      assertCurrent();
      if (reloaded.id !== scope.authority.session.userId)
        throw new Error('The account changed. Start again.');
      const address = reloaded.emailAddresses.find((candidate) => candidate.id === emailAddressId);
      if (!address || !matches(address, emailAddressId, scope)) {
        throw new Error('That address is no longer on your account. Start again.');
      }
      return address;
    };
    return {
      sendCode: (emailAddressId, submitted) => {
        const scope = { ...submitted };
        return owned(scope.authority, async (user, assertCurrent) => {
          const address = await pendingAddress(user, assertCurrent, emailAddressId, scope);
          assertCurrent();
          scope.onDispatch?.();
          assertCurrent();
          const prepared = await address.prepareVerification({ strategy: 'email_code' });
          assertCurrent();
          if (!matches(prepared, emailAddressId, scope))
            throw new Error('The code delivery could not be confirmed.');
        });
      },
      verifyCode: (emailAddressId, code, submitted) => {
        const scope = { ...submitted };
        return owned(scope.authority, async (user, assertCurrent) => {
          const address = await pendingAddress(user, assertCurrent, emailAddressId, scope);
          assertCurrent();
          scope.onDispatch?.();
          assertCurrent();
          const verified = await address.attemptVerification({ code });
          assertCurrent();
          if (
            !matches(verified, emailAddressId, scope) ||
            verified.verification?.status !== 'verified'
          ) {
            throw new Error('The email address verification could not be confirmed.');
          }
        });
      },
      requireVerified: (emailAddressId, submitted) => {
        const scope = { ...submitted };
        return owned(scope.authority, async (user, assertCurrent) => {
          const address = await pendingAddress(user, assertCurrent, emailAddressId, scope);
          if (address.verification?.status !== 'verified')
            throw new Error(
              'That email address is not currently verified. Close this dialog and start again.',
            );
        });
      },
      refresh: (authority) =>
        owned(authority, async (user, assertCurrent) => {
          const reloaded = await user.reload();
          assertCurrent();
          if (reloaded.id !== authority.session.userId)
            throw new Error('The account changed. Start again.');
        }),
    };
  }, []);
}

export type IdentitySessionSnapshot = SessionAuthority;

function useIdentityObservation() {
  const clerk = useClerk();
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const current = useRef({ clerk, isLoaded, isSignedIn, userId, sessionId });
  const generation = useRef(0);
  const renderedIdentity = `${isLoaded}:${isSignedIn}:${userId}:${sessionId}`;
  const observed = useRef({
    clerk,
    loaded: clerk.loaded,
    session: clerk.session,
    sessionId: clerk.session?.id,
    sessionUserId: clerk.session?.user?.id,
    userId: clerk.user?.id,
    renderedIdentity,
  });
  const observe = useCallback(() => {
    const sdk = current.current.clerk;
    const previous = observed.current;
    const rendered = current.current;
    const identity = `${rendered.isLoaded}:${rendered.isSignedIn}:${rendered.userId}:${rendered.sessionId}`;
    if (
      previous.clerk !== sdk ||
      previous.loaded !== sdk.loaded ||
      previous.session !== sdk.session ||
      previous.sessionId !== sdk.session?.id ||
      previous.sessionUserId !== sdk.session?.user?.id ||
      previous.userId !== sdk.user?.id ||
      previous.renderedIdentity !== identity
    ) {
      generation.current += 1;
      observed.current = {
        clerk: sdk,
        loaded: sdk.loaded,
        session: sdk.session,
        sessionId: sdk.session?.id,
        sessionUserId: sdk.session?.user?.id,
        userId: sdk.user?.id,
        renderedIdentity: identity,
      };
    }
  }, []);
  current.current = { clerk, isLoaded, isSignedIn, userId, sessionId };
  observe();
  return { current, generation, observe };
}

export function useReadonlyIdentityLifetime(): () => { isCurrent: () => boolean } {
  const { generation, observe } = useIdentityObservation();
  return useCallback(() => {
    observe();
    const capturedGeneration = generation.current;
    let retired = false;
    return {
      isCurrent: () => {
        observe();
        if (generation.current !== capturedGeneration) retired = true;
        return !retired;
      },
    };
  }, [generation, observe]);
}

export function useSessionSnapshot(): () => IdentitySessionSnapshot | null {
  const { current, generation, observe } = useIdentityObservation();
  return useCallback(() => {
    const rendered = current.current;
    const sdk = rendered.clerk;
    const session = sdk.session;
    const ownerId = rendered.userId;
    const incarnation = rendered.sessionId;
    const capturedGeneration = generation.current;
    let retired = false;
    const isCurrent = () => {
      observe();
      const latest = current.current;
      const matches = Boolean(
        capturedGeneration === generation.current &&
        ownerId &&
        incarnation &&
        session &&
        latest.clerk === sdk &&
        latest.isLoaded &&
        latest.isSignedIn === true &&
        latest.userId === ownerId &&
        latest.sessionId === incarnation &&
        sdk.loaded &&
        sdk.session === session &&
        session.id === incarnation &&
        sdk.user?.id === ownerId &&
        session.user?.id === ownerId,
      );
      if (!matches) retired = true;
      return !retired;
    };
    if (!isCurrent() || !ownerId || !incarnation || !session) return null;
    const snapshot: SessionAuthority = {
      userId: ownerId,
      sessionId: incarnation,
      isCurrent,
      subscribe: (listener) => sdk.addListener(() => listener()),
      getToken: async (options) => {
        if (!isCurrent()) return null;
        const token = await (options === undefined
          ? session.getToken()
          : session.getToken(options));
        return isCurrent() ? token : null;
      },
    };
    bindNativeSession(snapshot, session);
    return snapshot;
  }, [current, generation, observe]);
}
