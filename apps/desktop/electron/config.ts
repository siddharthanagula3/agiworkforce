export const CLOUD_APP_ORIGIN = 'https://agiworkforce.com';

export type RendererMode = 'remote' | 'bundled';

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
