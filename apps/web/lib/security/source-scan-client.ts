import 'server-only';

import type { ChatFileIntakeRefusalCode } from '@agiworkforce/cloud-contracts';

export const SOURCE_SCAN_PROTOCOL = 2;
export const SCANNER_CAPABILITY_TIMEOUT_MS = 1_500;

const SCANNER_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_AFTER_MS = 30_000;
const MIN_RETRY_AFTER_MS = 1_000;
const LEGACY_SCAN_PATH = '/scan';
const JOB_ID = /^[A-Za-z0-9_-]{1,128}:\d{1,6}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const DEFERRAL_REASONS = ['queue_full', 'source_budget'] as const;
const VERDICT_OUTCOMES = ['clean', 'infected', 'incomplete'] as const;
const POLL_STATUSES = ['queued', 'scanning', 'done', 'unknown'] as const;

export type SourceScanDeferralReason = (typeof DEFERRAL_REASONS)[number];
export type SourceScanOutcome = (typeof VERDICT_OUTCOMES)[number];

export interface SourceScanVerdict {
  jobId: string;
  outcome: SourceScanOutcome;
  reason: string | null;
  sha256: string;
  bytes: number;
  etag: string;
  ms: number;
}

export interface SourceScanRequest {
  jobId: string;
  sourceUrl: string;
  byteCount: number;
  etag: string;
  mimeType: string;
}

export type SourceScanSubmitAnswer =
  | { kind: 'accepted'; scanId: string; deadlineMs: number | null }
  | { kind: 'deferred'; reason: SourceScanDeferralReason; retryAfterMs: number }
  | { kind: 'refused'; status: number; reason: string | null }
  | { kind: 'unavailable'; detail: string };

export type SourceScanPollAnswer =
  | { kind: 'queued'; deadlineMs: number | null }
  | { kind: 'scanning'; deadlineMs: number | null }
  | { kind: 'unknown' }
  | { kind: 'done'; deadlineMs: number | null; verdict: SourceScanVerdict }
  | { kind: 'unavailable'; detail: string };

export interface ScannerCapability {
  protocol: typeof SOURCE_SCAN_PROTOCOL;
  maxSourceScanBytes: number;
  queueDepth: number;
  running: number;
}

/**
 * What the intake does with a finished scan. `retry` uses an attempt and is
 * never final: a scan that could not finish says nothing about the bytes.
 */
export type SourceScanJudgement =
  | { kind: 'clean' }
  | { kind: 'rejected'; refusalCode: ChatFileIntakeRefusalCode }
  | { kind: 'retry' };

export interface SourceScanClientOptions {
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
}

const INFECTED_REASON_CODES: Readonly<Record<string, ChatFileIntakeRefusalCode>> = Object.freeze({
  encrypted: 'encrypted',
  limits_exceeded: 'limits_exceeded',
  active_pdf: 'active_pdf',
  size_mismatch: 'size_mismatch',
});

function readEnv(options: SourceScanClientOptions, name: string): string | undefined {
  const value = (options.env ?? process.env)[name]?.trim();
  return value ? value : undefined;
}

/**
 * The protocol 2 routes live beside the legacy `/scan` route on the same
 * scanner, so their base is the configured scan URL without that path.
 */
export function sourceScanEndpoint(
  path: string,
  options: SourceScanClientOptions = {},
): URL | null {
  const configured = readEnv(options, 'UPLOAD_SCAN_WEBHOOK_URL');
  if (!configured) return null;
  let base: URL;
  try {
    base = new URL(configured);
  } catch {
    return null;
  }
  if (base.protocol !== 'https:' && base.protocol !== 'http:') return null;
  const basePath = base.pathname.endsWith(LEGACY_SCAN_PATH)
    ? base.pathname.slice(0, -LEGACY_SCAN_PATH.length)
    : base.pathname.replace(/\/+$/, '');
  return new URL(`${basePath}${path}`, base.origin);
}

function authorizationHeaders(options: SourceScanClientOptions): Record<string, string> {
  const token = readEnv(options, 'UPLOAD_SCAN_WEBHOOK_TOKEN');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = nonNegativeInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown_error';
}

export function parseRetryAfterMs(header: string | null, nowMs: number = Date.now()): number {
  const value = header?.trim();
  if (!value) return DEFAULT_RETRY_AFTER_MS;
  if (/^\d+$/.test(value)) {
    return Math.max(MIN_RETRY_AFTER_MS, Number.parseInt(value, 10) * 1_000);
  }
  const at = Date.parse(value);
  if (Number.isNaN(at)) return DEFAULT_RETRY_AFTER_MS;
  return Math.max(MIN_RETRY_AFTER_MS, at - nowMs);
}

export function parseSourceScanVerdict(value: unknown): SourceScanVerdict | null {
  if (!isRecord(value)) return null;
  const outcome = oneOf(value['outcome'], VERDICT_OUTCOMES);
  const jobId = value['jobId'];
  const sha256 = value['sha256'];
  const etag = value['etag'];
  const bytes = nonNegativeInteger(value['bytes']);
  const ms = nonNegativeInteger(value['ms']);
  const reason = value['reason'];
  if (
    outcome === null ||
    typeof jobId !== 'string' ||
    !JOB_ID.test(jobId) ||
    typeof sha256 !== 'string' ||
    (sha256 !== '' && !SHA256_HEX.test(sha256)) ||
    typeof etag !== 'string' ||
    bytes === null ||
    ms === null ||
    (reason !== undefined && typeof reason !== 'string')
  ) {
    return null;
  }
  return { jobId, outcome, reason: reason ?? null, sha256, bytes, etag, ms };
}

export function judgeSourceScanVerdict(verdict: SourceScanVerdict): SourceScanJudgement {
  if (verdict.outcome === 'clean') {
    return SHA256_HEX.test(verdict.sha256) && verdict.bytes > 0 && verdict.etag !== ''
      ? { kind: 'clean' }
      : { kind: 'retry' };
  }
  if (verdict.outcome === 'infected') {
    const code = verdict.reason === null ? undefined : INFECTED_REASON_CODES[verdict.reason];
    return { kind: 'rejected', refusalCode: code ?? 'malware' };
  }
  if (verdict.reason === 'source_changed') {
    return { kind: 'rejected', refusalCode: 'changed_during_check' };
  }
  return { kind: 'retry' };
}

export async function submitSourceScan(
  request: SourceScanRequest,
  options: SourceScanClientOptions = {},
): Promise<SourceScanSubmitAnswer> {
  if (!JOB_ID.test(request.jobId)) {
    return { kind: 'refused', status: 400, reason: 'invalid_request' };
  }
  const endpoint = sourceScanEndpoint('/v2/scans', options);
  if (!endpoint) return { kind: 'unavailable', detail: 'scanner_not_configured' };
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(endpoint, {
      method: 'POST',
      headers: { ...authorizationHeaders(options), 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(SCANNER_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return { kind: 'unavailable', detail: errorDetail(error) };
  }
  const body = await readJson(response);
  if (response.status === 202) {
    const scanId = isRecord(body) ? body['scanId'] : undefined;
    if (typeof scanId !== 'string' || scanId !== request.jobId) {
      return { kind: 'unavailable', detail: 'malformed_answer' };
    }
    return {
      kind: 'accepted',
      scanId,
      deadlineMs: isRecord(body) ? positiveInteger(body['deadlineMs']) : null,
    };
  }
  const reason = isRecord(body) && typeof body['reason'] === 'string' ? body['reason'] : null;
  if (response.status === 429) {
    const deferral = oneOf(reason, DEFERRAL_REASONS);
    return {
      kind: 'deferred',
      reason: deferral ?? 'queue_full',
      retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')),
    };
  }
  if (response.status >= 400 && response.status < 500) {
    return { kind: 'refused', status: response.status, reason };
  }
  return { kind: 'unavailable', detail: `status_${response.status}` };
}

export async function readSourceScan(
  jobId: string,
  options: SourceScanClientOptions = {},
): Promise<SourceScanPollAnswer> {
  if (!JOB_ID.test(jobId)) return { kind: 'unknown' };
  const endpoint = sourceScanEndpoint(`/v2/scans/${encodeURIComponent(jobId)}`, options);
  if (!endpoint) return { kind: 'unavailable', detail: 'scanner_not_configured' };
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(endpoint, {
      method: 'GET',
      headers: authorizationHeaders(options),
      signal: AbortSignal.timeout(SCANNER_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return { kind: 'unavailable', detail: errorDetail(error) };
  }
  if (response.status !== 200) return { kind: 'unavailable', detail: `status_${response.status}` };
  const body = await readJson(response);
  const status = isRecord(body) ? oneOf(body['status'], POLL_STATUSES) : null;
  if (!isRecord(body) || status === null) {
    return { kind: 'unavailable', detail: 'malformed_answer' };
  }
  const deadlineMs = positiveInteger(body['deadlineMs']);
  if (status === 'unknown') return { kind: 'unknown' };
  if (status === 'queued' || status === 'scanning') return { kind: status, deadlineMs };
  const verdict = parseSourceScanVerdict(body['verdict']);
  if (verdict === null || verdict.jobId !== jobId) {
    return { kind: 'unavailable', detail: 'malformed_answer' };
  }
  return { kind: 'done', deadlineMs, verdict };
}

/** Any failure, a slow answer included, means the scanner speaks protocol 1 or is not there. */
export async function readScannerCapability(
  options: SourceScanClientOptions = {},
): Promise<ScannerCapability | null> {
  const endpoint = sourceScanEndpoint('/v2/capability', options);
  if (!endpoint) return null;
  try {
    const response = await (options.fetch ?? fetch)(endpoint, {
      method: 'GET',
      headers: authorizationHeaders(options),
      signal: AbortSignal.timeout(SCANNER_CAPABILITY_TIMEOUT_MS),
    });
    if (response.status !== 200) return null;
    const body = await readJson(response);
    if (!isRecord(body) || body['protocol'] !== SOURCE_SCAN_PROTOCOL) return null;
    const maxSourceScanBytes = positiveInteger(body['maxSourceScanBytes']);
    const queueDepth = nonNegativeInteger(body['queueDepth']);
    const running = nonNegativeInteger(body['running']);
    if (maxSourceScanBytes === null || queueDepth === null || running === null) return null;
    return { protocol: SOURCE_SCAN_PROTOCOL, maxSourceScanBytes, queueDepth, running };
  } catch {
    return null;
  }
}
