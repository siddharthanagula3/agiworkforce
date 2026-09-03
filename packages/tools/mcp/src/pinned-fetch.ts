import { lookup as resolveHostname } from 'node:dns/promises';
import { request as httpRequest, type ClientRequestArgs, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

import { MCPTransportError, type McpFetch } from './transport';

const IPV4_LITERAL = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4Octets(value: string): number[] | null {
  const match = IPV4_LITERAL.exec(value);
  if (!match) return null;
  const octets = match.slice(1, 5).map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return octets;
}

function isPrivateIpv4(octets: readonly number[]): boolean {
  const a = octets[0] ?? 0;
  const b = octets[1] ?? 0;
  const c = octets[2] ?? 0;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 192 && b === 88 && c === 99) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function ipv6Bytes(value: string): number[] | null {
  const host = (value.toLowerCase().split('%')[0] ?? '').replace(/^\[|\]$/g, '');
  const halves = host.split('::');
  if (halves.length > 2) return null;

  const toGroups = (part: string | undefined): number[] | null => {
    if (part === undefined || part === '') return [];
    const pieces = part.split(':');
    const groups: number[] = [];
    for (let index = 0; index < pieces.length; index++) {
      const piece = pieces[index] ?? '';
      const embedded = ipv4Octets(piece);
      if (embedded) {
        if (index !== pieces.length - 1) return null;
        groups.push((embedded[0] ?? 0) * 256 + (embedded[1] ?? 0));
        groups.push((embedded[2] ?? 0) * 256 + (embedded[3] ?? 0));
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
      groups.push(parseInt(piece, 16));
    }
    return groups;
  };

  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  if (head === null || tail === null) return null;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 0 : missing !== 0) return null;

  const groups = [...head, ...new Array<number>(Math.max(missing, 0)).fill(0), ...tail];
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const group of groups) bytes.push((group >> 8) & 0xff, group & 0xff);
  return bytes;
}

function isPrivateIpv6(value: string): boolean {
  const bytes = ipv6Bytes(value);
  if (bytes === null) return true;
  const b0 = bytes[0] ?? 0;
  const b1 = bytes[1] ?? 0;
  const embedded = (): boolean =>
    isPrivateIpv4([bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0]);

  if ((b0 & 0xfe) === 0xfc) return true;
  if (b0 === 0xfe && (b1 & 0xc0) === 0x80) return true;
  if (b0 === 0xff) return true;
  if (b0 === 0x01 && b1 === 0x00 && bytes.slice(2, 8).every((byte) => byte === 0)) return true;
  if (b0 === 0x20 && b1 === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true;
  if (b0 === 0x20 && b1 === 0x02) {
    return isPrivateIpv4([bytes[2] ?? 0, bytes[3] ?? 0, bytes[4] ?? 0, bytes[5] ?? 0]);
  }
  if (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return embedded();
  }
  if (
    b0 === 0x00 &&
    b1 === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes.slice(4, 12).every((byte) => byte === 0)
  ) {
    return embedded();
  }
  if (bytes.slice(0, 12).every((byte) => byte === 0)) return embedded();
  return false;
}

export function isPrivateNetworkAddress(address: string): boolean {
  const version = isIP(address.replace(/^\[|\]$/g, ''));
  if (version === 4) {
    const octets = ipv4Octets(address);
    return octets === null ? true : isPrivateIpv4(octets);
  }
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

interface PinnedAddress {
  address: string;
  family: number;
}

function blocked(url: URL, reason: string): MCPTransportError {
  const target = url.origin === 'null' ? url.protocol : url.origin;
  return new MCPTransportError(`MCP egress refused ${target}: ${reason}`);
}

async function pinAddresses(
  url: URL,
  host: string,
  allowPrivateAddresses: boolean,
): Promise<PinnedAddress[]> {
  const literal = isIP(host);
  if (literal !== 0) {
    if (!allowPrivateAddresses && isPrivateNetworkAddress(host)) {
      throw blocked(url, 'the address is on a private or reserved network');
    }
    return [{ address: host, family: literal }];
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await resolveHostname(host, { all: true, verbatim: true });
  } catch {
    throw blocked(url, 'the hostname could not be resolved');
  }
  if (resolved.length === 0) throw blocked(url, 'the hostname resolved to no addresses');
  const pinned: PinnedAddress[] = [];
  for (const entry of resolved) {
    const family = isIP(entry.address);
    if (family === 0) throw blocked(url, 'the hostname resolved to a malformed address');
    if (!allowPrivateAddresses && isPrivateNetworkAddress(entry.address)) {
      throw blocked(url, 'the hostname resolved to a private or reserved address');
    }
    pinned.push({ address: entry.address, family });
  }
  return pinned;
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address?: string | PinnedAddress[],
  family?: number,
) => void;

function pinnedLookup(addresses: readonly PinnedAddress[]): ClientRequestArgs['lookup'] {
  const lookup = (
    _hostname: string,
    optionsOrCallback: { all?: boolean; family?: number } | LookupCallback,
    maybeCallback?: LookupCallback,
  ): void => {
    const callback =
      typeof optionsOrCallback === 'function'
        ? optionsOrCallback
        : (maybeCallback as LookupCallback);
    const options = typeof optionsOrCallback === 'function' ? {} : (optionsOrCallback ?? {});
    if (typeof callback !== 'function') return;

    const family = options.family === 4 || options.family === 6 ? options.family : 0;
    const usable = family === 0 ? addresses : addresses.filter((entry) => entry.family === family);
    const first = usable[0];
    if (!first) {
      const error: NodeJS.ErrnoException = new Error('no vetted address for this MCP host');
      error.code = 'ENOTFOUND';
      callback(error);
      return;
    }
    if (options.all === true) {
      callback(
        null,
        usable.map((entry) => ({ address: entry.address, family: entry.family })),
      );
      return;
    }
    callback(null, first.address, first.family);
  };
  return lookup as unknown as ClientRequestArgs['lookup'];
}

async function readRequestBody(
  init: RequestInit | undefined,
): Promise<{ bytes?: Buffer; contentType?: string }> {
  const body = init?.body;
  if (body === undefined || body === null) return {};
  if (typeof body === 'string') {
    return { bytes: Buffer.from(body, 'utf8'), contentType: 'text/plain;charset=UTF-8' };
  }
  const normalized = new Response(body as BodyInit);
  const bytes = Buffer.from(await normalized.arrayBuffer());
  const contentType = normalized.headers.get('content-type');
  return contentType === null ? { bytes } : { bytes, contentType };
}

const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding']);

function toWebStream(readable: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      readable.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
        if (controller.desiredSize !== null && controller.desiredSize <= 0) readable.pause();
      });
      readable.on('end', () => {
        try {
          controller.close();
        } catch {
          /* already closed by a cancelled reader */
        }
      });
      readable.on('error', (error: Error) => {
        try {
          controller.error(error);
        } catch {
          /* already closed by a cancelled reader */
        }
      });
    },
    pull() {
      readable.resume();
    },
    cancel(reason) {
      readable.destroy(reason instanceof Error ? reason : undefined);
    },
  });
}

const SAFE_REASON_PHRASE = /^[\t\u0020-\u007e\u0080-\u00ff]*$/;

function decompress(response: IncomingMessage, headers: Headers): Readable {
  const encoding = (headers.get('content-encoding') ?? '').trim().toLowerCase();
  let stream: Readable | null = null;
  if (encoding === 'gzip' || encoding === 'x-gzip') stream = response.pipe(createGunzip());
  else if (encoding === 'deflate') stream = response.pipe(createInflate());
  else if (encoding === 'br') stream = response.pipe(createBrotliDecompress());
  if (stream === null) return response;
  headers.delete('content-encoding');
  headers.delete('content-length');
  return stream;
}

export interface PinnedFetchOptions {
  allowPrivateAddresses?: boolean;
}

export function createPinnedFetch(options: PinnedFetchOptions = {}): McpFetch {
  const allowPrivateAddresses = options.allowPrivateAddresses === true;

  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw blocked(url, 'only http and https are allowed');
    }
    if (url.username !== '' || url.password !== '') {
      throw blocked(url, 'embedded credentials are not allowed');
    }

    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = await pinAddresses(url, host, allowPrivateAddresses);

    const method = (init?.method ?? 'GET').toUpperCase();
    const requestHeaders = new Headers(init?.headers ?? undefined);
    const { bytes, contentType } = await readRequestBody(init);
    if (contentType !== undefined && !requestHeaders.has('content-type')) {
      requestHeaders.set('content-type', contentType);
    }
    if (!requestHeaders.has('accept-encoding')) requestHeaders.set('accept-encoding', 'identity');

    const outgoing: Record<string, string> = {};
    requestHeaders.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) outgoing[key] = value;
    });
    if (bytes) outgoing['content-length'] = String(bytes.byteLength);
    else if (method !== 'GET' && method !== 'HEAD') outgoing['content-length'] = '0';

    const secure = url.protocol === 'https:';
    const requestArgs: ClientRequestArgs = {
      protocol: url.protocol,
      hostname: host,
      port: url.port !== '' ? Number(url.port) : secure ? 443 : 80,
      path: `${url.pathname}${url.search}`,
      method,
      headers: outgoing,
      lookup: pinnedLookup(addresses),
    };
    const signal = init?.signal;
    if (signal) requestArgs.signal = signal;

    const incoming = await new Promise<IncomingMessage>((resolve, reject) => {
      const request = (secure ? httpsRequest : httpRequest)(requestArgs, resolve);
      request.on('error', reject);
      if (bytes) request.end(bytes);
      else request.end();
    });

    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (value === undefined) continue;
      const values = Array.isArray(value) ? value : [value];
      for (const entry of values) {
        try {
          responseHeaders.append(key, entry);
        } catch {
          /* a malformed header from an untrusted server must not fail the whole response */
        }
      }
    }

    const status = incoming.statusCode ?? 502;
    const reason = incoming.statusMessage ?? '';
    const statusText = SAFE_REASON_PHRASE.test(reason) ? reason : '';
    const bodyless = method === 'HEAD' || status === 204 || status === 205 || status === 304;
    if (bodyless) {
      incoming.resume();
      return new Response(null, { status, statusText, headers: responseHeaders });
    }
    return new Response(toWebStream(decompress(incoming, responseHeaders)), {
      status,
      statusText,
      headers: responseHeaders,
    });
  };
}
