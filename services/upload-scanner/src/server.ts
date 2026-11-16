import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { readSignatureStatus, scanStream, type ClamdAddress } from './clamd.ts';
import type { SourceScanConfig } from './config.ts';
import { log } from './log.ts';
import { createScanQueue, createSourceBudget, type ScanQueue } from './scan-queue.ts';
import { checkSourceUrl, type FetchSource } from './source-fetch.ts';
import {
  createSourceScanLiveness,
  runSourceScan,
  scanDeadlineMs,
  type Logger,
  type ProbedHealth,
  type SourceScanJob,
  type SourceScanLiveness,
  type SourceScanVerdict,
} from './source-scan.ts';

export const MAX_SCAN_BYTES = 25 * 1024 * 1024;
export const SIGNATURE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SCAN_DEADLINE_MS = 14_000;
const HEALTH_DEADLINE_MS = 3_000;
const HEALTH_CACHE_MS = 30_000;
const HEADERS_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 20_000;
const HOUR_MS = 60 * 60 * 1000;
const SOURCE_SCAN_PROTOCOL = 2;
const MAX_SUBMIT_BODY_BYTES = 16 * 1024;
const MAX_SOURCE_URL_LENGTH = 8192;
const JOB_ID = /^[A-Za-z0-9_-]{1,128}:\d{1,6}$/;
const HEADER_SAFE = /^[\x20-\x7e]+$/;
const SCAN_PATH_PREFIX = '/v2/scans/';
const SCAN_INCOMPLETE = 'The scanner could not complete the scan';
const ENCRYPTED_SIGNATURE_PREFIX = 'Heuristics.Encrypted.';
const EICAR_PROBE = Buffer.from(
  ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''),
  'latin1',
);

export interface ScannerOptions {
  tokens: readonly string[];
  clamd: ClamdAddress;
  maxBytes?: number;
  scanDeadlineMs?: number;
  now?: () => number;
  probe?: HealthProbe;
  healthDeadlineMs?: number;
  healthCacheMs?: number;
  liveness?: SourceScanLiveness;
  sourceScans?: SourceScanConfig | null;
  fetchSource?: FetchSource;
  startedAt?: number;
  log?: Logger;
}

export type ClamdHealth = ProbedHealth;

export type HealthProbe = (() => Promise<ClamdHealth>) & { reset?: () => void };

export type CachedHealthProbe = (() => Promise<ClamdHealth>) & { reset: () => void };

function respond(
  res: ServerResponse,
  status: number,
  body: object,
  headers: Record<string, string> = {},
): void {
  if (res.headersSent) return;
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
  logger: Logger,
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
    refuse(res, 503, SCAN_INCOMPLETE);
  }, deadlineMs);
  try {
    const verdict = await scanStream(clamd, req, deadline.signal);
    const ms = Date.now() - started;
    if (verdict.kind === 'clean') {
      logger('info', 'scan_clean', { bytes, ms });
      return respond(res, 200, { safe: true });
    }
    if (verdict.kind === 'infected') {
      logger('warn', 'scan_infected', { bytes, ms, signature: verdict.signature });
      return respond(res, 200, {
        safe: false,
        detail: `ClamAV detected ${verdict.signature}`,
        ...(verdict.signature.startsWith(ENCRYPTED_SIGNATURE_PREFIX)
          ? { reason: 'encrypted' }
          : {}),
      });
    }
    logger('error', 'scan_failed', { bytes, ms, reason: verdict.reason });
  } catch (error) {
    logger('error', 'scan_failed', { bytes, ms: Date.now() - started, reason: reason(error) });
  } finally {
    clearTimeout(timer);
  }
  refuse(res, 503, SCAN_INCOMPLETE);
}

async function probeClamd(clamd: ClamdAddress, deadlineMs: number): Promise<ClamdHealth> {
  const signal = AbortSignal.timeout(deadlineMs);
  const [verdict, signatures] = await Promise.all([
    scanStream(clamd, [EICAR_PROBE], signal).catch(() => null),
    readSignatureStatus(clamd, signal).catch(() => null),
  ]);
  return { scanning: verdict?.kind === 'infected', signatures };
}

export function clamdProbe(
  clamd: ClamdAddress,
  deadlineMs = HEALTH_DEADLINE_MS,
  cacheMs = HEALTH_CACHE_MS,
): CachedHealthProbe {
  let last: { at: number; health: Promise<ClamdHealth> } | null = null;
  const probe = () => {
    const at = Date.now();
    if (!last || at - last.at >= cacheMs) last = { at, health: probeClamd(clamd, deadlineMs) };
    return last.health;
  };
  return Object.assign(probe, {
    reset: () => {
      last = null;
    },
  });
}

export function livenessProbe(
  probe: HealthProbe,
  liveness: SourceScanLiveness,
): () => Promise<ClamdHealth> {
  if (probe.reset) liveness.onStale(probe.reset);
  return async () => {
    const asked = liveness.ask();
    return liveness.observe(await probe(), asked);
  };
}

async function health(
  res: ServerResponse,
  probe: () => Promise<ClamdHealth>,
  now: () => number,
  requireFresh: boolean,
  authorized: boolean,
): Promise<void> {
  const { scanning, signatures } = await probe();
  if (!scanning || !signatures) return respond(res, 503, { status: 'unavailable' });
  const age = now() - signatures.publishedAt.getTime();
  const fresh = age <= SIGNATURE_MAX_AGE_MS;
  const status = fresh ? 'ok' : 'stale';
  respond(
    res,
    fresh || !requireFresh ? 200 : 503,
    authorized
      ? {
          status,
          engine: signatures.engine,
          signatures: {
            version: signatures.version,
            publishedAt: signatures.publishedAt.toISOString(),
            ageHours: Math.floor(age / HOUR_MS),
          },
        }
      : { status },
  );
}

interface SubmitRequest {
  jobId: string;
  sourceUrl: string;
  byteCount: number;
  etag: string;
  mimeType: string;
}

type SourceScanQueue = ScanQueue<SourceScanJob, SourceScanVerdict>;

function headerSafe(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    HEADER_SAFE.test(value)
  );
}

function parseSubmit(value: unknown): SubmitRequest | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const { jobId, sourceUrl, byteCount, etag, mimeType } = body;
  if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) return null;
  if (!headerSafe(sourceUrl, MAX_SOURCE_URL_LENGTH)) return null;
  if (typeof byteCount !== 'number' || !Number.isSafeInteger(byteCount) || byteCount < 1) {
    return null;
  }
  if (!headerSafe(etag, 1024) || !headerSafe(mimeType, 255)) return null;
  return { jobId, sourceUrl, byteCount, etag, mimeType };
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > MAX_SUBMIT_BODY_BYTES) {
      resolve(undefined);
      return;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total <= MAX_SUBMIT_BODY_BYTES) chunks.push(chunk);
    });
    req.on('error', () => resolve(undefined));
    req.on('end', () => {
      if (total > MAX_SUBMIT_BODY_BYTES) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(undefined);
      }
    });
  });
}

function refuseSource(
  res: ServerResponse,
  status: number,
  reason: string,
  headers: Record<string, string> = {},
): void {
  respond(res, status, { reason }, headers);
}

async function submitSourceScan(
  req: IncomingMessage,
  res: ServerResponse,
  config: SourceScanConfig,
  queue: SourceScanQueue,
  logger: Logger,
): Promise<void> {
  const contentType = req.headers['content-type'] ?? '';
  const request = /^application\/json\b/i.test(contentType)
    ? parseSubmit(await readJsonBody(req))
    : null;
  if (!request) return refuseSource(res, 400, 'invalid_request', { Connection: 'close' });

  const checked = checkSourceUrl(request.sourceUrl, config.hosts);
  if (!checked.ok) {
    logger('warn', 'source_scan_refused', { jobId: request.jobId, reason: checked.rule });
    return refuseSource(res, 400, 'source_not_allowed');
  }
  const host = checked.url.hostname;
  if (request.byteCount > config.maxBytes || request.byteCount > config.bytesPerHour) {
    logger('warn', 'source_scan_refused', {
      jobId: request.jobId,
      host,
      byteCount: request.byteCount,
      reason: 'too_large',
    });
    return refuseSource(res, 413, 'too_large');
  }

  const deadlineMs = scanDeadlineMs(request.byteCount, config);
  const submission = queue.submit(request.jobId, request.byteCount, deadlineMs, {
    jobId: request.jobId,
    sourceUrl: checked.url,
    byteCount: request.byteCount,
    etag: request.etag,
    mimeType: request.mimeType,
    deadlineMs,
  });
  if (submission.kind === 'refused') {
    logger('warn', 'source_scan_deferred', {
      jobId: request.jobId,
      host,
      byteCount: request.byteCount,
      reason: submission.reason,
      retryAfterSeconds: submission.retryAfterSeconds,
    });
    return refuseSource(res, 429, submission.reason, {
      'Retry-After': String(submission.retryAfterSeconds),
    });
  }
  if (!submission.repeated) {
    logger('info', 'source_scan_admitted', {
      jobId: request.jobId,
      host,
      byteCount: request.byteCount,
      deadlineMs,
    });
  }
  respond(res, 202, { scanId: submission.job.id, deadlineMs: submission.job.deadlineMs });
}

function readSourceScan(res: ServerResponse, path: string, queue: SourceScanQueue): void {
  let id: string;
  try {
    id = decodeURIComponent(path.slice(SCAN_PATH_PREFIX.length));
  } catch {
    id = '';
  }
  const job = JOB_ID.test(id) ? queue.get(id) : undefined;
  if (!job) return respond(res, 200, { status: 'unknown' });
  respond(res, 200, {
    status: job.status,
    deadlineMs: job.deadlineMs,
    ...(job.status === 'done' && job.verdict ? { verdict: job.verdict } : {}),
  });
}

function sourceScanRoutes(
  options: ScannerOptions,
  config: SourceScanConfig,
  liveness: SourceScanLiveness,
  now: () => number,
  logger: Logger,
): (req: IncomingMessage, res: ServerResponse, path: string) => boolean {
  const fetchSource: FetchSource = options.fetchSource ?? ((url, init) => fetch(url, init));
  const queue: SourceScanQueue = createScanQueue<SourceScanJob, SourceScanVerdict>(
    {
      concurrency: config.concurrency,
      queueMax: config.queueMax,
      budget: createSourceBudget({
        bytesPerHour: config.bytesPerHour,
        startedAt: options.startedAt ?? now(),
        now,
      }),
      now,
    },
    (job) => runSourceScan(job, { clamd: options.clamd, fetchSource, liveness, log: logger, now }),
    (error, job) => {
      logger('error', 'source_scan_crashed', {
        jobId: job.jobId,
        errorClass: error instanceof Error ? error.name : typeof error,
      });
      return {
        jobId: job.jobId,
        outcome: 'incomplete',
        reason: 'scan_failed',
        sha256: '',
        bytes: 0,
        etag: '',
        ms: 0,
      };
    },
  );
  const isAuthorized = bearerAuthorizer(options.tokens);

  return (req, res, path) => {
    const submitting = path === '/v2/scans' && req.method === 'POST';
    const polling = path.startsWith(SCAN_PATH_PREFIX) && req.method === 'GET';
    const describing = path === '/v2/capability' && req.method === 'GET';
    if (!submitting && !polling && !describing) return false;
    if (!isAuthorized(req.headers.authorization)) {
      logger('warn', 'scan_unauthorized');
      refuseSource(res, 401, 'unauthorized', { Connection: 'close' });
      return true;
    }
    if (submitting) void submitSourceScan(req, res, config, queue, logger);
    else if (polling) readSourceScan(res, path, queue);
    else {
      respond(res, 200, {
        protocol: SOURCE_SCAN_PROTOCOL,
        maxSourceScanBytes: Math.min(config.maxBytes, config.bytesPerHour),
        queueDepth: queue.depth(),
        running: queue.running(),
      });
    }
    return true;
  };
}

export function createScannerServer(options: ScannerOptions): Server {
  const isAuthorized = bearerAuthorizer(options.tokens);
  const maxBytes = options.maxBytes ?? MAX_SCAN_BYTES;
  const deadlineMs = options.scanDeadlineMs ?? SCAN_DEADLINE_MS;
  const now = options.now ?? Date.now;
  const logger = options.log ?? log;
  const liveness = options.liveness ?? createSourceScanLiveness();
  const probe = livenessProbe(
    options.probe ??
      clamdProbe(
        options.clamd,
        options.healthDeadlineMs ?? HEALTH_DEADLINE_MS,
        options.healthCacheMs ?? HEALTH_CACHE_MS,
      ),
    liveness,
  );
  const sourceScans = options.sourceScans
    ? sourceScanRoutes(options, options.sourceScans, liveness, now, logger)
    : null;

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?', 1)[0] ?? '/';
    if (path === '/scan' && req.method === 'POST') {
      if (!isAuthorized(req.headers.authorization)) {
        logger('warn', 'scan_unauthorized');
        return refuse(res, 401, 'Unauthorized');
      }
      void scan(req, res, options.clamd, maxBytes, deadlineMs, logger);
      return;
    }
    if (
      (path === '/health' || path === '/health/signatures') &&
      (req.method === 'GET' || req.method === 'HEAD')
    ) {
      void health(
        res,
        probe,
        now,
        path === '/health/signatures',
        isAuthorized(req.headers.authorization),
      );
      return;
    }
    if (sourceScans?.(req, res, path)) return;
    refuse(res, 404, 'Not found');
  });
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  return server;
}
