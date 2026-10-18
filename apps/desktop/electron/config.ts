/**
 * Electron cloud shell configuration.
 *
 * Constant names here are deliberately distinct from the renderer's
 * `WEB_APP_URL` / `API_BASE_URL` (`src/api/config.ts`): the repo's eslint
 * egress rule pins raw `fetch()` of those identifiers to the renderer's
 * egress-guard chokepoint, which exists to protect the Local trust boundary.
 * This shell has no Local mode, every request it can make is Managed Cloud
 * by construction (Clerk FAPI + our own API, both allowlisted below), so the
 * main process is its own egress chokepoint.
 */

import { DESKTOP_DEEP_LINK_SCHEME } from '@agiworkforce/local-runtime-contract';
import { frontendApiFromPublishableKey } from './clerkProxy';

const PRODUCTION_CLOUD_APP_ORIGIN = 'https://agiworkforce.com';
const CLOUD_APP_ORIGIN_ENV = 'AGI_CLOUD_APP_ORIGIN';
const RELAY_HOST = 'agiworkforce-signaling.fly.dev';
const CLERK_PUBLISHABLE_KEY_ENV = 'VITE_CLERK_PUBLISHABLE_KEY';
const CLERK_DEVELOPMENT_SUFFIX = '.clerk.accounts.dev';
const LOCALHOST_NAMES = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'];

export type RendererMode = 'remote' | 'bundled';

/**
 * Remote is the shipped mode: the desktop app is the website in a shell.
 *
 * The reason bundled was the default no longer holds. It used to be the only
 * mode that attached `preload.cjs`, so remote dropped deep links, the account
 * bridge and the update check; the window was a browser tab pointed at the
 * site. Both modes attach it now. `preload.ts` exposes the bridge on every
 * document the window loads, so `isTrustedSender` in `main.ts` is what keeps
 * the sign-in providers `windowPolicy.ts` allows for OAuth from calling it.
 *
 * What bundled actually shipped was the Tauri renderer with its `@tauri-apps`
 * imports aliased to Electron stubs: 946 distinct `invoke` commands, 10 of
 * them answered. Everything behind the other 936 was either dead or gated to a
 * local mode this build can never enter. Loading the website instead means the
 * desktop app has whatever the website has, which is the point of it.
 *
 * `bundled` stays available as an explicit opt-out for anyone who needs to run
 * the old renderer.
 */
export const RENDERER_MODE: RendererMode =
  process.env['AGI_CLOUD_RENDERER'] === 'bundled' ? 'bundled' : 'remote';

export const REMOTE_SESSION_PARTITION = 'persist:agi-cloud';

export const RENDERER_SCHEME = 'agi';
export const RENDERER_HOST = 'cloud';
export const RENDERER_ORIGIN = `${RENDERER_SCHEME}://${RENDERER_HOST}`;

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

function resolveCloudAppOrigin(): string {
  const requested = process.env[CLOUD_APP_ORIGIN_ENV];
  if (requested && isAllowedApiBaseUrl(requested)) return requested.replace(/\/+$/, '');
  return PRODUCTION_CLOUD_APP_ORIGIN;
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
 * The Clerk frontend API hosts this shell will send a client credential to.
 * The renderer names the host through the publishable key it passes, so the
 * host is checked here rather than trusted: our own domain, where a production
 * instance answers, or the one development tenant this build's key names.
 */
export function isAllowedClerkFrontendApi(
  host: string,
  developmentHost: string | null = CLERK_DEVELOPMENT_HOST,
): boolean {
  const normalized = host.toLowerCase();
  return (
    isFirstPartyHost(normalized) || (developmentHost !== null && normalized === developmentHost)
  );
}

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

export const RENDERER_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'img-src * data: blob:',
  "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:",
  `connect-src 'self' https://api.agiworkforce.com ${CLOUD_APP_ORIGIN} https://api.stripe.com https://${RELAY_HOST} wss://${RELAY_HOST}`,
  "frame-src 'self' https://js.stripe.com",
  "frame-ancestors 'none'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
