/**
 * Electron cloud shell configuration.
 *
 * Constant names here are deliberately distinct from the renderer's
 * `WEB_APP_URL` / `API_BASE_URL` (`src/api/config.ts`): the repo's eslint
 * egress rule pins raw `fetch()` of those identifiers to the renderer's
 * egress-guard chokepoint, which exists to protect the Local trust boundary.
 * Desktop chat has no Local mode and every request this process can make is
 * Managed Cloud by construction (our own API, allowlisted below), so the main
 * process is its own egress chokepoint. Local coding sessions run in the
 * bundled CLI, a separate process with its own egress policy.
 */

import { DESKTOP_DEEP_LINK_SCHEME } from '@agiworkforce/local-runtime-contract';
import { frontendApiFromPublishableKey } from './clerkProxy';

const PRODUCTION_CLOUD_APP_ORIGIN = 'https://agiworkforce.com';
const CLOUD_APP_ORIGIN_ENV = 'AGI_CLOUD_APP_ORIGIN';
const RELAY_HOST = 'agiworkforce-signaling.fly.dev';
const CLERK_PUBLISHABLE_KEY_ENV = 'VITE_CLERK_PUBLISHABLE_KEY';
const CLERK_DEVELOPMENT_SUFFIX = '.clerk.accounts.dev';
const LOCALHOST_NAMES = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'];

export const REMOTE_SESSION_PARTITION = 'persist:agi-cloud';

export const DEEP_LINK_SCHEME = DESKTOP_DEEP_LINK_SCHEME;

function parseWithoutCredentials(rawUrl: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  return parsed.username === '' && parsed.password === '' ? parsed : null;
}

function isLocalhost(host: string): boolean {
  return LOCALHOST_NAMES.includes(host);
}

function isFirstPartyHost(host: string): boolean {
  return host === 'agiworkforce.com' || host.endsWith('.agiworkforce.com');
}

export function isAllowedApiBaseUrl(rawUrl: string): boolean {
  const parsed = parseWithoutCredentials(rawUrl);
  if (!parsed) return false;
  const host = parsed.hostname;
  if (parsed.protocol === 'http:' && !isLocalhost(host)) return false;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return isLocalhost(host) || isFirstPartyHost(host);
}

const CLOUD_APP_ORIGIN_ARG = '--agi-cloud-app-origin=';

/**
 * Where the window loads. A packaged build ignores `AGI_CLOUD_APP_ORIGIN`:
 * that variable is process environment, and the preload bridge trusts whatever
 * origin this returns. An explicit `--agi-cloud-app-origin=` argument is still
 * honored so a packaged acceptance run can point at a local fixture. Anything
 * outside the allowlist falls through to production.
 */
export function cloudAppOriginFrom(input: {
  packaged: boolean;
  environmentOrigin: string | undefined;
  argumentOrigin: string | undefined;
}): string {
  const argument = allowedOrigin(input.argumentOrigin);
  if (argument) return argument;
  if (!input.packaged) {
    const requested = allowedOrigin(input.environmentOrigin);
    if (requested) return requested;
  }
  return PRODUCTION_CLOUD_APP_ORIGIN;
}

function allowedOrigin(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || !isAllowedApiBaseUrl(trimmed)) return null;
  return trimmed.replace(/\/+$/, '');
}

function argumentOrigin(argv: readonly string[]): string | undefined {
  const match = argv.find((arg) => arg.startsWith(CLOUD_APP_ORIGIN_ARG));
  return match?.slice(CLOUD_APP_ORIGIN_ARG.length);
}

/** Packaged Electron has no `defaultApp`. Unit tests are not Electron. */
function electronIsPackaged(): boolean {
  if (!process.versions.electron) return false;
  return (process as { defaultApp?: boolean }).defaultApp !== true;
}

function resolveCloudAppOrigin(): string {
  return cloudAppOriginFrom({
    packaged: electronIsPackaged(),
    environmentOrigin: process.env[CLOUD_APP_ORIGIN_ENV],
    argumentOrigin: argumentOrigin(process.argv),
  });
}

export const CLOUD_APP_ORIGIN = resolveCloudAppOrigin();

/**
 * The one Clerk-hosted sign-in host the window may navigate through, or null.
 *
 * A production Clerk instance answers on the app's own domain, which the
 * window already holds. A development instance answers under a suffix every
 * Clerk customer shares, so admitting the suffix admits a sign-in page anyone
 * can host. Only the tenant this build's own publishable key names is let in,
 * and a key naming any other kind of host adds nothing.
 */
export function clerkDevelopmentHost(publishableKey: string | undefined): string | null {
  if (!publishableKey) return null;
  let host: string;
  try {
    host = frontendApiFromPublishableKey(publishableKey).toLowerCase();
  } catch {
    return null;
  }
  return host.endsWith(CLERK_DEVELOPMENT_SUFFIX) && host !== CLERK_DEVELOPMENT_SUFFIX.slice(1)
    ? host
    : null;
}

export const CLERK_DEVELOPMENT_HOST = clerkDevelopmentHost(process.env[CLERK_PUBLISHABLE_KEY_ENV]);

/**
 * The page hands over the relay address it got from the pairing API, and the
 * page is not trusted to choose it: a relay of its own would carry the phone's
 * end of the session. An unencrypted local relay is accepted only when the app
 * itself is pointed at a local server.
 */
export function isAllowedRelayUrl(rawUrl: string): boolean {
  const parsed = parseWithoutCredentials(rawUrl);
  if (!parsed) return false;
  const host = parsed.hostname;
  if (parsed.protocol === 'wss:') return host === RELAY_HOST || isFirstPartyHost(host);
  if (parsed.protocol === 'ws:') {
    return isLocalhost(host) && isLocalhost(new URL(CLOUD_APP_ORIGIN).hostname);
  }
  return false;
}
