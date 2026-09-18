export const OTEL_ENDPOINT_ENV = 'AGI_OTEL_EXPORTER_ENDPOINT';
export const OTEL_SERVICE_NAME_ENV = 'AGI_OTEL_SERVICE_NAME';
export const OTEL_HEADERS_ENV = 'AGI_OTEL_HEADERS';
export const OTEL_SAMPLE_RATIO_ENV = 'AGI_OTEL_SAMPLE_RATIO';
export const OTEL_SLOW_SPAN_MS_ENV = 'AGI_OTEL_SLOW_SPAN_MS';

export const DEFAULT_SERVICE_NAME = 'agiworkforce-signaling';
export const DEFAULT_SLOW_SPAN_THRESHOLD_MS = 1_000;
export const DEFAULT_EXPORT_INTERVAL_MS = 60_000;

const OTLP_TRACES_PATH = 'v1/traces';
const OTLP_METRICS_PATH = 'v1/metrics';
const OTLP_SIGNAL_SUFFIX = /\/v1\/(?:traces|metrics)$/u;
const TRAILING_SLASHES = /\/+$/u;
const HEADER_PAIR_SEPARATOR = ',';
const HEADER_KEY_VALUE_SEPARATOR = '=';
const MIN_SAMPLE_RATIO = 0;
const MAX_SAMPLE_RATIO = 1;
const TRACE_ID_TAIL_LENGTH = 8;
const TRACE_ID_TAIL_PATTERN = /^[0-9a-f]{8}$/u;
const TRACE_ID_TAIL_SPACE = 0x1_0000_0000;

export interface OtelExportConfig {
  readonly tracesEndpoint: string;
  readonly metricsEndpoint: string;
  readonly serviceName: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly sampleRatio: number;
  readonly slowSpanThresholdMs: number;
}

function toSignalEndpoint(endpoint: string, signalPath: string): string {
  const base = endpoint.replace(TRAILING_SLASHES, '').replace(OTLP_SIGNAL_SUFFIX, '');
  return `${base}/${signalPath}`;
}

export function parseOtelHeaders(raw: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!raw) return headers;
  for (const pair of raw.split(HEADER_PAIR_SEPARATOR)) {
    const separator = pair.indexOf(HEADER_KEY_VALUE_SEPARATOR);
    if (separator <= 0) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (key && value) headers[key] = value;
  }
  return headers;
}

export function parseSampleRatio(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return MAX_SAMPLE_RATIO;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return MAX_SAMPLE_RATIO;
  return Math.min(MAX_SAMPLE_RATIO, Math.max(MIN_SAMPLE_RATIO, parsed));
}

export function parseSlowSpanThresholdMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_SLOW_SPAN_THRESHOLD_MS;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SLOW_SPAN_THRESHOLD_MS;
  return parsed;
}

export function resolveOtelExportConfig(env: NodeJS.ProcessEnv): OtelExportConfig | null {
  const endpoint = env[OTEL_ENDPOINT_ENV]?.trim();
  if (!endpoint) return null;
  try {
    void new URL(endpoint);
  } catch {
    return null;
  }
  return {
    tracesEndpoint: toSignalEndpoint(endpoint, OTLP_TRACES_PATH),
    metricsEndpoint: toSignalEndpoint(endpoint, OTLP_METRICS_PATH),
    serviceName: env[OTEL_SERVICE_NAME_ENV]?.trim() || DEFAULT_SERVICE_NAME,
    headers: parseOtelHeaders(env[OTEL_HEADERS_ENV]),
    sampleRatio: parseSampleRatio(env[OTEL_SAMPLE_RATIO_ENV]),
    slowSpanThresholdMs: parseSlowSpanThresholdMs(env[OTEL_SLOW_SPAN_MS_ENV]),
  };
}

export function traceIdInRatio(traceId: string, ratio: number): boolean {
  if (ratio >= MAX_SAMPLE_RATIO) return true;
  if (ratio <= MIN_SAMPLE_RATIO) return false;
  const tail = traceId.slice(-TRACE_ID_TAIL_LENGTH).toLowerCase();
  if (!TRACE_ID_TAIL_PATTERN.test(tail)) return false;
  return Number.parseInt(tail, 16) < ratio * TRACE_ID_TAIL_SPACE;
}

// The web tier decides the same way: keep the failures, the slow tail and a
// trace-id-keyed share of the rest, so both tiers agree on which traces survive.
export function keepSpanForExport(input: {
  traceId: string;
  errored: boolean;
  durationMs: number;
  ratio: number;
  slowThresholdMs: number;
}): boolean {
  if (input.errored) return true;
  if (Number.isFinite(input.durationMs) && input.durationMs >= input.slowThresholdMs) return true;
  return traceIdInRatio(input.traceId, input.ratio);
}
