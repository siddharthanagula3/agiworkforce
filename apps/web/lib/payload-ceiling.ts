import { MAX_ATTACHMENT_BYTES } from '@agiworkforce/types';

export const DEFAULT_API_PAYLOAD_CEILING_BYTES = 4 * 1024 * 1024;

/**
 * Longest prefix wins, so a nested upload route keeps its own ceiling instead of
 * inheriting the parent collection's. Every entry must be justified by a body a
 * legitimate client actually sends: the bulk message import is bounded by its
 * own schema (200 messages x 100_000 chars), and the upload routes stream a
 * single attachment.
 */
const PAYLOAD_CEILINGS: ReadonlyArray<readonly [string, number]> = [
  ['/api/scim/', 256 * 1024],
  ['/api/llm/v1/chat/completions', 2_000_000],
  ['/api/uploads/', MAX_ATTACHMENT_BYTES],
  ['/api/chat/conversations/', 24 * 1024 * 1024],
];

const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'DELETE']);

export function payloadCeilingBytes(pathname: string): number {
  let ceiling = DEFAULT_API_PAYLOAD_CEILING_BYTES;
  let matched = -1;
  for (const [prefix, bytes] of PAYLOAD_CEILINGS) {
    if (pathname.startsWith(prefix) && prefix.length > matched) {
      matched = prefix.length;
      ceiling = bytes;
    }
  }
  return ceiling;
}

export interface PayloadCeilingBreach {
  declaredBytes: number;
  ceilingBytes: number;
}

function pathnameOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return null;
  }
}

/**
 * Declared-length gate. A body without `content-length` is bounded instead by
 * {@link meterUndeclaredBody}, which counts bytes as the route reads them.
 */
export function findPayloadCeilingBreach(request: {
  method?: string;
  url?: string;
  headers?: { get?: (name: string) => string | null };
}): PayloadCeilingBreach | null {
  const method = (request.method ?? 'GET').toUpperCase();
  if (BODYLESS_METHODS.has(method)) return null;

  const pathname = pathnameOf(request.url);
  if (!pathname || !pathname.startsWith('/api/')) return null;

  const declared = request.headers?.get?.('content-length');
  if (declared == null) return null;
  const declaredBytes = Number(declared);
  if (!Number.isFinite(declaredBytes) || declaredBytes < 0) return null;

  const ceilingBytes = payloadCeilingBytes(pathname);
  if (declaredBytes <= ceilingBytes) return null;
  return { declaredBytes, ceilingBytes };
}

interface BodyReadingRequest {
  method?: string;
  url?: string;
  headers?: { get?: (name: string) => string | null };
  body?: ReadableStream<Uint8Array> | null;
  bodyUsed?: boolean;
  arrayBuffer?: () => Promise<ArrayBuffer>;
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
  formData?: () => Promise<FormData>;
}

export class PayloadCeilingExceededError extends Error {
  constructor(readonly ceilingBytes: number) {
    super(`Request body exceeded the ${ceilingBytes} byte ceiling for this endpoint`);
    this.name = 'PayloadCeilingExceededError';
  }
}

async function readWithinCeiling(
  body: ReadableStream<Uint8Array>,
  ceilingBytes: number,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > ceilingBytes) {
      await reader.cancel().catch(() => undefined);
      throw new PayloadCeilingExceededError(ceilingBytes);
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

/**
 * Bounds a body whose size the declared-length gate could not know. The route
 * keeps calling `json()`/`text()`/`arrayBuffer()`/`formData()` as before; those
 * now read through a counter that cancels the stream the moment it passes the
 * route ceiling, so a chunked producer cannot make the consumer buffer without
 * limit.
 */
export function meterUndeclaredBody(request: BodyReadingRequest): void {
  const method = (request.method ?? 'GET').toUpperCase();
  if (BODYLESS_METHODS.has(method)) return;

  const pathname = pathnameOf(request.url);
  if (!pathname || !pathname.startsWith('/api/')) return;
  if (request.headers?.get?.('content-length') != null) return;
  if (!request.body) return;

  const ceilingBytes = payloadCeilingBytes(pathname);
  const contentType = request.headers?.get?.('content-type') ?? '';
  let buffered: Promise<Uint8Array> | null = null;
  const bytes = (): Promise<Uint8Array> => {
    buffered ??= readWithinCeiling(request.body as ReadableStream<Uint8Array>, ceilingBytes);
    return buffered;
  };

  const define = (name: string, value: () => Promise<unknown>): void => {
    Object.defineProperty(request, name, { value, configurable: true, writable: true });
  };

  const buffer = async (): Promise<ArrayBuffer> => {
    const read = await bytes();
    return read.buffer.slice(read.byteOffset, read.byteOffset + read.byteLength) as ArrayBuffer;
  };

  define('arrayBuffer', buffer);
  define('text', async () => new TextDecoder().decode(await bytes()));
  define('json', async () => JSON.parse(new TextDecoder().decode(await bytes())) as unknown);
  define('formData', async () =>
    new Response(await buffer(), { headers: { 'content-type': contentType } }).formData(),
  );
}
