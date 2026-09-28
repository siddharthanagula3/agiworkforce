import { createHash, randomBytes } from 'node:crypto';
import { shell } from 'electron';
import {
  DESKTOP_SIGN_IN_COMPLETE_PATH,
  DESKTOP_SIGN_IN_PATH,
  isDesktopSignInLink,
  readDesktopSignInChallenge,
  readDesktopSignInCode,
} from '@agiworkforce/local-runtime-contract';
import { CLOUD_APP_ORIGIN } from './config';

const PENDING_SIGN_IN_TTL_MS = 10 * 60_000;
const LEGACY_SIGN_IN_ROUTE = 'sso-callback';

let pending: { verifier: string; challenge: string; startedAtMs: number } | null = null;

export type BrowserSignInLink =
  | { kind: 'not-sign-in' }
  | { kind: 'ignored' }
  | { kind: 'expired' }
  | { kind: 'complete'; url: string };

export async function startBrowserSignIn(): Promise<{ started: true }> {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier, 'utf8').digest('base64url');
  pending = { verifier, challenge, startedAtMs: Date.now() };
  const url = new URL(DESKTOP_SIGN_IN_PATH, CLOUD_APP_ORIGIN);
  url.searchParams.set('challenge', challenge);
  await shell.openExternal(url.toString());
  return { started: true };
}

function isLegacySignInLink(link: string): boolean {
  try {
    const parsed = new URL(link);
    return `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '') === LEGACY_SIGN_IN_ROUTE;
  } catch {
    return false;
  }
}

export function readBrowserSignInLink(link: string): BrowserSignInLink {
  const legacy = isLegacySignInLink(link);
  if (!legacy && !isDesktopSignInLink(link)) return { kind: 'not-sign-in' };
  const started = pending;
  if (started === null) return { kind: 'expired' };
  if (legacy || readDesktopSignInChallenge(link) !== started.challenge) return { kind: 'ignored' };
  pending = null;
  const code = readDesktopSignInCode(link);
  if (!code || Date.now() - started.startedAtMs > PENDING_SIGN_IN_TTL_MS) {
    return { kind: 'expired' };
  }
  const url = new URL(DESKTOP_SIGN_IN_COMPLETE_PATH, CLOUD_APP_ORIGIN);
  url.hash = new URLSearchParams({ code, verifier: started.verifier }).toString();
  return { kind: 'complete', url: url.toString() };
}
