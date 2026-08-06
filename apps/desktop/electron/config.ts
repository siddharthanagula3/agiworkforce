/**
 * Electron cloud shell configuration.
 *
 * Constant names here are deliberately distinct from the renderer's
 * `WEB_APP_URL` / `API_BASE_URL` (`src/api/config.ts`): the repo's eslint
 * egress rule pins raw `fetch()` of those identifiers to the renderer's
 * egress-guard chokepoint, which exists to protect the Local trust boundary.
 * This shell has no Local mode — every request it can make is Managed Cloud
 * by construction (Clerk FAPI + our own API, both allowlisted below), so the
 * main process is its own egress chokepoint.
 */

/** Our cloud app + API origin (same-origin API, like the web app). */
export const CLOUD_APP_ORIGIN = 'https://agiworkforce.com';

/**
 * Which renderer this process drives: the hosted cloud app (default) or the
 * bundled Vite build served over `agi://cloud`. Read once here so every
 * main-process module agrees; see main.ts's header for the tradeoff.
 */
export type RendererMode = 'remote' | 'bundled';
export const RENDERER_MODE: RendererMode =
  process.env['AGI_CLOUD_RENDERER'] === 'bundled' ? 'bundled' : 'remote';

/**
 * Session partition for the remote renderer. Cookies/localStorage (i.e. the
 * signed-in Clerk session) live here, and every remote window — main window
 * and quick-ask panel alike — must use it so they share one login. Changing
 * this string signs every existing install out.
 */
export const REMOTE_SESSION_PARTITION = 'persist:agi-cloud';

/** Renderer custom scheme. Registered standard+secure so fetches carry a real Origin. */
export const RENDERER_SCHEME = 'agi';
export const RENDERER_HOST = 'cloud';
export const RENDERER_ORIGIN = `${RENDERER_SCHEME}://${RENDERER_HOST}`;

/**
 * Deep-link scheme for SSO callbacks. Distinct from the Tauri shell's
 * `agiworkforce://` so both apps can be installed side by side.
 */
export const DEEP_LINK_SCHEME = 'agiworkforce-cloud';

/** Hosts the account bridge may store as an API base (mirrors the Rust allowlist). */
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

/** Content-Security-Policy served with every renderer document. */
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
