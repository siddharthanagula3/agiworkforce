import 'server-only';

import {
  assertResolvedPublicHostname,
  EgressPolicyError,
  pinnedPublicFetch,
} from '@/lib/egress-policy';

/**
 * The one way this process fetches a URL it did not choose.
 *
 * Every hop is vetted before it is made, because a client that follows
 * redirects itself reaches whatever the last hop names, and a redirect to an IP
 * literal never passes through the DNS pin at all.
 */

export type GuardedFetchRefusal =
  | 'malformed_url'
  | 'unsupported_scheme'
  | 'embedded_credentials'
  | 'blocked_host'
  | 'missing_location'
  | 'too_many_redirects'
  | 'unreachable'
  | 'timeout'
  | 'cancelled';

export type GuardedFetchOutcome =
  | { ok: true; kind: 'response'; response: Response; url: URL; hops: number }
  | { ok: true; kind: 'redirect'; url: URL; hops: number }
  | {
      ok: false;
      refusal: GuardedFetchRefusal;
      url: URL | null;
      detail: string;
      status?: number;
    };

export interface Deadline {
  signal: AbortSignal;
  reason: () => 'timeout' | 'cancelled' | null;
  release: () => void;
}

/** One clock for a whole operation, including the body read after the last hop. */
export function createDeadline(timeoutMs: number, callerSignal?: AbortSignal): Deadline {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const cancel = () => controller.abort();
  callerSignal?.addEventListener('abort', cancel, { once: true });
  if (callerSignal?.aborted) controller.abort();
  return {
    signal: controller.signal,
    reason: () => {
      if (callerSignal?.aborted) return 'cancelled';
      return controller.signal.aborted ? 'timeout' : null;
    },
    release: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', cancel);
    },
  };
}

const FORBIDDEN_REQUEST_HEADERS = ['cookie', 'authorization', 'proxy-authorization'];

export interface GuardedFetchOptions {
  deadline: Deadline;
  maxRedirects: number;
  headers: Readonly<Record<string, string>>;
  method?: 'GET' | 'POST';
  body?: string;
  fetchImpl?: typeof fetch;
  /** Return false to stop at a redirect target and hand it back unfetched. */
  followRedirect?: (next: URL, hop: number) => boolean;
}

function refuse(
  refusal: GuardedFetchRefusal,
  url: URL | null,
  detail: string,
  status?: number,
): GuardedFetchOutcome {
  return status === undefined
    ? { ok: false, refusal, url, detail }
    : { ok: false, refusal, url, detail, status };
}

function admissible(url: URL): GuardedFetchRefusal | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'unsupported_scheme';
  if (url.username !== '' || url.password !== '') return 'embedded_credentials';
  return null;
}

export async function guardedFetch(
  target: URL,
  options: GuardedFetchOptions,
): Promise<GuardedFetchOutcome> {
  for (const name of Object.keys(options.headers)) {
    if (FORBIDDEN_REQUEST_HEADERS.includes(name.toLowerCase())) {
      throw new TypeError(`guardedFetch refuses to send a ${name} header to an unvetted host.`);
    }
  }

  const fetchImpl = options.fetchImpl ?? pinnedPublicFetch;
  const { deadline } = options;
  let current = target;

  for (let hop = 0; hop <= options.maxRedirects; hop += 1) {
    const inadmissible = admissible(current);
    if (inadmissible) {
      return refuse(
        inadmissible,
        current,
        inadmissible === 'unsupported_scheme'
          ? `Unsupported URL scheme "${current.protocol}", only http/https.`
          : 'URLs with embedded credentials are not allowed.',
      );
    }

    try {
      await assertResolvedPublicHostname(current.href);
    } catch (error) {
      if (error instanceof EgressPolicyError) {
        return refuse(
          'blocked_host',
          current,
          `URL blocked: ${current.hostname} is not a resolvable public host.`,
        );
      }
      throw error;
    }

    let response: Response;
    try {
      response = await fetchImpl(current.href, {
        method: options.method ?? 'GET',
        redirect: 'manual',
        signal: deadline.signal,
        headers: { ...options.headers },
        ...(options.body === undefined ? {} : { body: options.body }),
      });
    } catch (error) {
      const stopped = deadline.reason();
      if (stopped) return refuse(stopped, current, `Fetch ${stopped} for ${current.href}.`);
      const message = error instanceof Error ? error.message : String(error);
      return refuse('unreachable', current, `Failed to fetch ${current.href}: ${message}`);
    }

    if (response.status < 300 || response.status >= 400) {
      return { ok: true, kind: 'response', response, url: current, hops: hop };
    }

    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => undefined);
    if (!location) {
      return refuse(
        'missing_location',
        current,
        `Redirect (${response.status}) without a Location header.`,
        response.status,
      );
    }

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      return refuse('malformed_url', current, `Redirect to a malformed URL: ${location}`);
    }
    const nextInadmissible = admissible(next);
    if (nextInadmissible) {
      return refuse(
        nextInadmissible,
        next,
        nextInadmissible === 'unsupported_scheme'
          ? `Unsupported URL scheme "${next.protocol}", only http/https.`
          : 'URLs with embedded credentials are not allowed.',
      );
    }

    if (hop === options.maxRedirects) {
      return refuse(
        'too_many_redirects',
        current,
        `Exceeded ${options.maxRedirects} redirects fetching ${target.href}.`,
      );
    }
    if (options.followRedirect && !options.followRedirect(next, hop)) {
      return { ok: true, kind: 'redirect', url: next, hops: hop + 1 };
    }
    current = next;
  }

  return refuse(
    'too_many_redirects',
    current,
    `Exceeded ${options.maxRedirects} redirects fetching ${target.href}.`,
  );
}

/** Refuses a body over the cap rather than keeping a prefix of it. */
export async function readBodyCapped(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const body = response.body;
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return join(chunks, total);
}

/** Keeps the first `maxBytes` and stops reading, for metadata in the document head. */
export async function readBodyTruncated(response: Response, maxBytes: number): Promise<Uint8Array> {
  const body = response.body;
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const remaining = maxBytes - total;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return join(chunks, total);
}

function join(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * The variant for a request that carries a secret.
 *
 * `guardedFetch` refuses to be handed a credential at all, which is right for a
 * page nobody here chose. A token exchange and an MCP dial do carry one, so
 * they get their own door with a stricter rule about where it may travel:
 * `refuse` means a redirect is a failed call, and `same-origin` means the
 * credential never leaves the origin the caller registered.
 */
export type CredentialedRedirectPolicy = 'refuse' | 'same-origin';

export type CredentialedRefusal =
  GuardedFetchRefusal | 'redirect_refused' | 'cross_origin_redirect' | 'body_not_replayable';

export type CredentialedFetchOutcome =
  | { ok: true; response: Response; url: URL }
  | { ok: false; refusal: CredentialedRefusal; url: URL | null; detail: string; status?: number };

export interface CredentialedFetchOptions {
  deadline: Deadline;
  redirects: CredentialedRedirectPolicy;
  headers: Readonly<Record<string, string>>;
  method?: string;
  body?: BodyInit | null | undefined;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
}

const CREDENTIALED_MAX_REDIRECTS = 3;

function credentialedRefusal(
  refusal: CredentialedRefusal,
  url: URL | null,
  detail: string,
  status?: number,
): CredentialedFetchOutcome {
  return status === undefined
    ? { ok: false, refusal, url, detail }
    : { ok: false, refusal, url, detail, status };
}

export async function credentialedFetch(
  target: URL,
  options: CredentialedFetchOptions,
): Promise<CredentialedFetchOutcome> {
  const fetchImpl = options.fetchImpl ?? pinnedPublicFetch;
  const origin = target.origin;
  const maxRedirects =
    options.redirects === 'refuse' ? 0 : (options.maxRedirects ?? CREDENTIALED_MAX_REDIRECTS);
  let current = target;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const inadmissible = admissible(current);
    if (inadmissible) {
      return credentialedRefusal(
        inadmissible,
        current,
        inadmissible === 'unsupported_scheme'
          ? `Unsupported URL scheme "${current.protocol}", only http/https.`
          : 'URLs with embedded credentials are not allowed.',
      );
    }

    try {
      await assertResolvedPublicHostname(current.href);
    } catch (error) {
      if (error instanceof EgressPolicyError) {
        return credentialedRefusal(
          'blocked_host',
          current,
          `Blocked: ${current.hostname} is not a resolvable public host.`,
        );
      }
      throw error;
    }

    let response: Response;
    try {
      response = await fetchImpl(current.href, {
        method: options.method ?? 'GET',
        redirect: 'manual',
        signal: options.deadline.signal,
        headers: { ...options.headers },
        ...(options.body === undefined || options.body === null ? {} : { body: options.body }),
      });
    } catch (error) {
      const stopped = options.deadline.reason();
      if (stopped) {
        return credentialedRefusal(stopped, current, `Request ${stopped} for ${current.host}.`);
      }
      const message = error instanceof Error ? error.message : String(error);
      return credentialedRefusal('unreachable', current, `Request failed: ${message}`);
    }

    if (response.status < 300 || response.status >= 400) {
      return { ok: true, response, url: current };
    }

    await response.body?.cancel().catch(() => undefined);
    if (options.redirects === 'refuse') {
      return credentialedRefusal(
        'redirect_refused',
        current,
        'The endpoint answered with a redirect, which a credentialed request never follows.',
        response.status,
      );
    }

    const location = response.headers.get('location');
    if (!location) {
      return credentialedRefusal(
        'missing_location',
        current,
        `Redirect (${response.status}) without a Location header.`,
        response.status,
      );
    }
    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      return credentialedRefusal('malformed_url', current, 'Redirect to a malformed URL.');
    }
    const nextInadmissible = admissible(next);
    if (nextInadmissible) {
      return credentialedRefusal(
        nextInadmissible,
        next,
        `Redirect to an unsupported target from ${current.host}.`,
      );
    }
    if (next.origin !== origin) {
      return credentialedRefusal(
        'cross_origin_redirect',
        next,
        `Refusing to carry a credential from ${origin} to ${next.origin}.`,
      );
    }
    if (options.body !== undefined && options.body !== null && typeof options.body !== 'string') {
      return credentialedRefusal(
        'body_not_replayable',
        next,
        'A redirected credentialed request cannot replay a streamed body.',
      );
    }
    if (hop === maxRedirects) {
      return credentialedRefusal(
        'too_many_redirects',
        current,
        `Exceeded ${maxRedirects} redirects inside ${origin}.`,
      );
    }
    current = next;
  }

  return credentialedRefusal('too_many_redirects', current, `Exceeded ${maxRedirects} redirects.`);
}
