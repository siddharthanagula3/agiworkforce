import 'server-only';

const STORAGE_CORS_SAFE_DEV_ORIGINS = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);

export function uploadNeedsSameOriginRelay(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const extensionOrigin = new URL(origin);
      if (
        extensionOrigin.protocol === 'chrome-extension:' &&
        /^[a-p]{32}$/u.test(extensionOrigin.hostname) &&
        !extensionOrigin.username &&
        !extensionOrigin.password &&
        extensionOrigin.pathname === '' &&
        !extensionOrigin.search &&
        !extensionOrigin.hash
      )
        return true;
    } catch {
      // Invalid origins never change the storage route.
    }
  }
  if (process.env['VERCEL_ENV'] === 'production') return false;
  if (!process.env['VERCEL_ENV'] && process.env['NODE_ENV'] === 'production') return false;
  return !STORAGE_CORS_SAFE_DEV_ORIGINS.has(new URL(request.url).origin);
}
