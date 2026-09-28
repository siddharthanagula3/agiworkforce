import 'server-only';

const STORAGE_CORS_SAFE_DEV_ORIGINS = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);

export function uploadNeedsSameOriginRelay(request: Request): boolean {
  if (process.env['VERCEL_ENV'] === 'production') return false;
  if (!process.env['VERCEL_ENV'] && process.env['NODE_ENV'] === 'production') return false;
  return !STORAGE_CORS_SAFE_DEV_ORIGINS.has(new URL(request.url).origin);
}
