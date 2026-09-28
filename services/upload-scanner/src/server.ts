import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { readSignatureStatus, scanStream, type ClamdAddress } from './clamd.ts';
import { log } from './log.ts';

export const MAX_SCAN_BYTES = 25 * 1024 * 1024;
export const SIGNATURE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SCAN_DEADLINE_MS = 14_000;
const HEALTH_DEADLINE_MS = 3_000;
const HEADERS_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 20_000;
const HOUR_MS = 60 * 60 * 1000;

export interface ScannerOptions {
  tokens: readonly string[];
  clamd: ClamdAddress;
  maxBytes?: number;
  scanDeadlineMs?: number;
  now?: () => number;
}

function respond(
  res: ServerResponse,
  status: number,
  body: object,
  headers: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(payload)),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(payload);
}

function refuse(res: ServerResponse, status: number, detail: string): void {
  respond(res, status, { safe: false, detail }, { Connection: 'close' });
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function bearerAuthorizer(tokens: readonly string[]): (header: string | undefined) => boolean {
  const accepted = tokens.map(digest);
  return (header) => {
    const presented = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '')?.[1];
    if (!presented) return false;
    const candidate = digest(presented);
    return accepted.reduce((matched, token) => timingSafeEqual(candidate, token) || matched, false);
  };
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function scan(
  req: IncomingMessage,
  res: ServerResponse,
  clamd: ClamdAddress,
  maxBytes: number,
  deadlineMs: number,
): Promise<void> {
  const declared = req.headers['content-length'];
  if (declared === undefined) return refuse(res, 411, 'Content-Length is required');
  const bytes = Number(declared);
  if (bytes > maxBytes) {
    return refuse(res, 413, `Uploads larger than ${maxBytes} bytes are not scanned`);
  }

  const started = Date.now();
  const deadline = new AbortController();
  const timer = setTimeout(() => {
    deadline.abort();
    if (!req.complete) req.destroy();
  }, deadlineMs);
  try {
    const verdict = await scanStream(clamd, req, deadline.signal);
    const ms = Date.now() - started;
    if (verdict.kind === 'clean') {
      log('info', 'scan_clean', { bytes, ms });
      return respond(res, 200, { safe: true });
    }
    if (verdict.kind === 'infected') {
      log('warn', 'scan_infected', { bytes, ms, signature: verdict.signature });
      return respond(res, 200, { safe: false, detail: `ClamAV detected ${verdict.signature}` });
    }
    log('error', 'scan_failed', { bytes, ms, reason: verdict.reason });
  } catch (error) {
    log('error', 'scan_failed', { bytes, ms: Date.now() - started, reason: reason(error) });
  } finally {
    clearTimeout(timer);
  }
  refuse(res, 503, 'The scanner could not complete the scan');
}

async function health(res: ServerResponse, clamd: ClamdAddress, now: () => number): Promise<void> {
  try {
    const status = await readSignatureStatus(clamd, AbortSignal.timeout(HEALTH_DEADLINE_MS));
    const age = now() - status.publishedAt.getTime();
    const fresh = age <= SIGNATURE_MAX_AGE_MS;
    respond(res, fresh ? 200 : 503, {
      status: fresh ? 'ok' : 'stale',
      engine: status.engine,
      signatures: {
        version: status.version,
        publishedAt: status.publishedAt.toISOString(),
        ageHours: Math.floor(age / HOUR_MS),
      },
    });
  } catch {
    respond(res, 503, { status: 'unavailable' });
  }
}

export function createScannerServer(options: ScannerOptions): Server {
  const isAuthorized = bearerAuthorizer(options.tokens);
  const maxBytes = options.maxBytes ?? MAX_SCAN_BYTES;
  const deadlineMs = options.scanDeadlineMs ?? SCAN_DEADLINE_MS;
  const now = options.now ?? Date.now;

  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://scanner').pathname;
    if (path === '/scan' && req.method === 'POST') {
      if (!isAuthorized(req.headers.authorization)) {
        log('warn', 'scan_unauthorized');
        return refuse(res, 401, 'Unauthorized');
      }
      void scan(req, res, options.clamd, maxBytes, deadlineMs);
      return;
    }
    if (path === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      void health(res, options.clamd, now);
      return;
    }
    refuse(res, 404, 'Not found');
  });
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  return server;
}
