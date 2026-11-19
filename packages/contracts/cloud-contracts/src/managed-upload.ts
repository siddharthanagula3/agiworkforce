import { isLoopbackHostname } from '@agiworkforce/types';

export interface ManagedUploadAuth {
  baseUrl?: string;
  getHeaders?: () => HeadersInit | Promise<HeadersInit>;
  decorateMutationHeaders?: (headers: Headers) => HeadersInit | Promise<HeadersInit>;
}

export interface ManagedUploadRequestOptions {
  headers: Record<string, string>;
  credentials?: RequestCredentials;
  redirect?: RequestRedirect;
}

const SIGNED_HEADERS_PARAM = 'x-amz-signedheaders';
const HEADERS_THE_TRANSPORT_SETS = new Set(['host', 'content-length']);

function signedHeaderNames(uploadUrl: string): string[] {
  const names: string[] = [];
  new URL(uploadUrl).searchParams.forEach((value, name) => {
    if (name.toLowerCase() === SIGNED_HEADERS_PARAM) names.push(...value.split(';'));
  });
  return names.map((name) => name.trim().toLowerCase()).filter(Boolean);
}

export function assertUploadSendsSignedHeaders(
  uploadUrl: string,
  uploadHeaders: HeadersInit,
): void {
  const sent = new Headers(uploadHeaders);
  const missing = signedHeaderNames(uploadUrl).filter(
    (name) => !HEADERS_THE_TRANSPORT_SETS.has(name) && !sent.has(name),
  );
  if (missing.length > 0) {
    throw new Error(
      `Refusing an upload that storage would reject: it does not send ${missing.join(', ')}.`,
    );
  }
}

export async function managedUploadRequestOptions(
  uploadUrl: string,
  uploadHeaders: HeadersInit,
  auth: ManagedUploadAuth,
): Promise<ManagedUploadRequestOptions> {
  const headers = new Headers(uploadHeaders);
  let base: URL | undefined;
  let apiOrigin: string | undefined;
  try {
    base = new URL(
      auth.baseUrl || '/',
      typeof location === 'undefined' ? undefined : location.href,
    );
    if (['http:', 'https:'].includes(base.protocol) && !base.username && !base.password)
      apiOrigin = base.origin;
  } catch {
    apiOrigin = undefined;
  }
  const target = new URL(uploadUrl);
  const sameBrowserOrigin = typeof location !== 'undefined' && target.origin === location.origin;
  const configuredLoopback =
    base?.protocol === 'http:' && target.origin === apiOrigin && isLoopbackHostname(base.hostname);
  if (
    target.username ||
    target.password ||
    (target.protocol !== 'https:' &&
      !(target.protocol === 'http:' && (sameBrowserOrigin || configuredLoopback)))
  )
    throw new Error('Refusing an insecure upload destination.');
  assertUploadSendsSignedHeaders(uploadUrl, headers);
  if (target.origin !== apiOrigin) return { headers: Object.fromEntries(headers.entries()) };
  const currentHeaders = new Headers(await auth.getHeaders?.());
  currentHeaders.delete('Content-Type');
  currentHeaders.forEach((value, name) => headers.set(name, value));
  const contentType = new Headers(uploadHeaders).get('Content-Type');
  const decorated = auth.decorateMutationHeaders
    ? new Headers(await auth.decorateMutationHeaders(headers))
    : headers;
  if (contentType === null) decorated.delete('Content-Type');
  else decorated.set('Content-Type', contentType);
  return {
    headers: Object.fromEntries(decorated.entries()),
    credentials: 'include',
    redirect: 'error',
  };
}
