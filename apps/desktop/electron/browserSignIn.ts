import { createHash, randomBytes } from 'node:crypto';
import { shell } from 'electron';
import {
  DESKTOP_SIGN_IN_COMPLETE_PATH,
  DESKTOP_SIGN_IN_PATH,
  isDesktopSignInLink,
  readDesktopSignInCode,
} from '@agiworkforce/local-runtime-contract';
import { CLOUD_APP_ORIGIN } from './config';

const PENDING_SIGN_IN_TTL_MS = 10 * 60_000;

let pending: { verifier: string; startedAtMs: number } | null = null;

export type BrowserSignInLink =
  { kind: 'not-sign-in' } | { kind: 'stale' } | { kind: 'complete'; url: string };

export async function startBrowserSignIn(): Promise<{ started: true }> {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier, 'utf8').digest('base64url');
  pending = { verifier, startedAtMs: Date.now() };
  const url = new URL(DESKTOP_SIGN_IN_PATH, CLOUD_APP_ORIGIN);
  url.searchParams.set('challenge', challenge);
  await shell.openExternal(url.toString());
  return { started: true };
}

export function readBrowserSignInLink(link: string): BrowserSignInLink {
  if (!isDesktopSignInLink(link)) return { kind: 'not-sign-in' };
  const code = readDesktopSignInCode(link);
  const started = pending;
  if (!code || !started || Date.now() - started.startedAtMs > PENDING_SIGN_IN_TTL_MS) {
    return { kind: 'stale' };
  }
  const url = new URL(DESKTOP_SIGN_IN_COMPLETE_PATH, CLOUD_APP_ORIGIN);
  url.hash = new URLSearchParams({ code, verifier: started.verifier }).toString();
  return { kind: 'complete', url: url.toString() };
}
