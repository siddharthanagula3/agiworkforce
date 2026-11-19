import { isIP } from 'node:net';

export type FetchSource = (url: string, init: RequestInit) => Promise<Response>;

export type SourceUrlRule =
  'invalid_url' | 'not_https' | 'credentials' | 'port' | 'ip_literal' | 'host_not_allowed';

export type SourceUrlCheck = { ok: true; url: URL } | { ok: false; rule: SourceUrlRule };

export type FetchFailureDetail = {
  status?: number;
  errorClass?: string;
  errorCode?: string;
};

export type SourceOpening =
  | { kind: 'opened'; etag: string; chunks: AsyncGenerator<Uint8Array> }
  | ({ kind: 'failed'; reason: 'source_unavailable' | 'source_changed' } & FetchFailureDetail);

export class SourceReadError extends Error {
  readonly detail: FetchFailureDetail;

  constructor(detail: FetchFailureDetail) {
    super('The source stopped sending before the end of the object');
    this.detail = detail;
  }
}

const PRECONDITION_FAILED = 412;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,40}$/;

export function checkSourceUrl(raw: string, hosts: readonly string[]): SourceUrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, rule: 'invalid_url' };
  }
  if (url.protocol !== 'https:') return { ok: false, rule: 'not_https' };
  if (url.username || url.password) return { ok: false, rule: 'credentials' };
  if (url.port !== '') return { ok: false, rule: 'port' };
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  if (isIP(host) !== 0) return { ok: false, rule: 'ip_literal' };
  if (!hosts.includes(host)) return { ok: false, rule: 'host_not_allowed' };
  return { ok: true, url };
}

export function describeFetchError(error: unknown): FetchFailureDetail {
  if (!(error instanceof Error)) return { errorClass: typeof error };
  const cause = (error as { cause?: unknown }).cause;
  const code = cause && typeof cause === 'object' ? (cause as { code?: unknown }).code : undefined;
  return {
    errorClass: error.name,
    ...(typeof code === 'string' && ERROR_CODE.test(code) ? { errorCode: code } : {}),
  };
}

async function* readBody(body: NonNullable<Response['body']>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  let finished = false;
  try {
    for (;;) {
      let next: { done: boolean; value?: Uint8Array };
      try {
        next = await reader.read();
      } catch (error) {
        throw new SourceReadError(describeFetchError(error));
      }
      if (next.done) {
        finished = true;
        return;
      }
      if (next.value) yield next.value;
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
  }
}

export async function openSource(
  fetchSource: FetchSource,
  url: URL,
  etag: string,
  signal: AbortSignal,
): Promise<SourceOpening> {
  let response: Response;
  try {
    response = await fetchSource(url.toString(), {
      method: 'GET',
      redirect: 'error',
      headers: { 'If-Match': etag },
      signal,
    });
  } catch (error) {
    return { kind: 'failed', reason: 'source_unavailable', ...describeFetchError(error) };
  }
  if (response.ok && !response.redirected && response.body) {
    return {
      kind: 'opened',
      etag: response.headers.get('etag') ?? '',
      chunks: readBody(response.body),
    };
  }
  await response.body?.cancel().catch(() => undefined);
  return {
    kind: 'failed',
    reason: response.status === PRECONDITION_FAILED ? 'source_changed' : 'source_unavailable',
    status: response.status,
  };
}
