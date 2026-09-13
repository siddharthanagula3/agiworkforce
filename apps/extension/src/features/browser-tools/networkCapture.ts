import { sanitizePageText } from '../../background/policy';

export const NETWORK_BUFFER_LIMIT = 200;
export const NETWORK_URL_MAX_CHARS = 500;
export const NETWORK_DOMAINS: readonly string[] = ['Network'];

const CREDENTIAL_PARAM_RE =
  /(?:^|[_-])(?:token|key|auth|secret|password|passwd|pwd|sig|signature|session|sid|credential|access|refresh|bearer|otp|code)(?:$|[_-])/i;

export interface NetworkEntry {
  readonly requestId: string;
  readonly at: number;
  readonly method: string;
  readonly url: string;
  readonly resourceType: string;
  readonly status?: number;
  readonly statusText?: string;
  readonly durationMs?: number;
  readonly bytes?: number;
  readonly failure?: string;
}

interface MutableEntry {
  requestId: string;
  at: number;
  startedAtSeconds: number;
  method: string;
  url: string;
  resourceType: string;
  status?: number;
  statusText?: string;
  durationMs?: number;
  bytes?: number;
  failure?: string;
}

const buffers = new Map<number, MutableEntry[]>();

/**
 * Strips the parts of a URL that carry credentials before it is ever stored.
 *
 * A request line is the one place a bearer token routinely appears in plain
 * text outside a header, in a signed URL or an OAuth redirect, so userinfo is
 * dropped and credential-shaped query values are replaced by name. What
 * survives still passes through the shared secret redaction.
 */
export function summarizeRequestUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return sanitizePageText(raw).slice(0, NETWORK_URL_MAX_CHARS);
  }
  parsed.username = '';
  parsed.password = '';
  for (const name of [...parsed.searchParams.keys()]) {
    // Emptied rather than filled with a marker: a marker is itself matched by
    // the shared secret redactor, which then swallows every parameter after it.
    if (CREDENTIAL_PARAM_RE.test(name)) parsed.searchParams.set(name, '');
  }
  parsed.hash = '';
  return sanitizePageText(parsed.toString()).slice(0, NETWORK_URL_MAX_CHARS);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function bufferFor(tabId: number): MutableEntry[] {
  const buffer = buffers.get(tabId) ?? [];
  buffers.set(tabId, buffer);
  return buffer;
}

function findEntry(tabId: number, requestId: unknown): MutableEntry | undefined {
  if (typeof requestId !== 'string') return undefined;
  const buffer = buffers.get(tabId);
  if (!buffer) return undefined;
  for (let index = buffer.length - 1; index >= 0; index -= 1) {
    if (buffer[index]!.requestId === requestId) return buffer[index];
  }
  return undefined;
}

function elapsedMs(entry: MutableEntry, timestamp: unknown): number | undefined {
  if (typeof timestamp !== 'number' || entry.startedAtSeconds <= 0) return undefined;
  const delta = Math.round((timestamp - entry.startedAtSeconds) * 1_000);
  return delta >= 0 ? delta : undefined;
}

export function recordNetworkEvent(
  tabId: number,
  method: string,
  params: Record<string, unknown>,
): void {
  if (method === 'Network.requestWillBeSent') {
    const request = asRecord(params['request']);
    const url = typeof request?.['url'] === 'string' ? request['url'] : '';
    if (!url || typeof params['requestId'] !== 'string') return;
    const buffer = bufferFor(tabId);
    buffer.push({
      requestId: params['requestId'],
      at: Date.now(),
      startedAtSeconds: typeof params['timestamp'] === 'number' ? params['timestamp'] : 0,
      method: typeof request?.['method'] === 'string' ? request['method'] : 'GET',
      url: summarizeRequestUrl(url),
      resourceType: typeof params['type'] === 'string' ? params['type'] : 'Other',
    });
    while (buffer.length > NETWORK_BUFFER_LIMIT) buffer.shift();
    return;
  }

  if (method === 'Network.responseReceived') {
    const entry = findEntry(tabId, params['requestId']);
    if (!entry) return;
    const response = asRecord(params['response']);
    if (typeof response?.['status'] === 'number') entry.status = response['status'];
    if (typeof response?.['statusText'] === 'string' && response['statusText']) {
      entry.statusText = response['statusText'];
    }
    if (typeof params['type'] === 'string') entry.resourceType = params['type'];
    return;
  }

  if (method === 'Network.loadingFinished') {
    const entry = findEntry(tabId, params['requestId']);
    if (!entry) return;
    if (typeof params['encodedDataLength'] === 'number') entry.bytes = params['encodedDataLength'];
    const duration = elapsedMs(entry, params['timestamp']);
    if (duration !== undefined) entry.durationMs = duration;
    return;
  }

  if (method === 'Network.loadingFailed') {
    const entry = findEntry(tabId, params['requestId']);
    if (!entry) return;
    entry.failure =
      params['canceled'] === true
        ? 'canceled'
        : typeof params['errorText'] === 'string' && params['errorText']
          ? params['errorText']
          : 'failed';
    const duration = elapsedMs(entry, params['timestamp']);
    if (duration !== undefined) entry.durationMs = duration;
  }
}

function freeze(entry: MutableEntry): NetworkEntry {
  return {
    requestId: entry.requestId,
    at: entry.at,
    method: entry.method,
    url: entry.url,
    resourceType: entry.resourceType,
    ...(entry.status === undefined ? {} : { status: entry.status }),
    ...(entry.statusText === undefined ? {} : { statusText: entry.statusText }),
    ...(entry.durationMs === undefined ? {} : { durationMs: entry.durationMs }),
    ...(entry.bytes === undefined ? {} : { bytes: entry.bytes }),
    ...(entry.failure === undefined ? {} : { failure: entry.failure }),
  };
}

export interface NetworkQuery {
  readonly pattern?: string;
  readonly resourceType?: string;
  readonly failedOnly?: boolean;
  readonly limit?: number;
}

export class NetworkPatternError extends Error {}

export function readNetworkEntries(tabId: number, query: NetworkQuery = {}): NetworkEntry[] {
  let entries = (buffers.get(tabId) ?? []).map(freeze);
  if (query.resourceType) {
    const wanted = query.resourceType.toLowerCase();
    entries = entries.filter((entry) => entry.resourceType.toLowerCase() === wanted);
  }
  if (query.failedOnly) {
    entries = entries.filter(
      (entry) => entry.failure !== undefined || (entry.status !== undefined && entry.status >= 400),
    );
  }
  if (query.pattern) {
    let matcher: RegExp;
    try {
      matcher = new RegExp(query.pattern, 'i');
    } catch {
      throw new NetworkPatternError(`pattern "${query.pattern}" is not a valid regular expression`);
    }
    entries = entries.filter((entry) => matcher.test(entry.url));
  }
  const limit = query.limit;
  if (typeof limit === 'number' && limit > 0 && entries.length > limit) {
    return entries.slice(entries.length - limit);
  }
  return entries;
}

export function clearNetworkEntries(tabId: number): void {
  buffers.delete(tabId);
}

export function formatNetworkEntries(entries: readonly NetworkEntry[]): string {
  if (entries.length === 0) return 'No network requests captured for this tab.';
  return entries
    .map((entry) => {
      const outcome =
        entry.failure ?? (entry.status === undefined ? 'pending' : String(entry.status));
      const timing = entry.durationMs === undefined ? '' : ` ${entry.durationMs}ms`;
      const size = entry.bytes === undefined ? '' : ` ${entry.bytes}B`;
      return `${entry.method} ${outcome} ${entry.resourceType}${timing}${size} ${entry.url}`;
    })
    .join('\n');
}
