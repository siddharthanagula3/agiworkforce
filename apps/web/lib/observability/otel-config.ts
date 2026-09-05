export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export interface OtelExportConfig {
  readonly tracesEndpoint: string;
  readonly serviceName: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly sampleRatio: number | null;
}

export const OTEL_ENDPOINT_ENV = 'AGI_OTEL_EXPORTER_ENDPOINT';
export const OTEL_SERVICE_NAME_ENV = 'AGI_OTEL_SERVICE_NAME';
export const OTEL_HEADERS_ENV = 'AGI_OTEL_HEADERS';
export const OTEL_SAMPLE_RATIO_ENV = 'AGI_OTEL_SAMPLE_RATIO';

export const DEFAULT_OTEL_SERVICE_NAME = 'agiworkforce-web';

const OTLP_TRACES_PATH = 'v1/traces';
const HEADER_PAIR_SEPARATOR = ',';
const HEADER_KEY_VALUE_SEPARATOR = '=';
const TRAILING_SLASHES = /\/+$/u;
const MIN_SAMPLE_RATIO = 0;
const MAX_SAMPLE_RATIO = 1;

function toTracesEndpoint(endpoint: string): string {
  const base = endpoint.replace(TRAILING_SLASHES, '');
  return base.endsWith(`/${OTLP_TRACES_PATH}`) ? base : `${base}/${OTLP_TRACES_PATH}`;
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

export function parseOtelSampleRatio(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(MAX_SAMPLE_RATIO, Math.max(MIN_SAMPLE_RATIO, parsed));
}

export function resolveOtelExportConfig(env: EnvironmentSource): OtelExportConfig | null {
  const endpoint = env[OTEL_ENDPOINT_ENV]?.trim();
  if (!endpoint) return null;
  try {
    void new URL(endpoint);
  } catch {
    return null;
  }
  return {
    tracesEndpoint: toTracesEndpoint(endpoint),
    serviceName: env[OTEL_SERVICE_NAME_ENV]?.trim() || DEFAULT_OTEL_SERVICE_NAME,
    headers: parseOtelHeaders(env[OTEL_HEADERS_ENV]),
    sampleRatio: parseOtelSampleRatio(env[OTEL_SAMPLE_RATIO_ENV]),
  };
}
