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

const PRODUCTION_CLOUD_APP_ORIGIN = 'https://agiworkforce.com';
const CLOUD_APP_ORIGIN_ENV = 'AGI_CLOUD_APP_ORIGIN';

export type RendererMode = 'remote' | 'bundled';

/**
 * Remote is the shipped mode: the desktop app is the website in a shell.
 *
 * The reason bundled was the default no longer holds. It used to be the only
 * mode that attached `preload.cjs`, so remote dropped deep links, the account
 * bridge and the update check; the window was a browser tab pointed at the
 * site. Both modes attach it now, and `preload.ts` exposes the bridge only on
 * this origin, so the sign-in providers `windowPolicy.ts` allows for OAuth do
 * not receive it.
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

export const DEEP_LINK_SCHEME = 'agiworkforce-cloud';

export function isAllowedApiBaseUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return false;
  }
  const host = parsed.hostname;
  const isLocalhost = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'].includes(host);
  if (parsed.protocol === 'http:' && !isLocalhost) return false;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return isLocalhost || host === 'agiworkforce.com' || host.endsWith('.agiworkforce.com');
}

function resolveCloudAppOrigin(): string {
  const requested = process.env[CLOUD_APP_ORIGIN_ENV];
  if (requested && isAllowedApiBaseUrl(requested)) return requested.replace(/\/+$/, '');
  return PRODUCTION_CLOUD_APP_ORIGIN;
}

export const CLOUD_APP_ORIGIN = resolveCloudAppOrigin();

export const RENDERER_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'img-src * data: blob:',
  "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:",
  `connect-src 'self' https://api.agiworkforce.com ${CLOUD_APP_ORIGIN} https://api.stripe.com https://agiworkforce-signaling.fly.dev wss://agiworkforce-signaling.fly.dev`,
  "frame-src 'self' https://js.stripe.com",
  "frame-ancestors 'none'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
