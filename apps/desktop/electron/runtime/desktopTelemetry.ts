import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The shell's own operational record. Every line is a closed vocabulary: there
 * is no field a prompt, a file path, an address or an exception can ride in on.
 */
export const DESKTOP_TELEMETRY_DOMAINS = [
  'launch',
  'local_daemon',
  'local_store_migration',
  'local_inference',
  'cloud_request',
  'voice_shortcut',
  'desktop_control',
  'updater',
  'sync',
  'crash',
] as const;

export type DesktopTelemetryDomain = (typeof DESKTOP_TELEMETRY_DOMAINS)[number];

export const DESKTOP_TELEMETRY_OUTCOMES = ['started', 'ok', 'refused', 'failed'] as const;

export type DesktopTelemetryOutcome = (typeof DESKTOP_TELEMETRY_OUTCOMES)[number];

export const DESKTOP_TELEMETRY_CAUSES = [
  'cancelled',
  'crashed',
  'killed',
  'network',
  'not_configured',
  'out_of_memory',
  'parse',
  'permission_denied',
  'timeout',
  'unresponsive',
  'unsupported',
  'unknown',
] as const;

export type DesktopTelemetryCause = (typeof DESKTOP_TELEMETRY_CAUSES)[number];

/** Segments every line, so one channel's regression is never read off another's. */
export interface DesktopRelease {
  readonly version: string;
  readonly channel: string;
  readonly platform: string;
  readonly arch: string;
}

export interface DesktopTelemetryEvent {
  readonly domain: DesktopTelemetryDomain;
  readonly outcome: DesktopTelemetryOutcome;
  readonly cause?: DesktopTelemetryCause;
  readonly durationMs?: number;
}

export interface DesktopTelemetryRecord extends DesktopTelemetryEvent {
  readonly at: string;
  readonly version: string;
  readonly channel: string;
  readonly platform: string;
  readonly arch: string;
}

export type DesktopDomainHealth = 'idle' | 'healthy' | 'degraded';

export interface DesktopDomainCounts {
  readonly domain: DesktopTelemetryDomain;
  readonly started: number;
  readonly ok: number;
  readonly refused: number;
  readonly failed: number;
  readonly health: DesktopDomainHealth;
  readonly lastOutcome: DesktopTelemetryOutcome | null;
  readonly lastCause: DesktopTelemetryCause | null;
}

export interface DesktopDiagnostics {
  readonly release: DesktopRelease;
  readonly collectedAt: string;
  readonly domains: readonly DesktopDomainCounts[];
  readonly unhealthy: readonly DesktopTelemetryDomain[];
}

export const DESKTOP_TELEMETRY_LOG_NAME = 'desktop-telemetry.ndjson';
const MAX_LOG_BYTES = 512 * 1024;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

function isDomain(value: unknown): value is DesktopTelemetryDomain {
  return (
    typeof value === 'string' && (DESKTOP_TELEMETRY_DOMAINS as readonly string[]).includes(value)
  );
}

function isOutcome(value: unknown): value is DesktopTelemetryOutcome {
  return (
    typeof value === 'string' && (DESKTOP_TELEMETRY_OUTCOMES as readonly string[]).includes(value)
  );
}

function isCause(value: unknown): value is DesktopTelemetryCause {
  return (
    typeof value === 'string' && (DESKTOP_TELEMETRY_CAUSES as readonly string[]).includes(value)
  );
}

function normalizeDuration(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > MAX_DURATION_MS) return undefined;
  return Math.round(value);
}

/**
 * Builds the record actually written. An unknown domain, outcome or cause is
 * dropped rather than written through, so the file can never hold a token the
 * reader has no meaning for.
 */
export function telemetryRecord(
  release: DesktopRelease,
  event: DesktopTelemetryEvent,
  at: number,
): DesktopTelemetryRecord | null {
  if (!isDomain(event.domain) || !isOutcome(event.outcome)) return null;
  const cause = isCause(event.cause) ? event.cause : undefined;
  const durationMs = normalizeDuration(event.durationMs);
  return {
    at: new Date(at).toISOString(),
    version: release.version,
    channel: release.channel,
    platform: release.platform,
    arch: release.arch,
    domain: event.domain,
    outcome: event.outcome,
    ...(cause ? { cause } : {}),
    ...(durationMs === undefined ? {} : { durationMs }),
  };
}

export function formatTelemetryLine(record: DesktopTelemetryRecord): string {
  return `${JSON.stringify(record)}\n`;
}

/**
 * A domain is degraded when its most recent outcome was a failure or a refusal,
 * so a service that recovered is not reported as broken for the rest of the run.
 */
function healthOf(lastOutcome: DesktopTelemetryOutcome | null): DesktopDomainHealth {
  if (lastOutcome === null) return 'idle';
  return lastOutcome === 'failed' || lastOutcome === 'refused' ? 'degraded' : 'healthy';
}

export interface DesktopTelemetryOptions {
  readonly release: DesktopRelease;
  readonly write?: (line: string) => void;
  readonly now?: () => number;
}

export interface DesktopTelemetry {
  record: (event: DesktopTelemetryEvent) => DesktopTelemetryRecord | null;
  diagnostics: () => DesktopDiagnostics;
  reset: () => void;
}

interface MutableCounts {
  started: number;
  ok: number;
  refused: number;
  failed: number;
  lastOutcome: DesktopTelemetryOutcome | null;
  lastCause: DesktopTelemetryCause | null;
}

function emptyCounts(): MutableCounts {
  return { started: 0, ok: 0, refused: 0, failed: 0, lastOutcome: null, lastCause: null };
}

export function createDesktopTelemetry(options: DesktopTelemetryOptions): DesktopTelemetry {
  const now = options.now ?? Date.now;
  const counts = new Map<DesktopTelemetryDomain, MutableCounts>();

  function countsFor(domain: DesktopTelemetryDomain): MutableCounts {
    const existing = counts.get(domain);
    if (existing) return existing;
    const fresh = emptyCounts();
    counts.set(domain, fresh);
    return fresh;
  }

  function record(event: DesktopTelemetryEvent): DesktopTelemetryRecord | null {
    const entry = telemetryRecord(options.release, event, now());
    if (!entry) return null;
    const domain = countsFor(entry.domain);
    domain[entry.outcome] += 1;
    domain.lastOutcome = entry.outcome;
    domain.lastCause = entry.cause ?? null;
    options.write?.(formatTelemetryLine(entry));
    return entry;
  }

  function diagnostics(): DesktopDiagnostics {
    const domains = DESKTOP_TELEMETRY_DOMAINS.map((domain) => {
      const entry = counts.get(domain) ?? emptyCounts();
      return {
        domain,
        started: entry.started,
        ok: entry.ok,
        refused: entry.refused,
        failed: entry.failed,
        health: healthOf(entry.lastOutcome),
        lastOutcome: entry.lastOutcome,
        lastCause: entry.lastCause,
      };
    });
    return {
      release: options.release,
      collectedAt: new Date(now()).toISOString(),
      domains,
      unhealthy: domains
        .filter((entry) => entry.health === 'degraded')
        .map((entry) => entry.domain),
    };
  }

  return { record, diagnostics, reset: () => counts.clear() };
}

/**
 * Appends to a bounded file beside the app's other logs, rotating once so a long
 * running shell cannot grow one without limit and a crash still has its history.
 */
export function createTelemetryLogWriter(
  directory: string,
  maxBytes = MAX_LOG_BYTES,
): (line: string) => void {
  const path = join(directory, DESKTOP_TELEMETRY_LOG_NAME);
  let prepared = false;
  return (line: string) => {
    try {
      if (!prepared) {
        mkdirSync(directory, { recursive: true });
        prepared = true;
      }
      let size = 0;
      try {
        size = statSync(path).size;
      } catch {
        size = 0;
      }
      if (size + line.length > maxBytes) renameSync(path, `${path}.1`);
      appendFileSync(path, line, 'utf8');
    } catch {
      prepared = false;
    }
  };
}
