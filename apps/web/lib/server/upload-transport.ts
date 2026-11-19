import 'server-only';

const STORAGE_CORS_SAFE_DEV_ORIGINS = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);

function isChromeExtensionOrigin(origin: string): boolean {
  try {
    const extensionOrigin = new URL(origin);
    return (
      extensionOrigin.protocol === 'chrome-extension:' &&
      /^[a-p]{32}$/u.test(extensionOrigin.hostname) &&
      !extensionOrigin.username &&
      !extensionOrigin.password &&
      extensionOrigin.pathname === '' &&
      !extensionOrigin.search &&
      !extensionOrigin.hash
    );
  } catch {
    return false;
  }
}

function webOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password || url.hostname.includes('*')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The browser origins the storage bucket's CORS rule allows beyond the
 * production app, such as a preview deployment. Each entry must be a bare web
 * origin; anything else is ignored rather than widened into a match.
 */
function storageCorsOrigins(): ReadonlySet<string> {
  const configured = process.env['UPLOAD_STORAGE_CORS_ORIGINS'];
  if (!configured) return new Set();
  const origins = new Set<string>();
  for (const entry of configured.split(',')) {
    if (!entry.trim()) continue;
    const origin = webOrigin(entry);
    if (origin && origin === entry.trim().replace(/\/+$/u, '')) origins.add(origin);
  }
  return origins;
}

function originNeedsRelay(origin: string | null, requestUrl: string): boolean {
  if (origin) {
    if (isChromeExtensionOrigin(origin)) return true;
    const listed = webOrigin(origin);
    if (listed !== null && storageCorsOrigins().has(listed)) return false;
  }
  if (process.env['VERCEL_ENV'] === 'production') return false;
  if (!process.env['VERCEL_ENV'] && process.env['NODE_ENV'] === 'production') return false;
  return !STORAGE_CORS_SAFE_DEV_ORIGINS.has(new URL(requestUrl).origin);
}

/**
 * Whether this caller must send its bytes through the web host because storage
 * would refuse its browser origin. A request with no Origin is judged by the
 * host it reached, exactly as before large files existed, so the small-file
 * path never changes with this module.
 */
export function uploadNeedsSameOriginRelay(request: Request): boolean {
  return originNeedsRelay(request.headers.get('origin'), request.url);
}

/**
 * Whether this caller can send a large file's parts straight to storage. A
 * browser sends no Origin on a same-origin GET, but always sends
 * Sec-Fetch-Site, so such a request is judged as coming from the page the URL
 * names. A request with neither header is a native client.
 */
export function storageReachableForLargeFiles(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin) return !originNeedsRelay(origin, request.url);
  if (request.headers.get('sec-fetch-site') !== null) {
    return !originNeedsRelay(new URL(request.url).origin, request.url);
  }
  return true;
}
