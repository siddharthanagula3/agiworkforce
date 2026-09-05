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
 * Bundled is the shipped mode: it is the only one that attaches `preload.cjs`,
 * so it is the only one in which the IPC bridge, the account bridge, quick ask,
 * screenshot capture, the secret store and, critically, the
 * `agiworkforce-cloud://` OAuth callback have any receiver. Nothing sets this
 * variable at package or launch time, so defaulting to `remote` meant every
 * installed build silently dropped its own deep links and never loaded the
 * renderer it ships. `remote` stays available as an explicit opt-out.
 */
export const RENDERER_MODE: RendererMode =
  process.env['AGI_CLOUD_RENDERER'] === 'remote' ? 'remote' : 'bundled';

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
