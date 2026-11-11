import { MOBILE_SESSION_TOKEN_TEMPLATE } from '@agiworkforce/types';
import { getClerkInstance } from '@clerk/expo';

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

export const CLERK_PUBLISHABLE_KEY = configuredPublishableKey ?? '';

export const CLERK_NATIVE_AUTH_OPTIONS = {
  treatPendingAsSignedOut: false,
} as const;

/**
 * Clerk never reports loaded when its environment call fails (an offline
 * launch, a disabled instance), so nothing may wait on it for longer than this.
 */
export const CLERK_LOAD_SETTLE_MS = 8_000;

type TokenMinter = (options?: { template?: string; skipCache?: boolean }) => Promise<string | null>;

let tokenMinter: TokenMinter | null = null;
let userIdGetter: (() => string | null) | null = null;
let unansweredSession: { answered: Promise<void>; answer: () => void } | null = null;

/**
 * A request minted before Clerk has loaded leaves without a credential and is
 * refused, which reads as an expired session. Callers wait for Clerk's answer
 * instead, signed in or signed out, bounded by the settle window.
 */
export function holdTokensUntilClerkAnswers(): void {
  if (unansweredSession || tokenMinter) return;
  let answer = (): void => undefined;
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  unansweredSession = { answered, answer };
}

function releaseHeldTokens(): void {
  unansweredSession?.answer();
  unansweredSession = null;
}

async function clerkAnswer(): Promise<void> {
  const held = unansweredSession;
  if (!held) return;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      held.answered,
      new Promise<void>((resolve) => {
        deadline = setTimeout(resolve, CLERK_LOAD_SETTLE_MS);
      }),
    ]);
  } finally {
    if (deadline !== undefined) clearTimeout(deadline);
  }
  if (unansweredSession === held) releaseHeldTokens();
}

export function setClerkTokenMinter(
  mint: TokenMinter | null,
  getUserId: (() => string | null) | null = null,
): void {
  tokenMinter = mint;
  userIdGetter = getUserId;
  releaseHeldTokens();
}

let templateMissingWarned = false;

/** A native token has no origin; only the Clerk-signed mobile template binds its surface. */
export async function getSurfaceToken(
  mint: TokenMinter,
  options: { skipCache?: boolean } = {},
): Promise<string | null> {
  try {
    return await mint({ template: MOBILE_SESSION_TOKEN_TEMPLATE, ...options });
  } catch (err) {
    if (!templateMissingWarned) {
      templateMissingWarned = true;
      console.warn(
        `[clerk] could not mint a ${MOBILE_SESSION_TOKEN_TEMPLATE} token; Managed Cloud remains locked`,
        err,
      );
    }
    return null;
  }
}

/**
 * Clerk leaves `sid` out of template tokens, so the bearer is the session token
 * and the template token travels beside it as the surface proof. Without that
 * proof the server cannot bind the phone, so no bearer is handed out either.
 */
export async function getSessionToken(
  mint: TokenMinter,
  options: { skipCache?: boolean } = {},
): Promise<string | null> {
  if (!(await getSurfaceToken(mint, options))) return null;
  return mint(options.skipCache ? { skipCache: true } : undefined);
}

function currentMinter(): TokenMinter | null {
  if (tokenMinter) return tokenMinter;
  try {
    const session = getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY }).session;
    return session ? (options) => session.getToken(options) : null;
  } catch {
    return null;
  }
}

async function mintWith(
  read: (mint: TokenMinter) => Promise<string | null>,
): Promise<string | null> {
  await clerkAnswer();
  const mint = currentMinter();
  if (!mint) return null;
  try {
    return await read(mint);
  } catch (err) {
    console.warn('[clerk] token bridge error:', err);
    return null;
  }
}

export function getClerkToken(): Promise<string | null> {
  return mintWith((mint) => getSessionToken(mint));
}

export function getClerkTokenFresh(): Promise<string | null> {
  return mintWith((mint) => getSessionToken(mint, { skipCache: true }));
}

export function getClerkSurfaceToken(): Promise<string | null> {
  return mintWith((mint) => getSurfaceToken(mint));
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
