import { isIP } from 'node:net';

export const MIN_TOKEN_LENGTH = 32;
const DEFAULT_PORT = 8080;
const MIB = 1024 * 1024;

export interface ScannerConfig {
  tokens: string[];
  port: number;
}

export interface SourceScanLimits {
  maxBytes: number;
  concurrency: number;
  queueMax: number;
  bytesPerHour: number;
  baseMs: number;
  minBytesPerSec: number;
}

export interface SourceScanConfig extends SourceScanLimits {
  hosts: readonly string[];
}

export const SOURCE_SCAN_DEFAULTS: Readonly<SourceScanLimits> = {
  maxBytes: 520 * MIB,
  concurrency: 1,
  queueMax: 20,
  bytesPerHour: 2 * 1024 * MIB,
  baseMs: 30_000,
  minBytesPerSec: (10 * MIB) / 2,
};

const SOURCE_SCAN_VARIABLES: Readonly<Record<keyof SourceScanLimits, string>> = {
  maxBytes: 'MAX_SOURCE_SCAN_BYTES',
  concurrency: 'SCAN_SOURCE_CONCURRENCY',
  queueMax: 'SCAN_QUEUE_MAX',
  bytesPerHour: 'SCAN_SOURCE_BYTES_PER_HOUR',
  baseMs: 'SCAN_BASE_MS',
  minBytesPerSec: 'SCAN_MIN_BYTES_PER_SEC',
};

export const CLAMD_SOURCE_SCAN_SETTINGS: Readonly<Record<string, string>> = {
  StreamMaxLength: '520M',
  MaxFileSize: '520M',
  MaxScanSize: '1024M',
  PCREMaxFileSize: '520M',
  MaxEmbeddedPE: '520M',
  MaxHTMLNormalize: '40M',
  MaxHTMLNoTags: '8M',
  MaxScriptNormalize: '20M',
  MaxZipTypeRcg: '1M',
  MaxRecursion: '17',
  MaxFiles: '10000',
  MaxScanTime: '600000',
  ReadTimeout: '300',
  AlertExceedsMax: 'yes',
  AlertEncrypted: 'yes',
  TemporaryDirectory: '/var/tmp/clamd',
};

const CLAMD_SIZE = /^(\d+)([KM]?)$/i;
const HOST_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export function clamdSizeBytes(value: string): number {
  const match = CLAMD_SIZE.exec(value.trim());
  if (!match?.[1]) throw new Error(`Not a clamd size: ${value}`);
  const unit = match[2]?.toUpperCase();
  return Number(match[1]) * (unit === 'M' ? MIB : unit === 'K' ? 1024 : 1);
}

export function loadConfig(env: NodeJS.ProcessEnv): ScannerConfig {
  const current = env['UPLOAD_SCAN_WEBHOOK_TOKEN']?.trim();
  const previous = env['UPLOAD_SCAN_WEBHOOK_TOKEN_PREVIOUS']?.trim();
  const tokens = [current, previous].filter((token): token is string => Boolean(token));
  if (!current || tokens.some((token) => token.length < MIN_TOKEN_LENGTH)) {
    throw new Error(
      `UPLOAD_SCAN_WEBHOOK_TOKEN (and UPLOAD_SCAN_WEBHOOK_TOKEN_PREVIOUS when set) must be at least ${MIN_TOKEN_LENGTH} characters; the scanner never serves unauthenticated requests`,
    );
  }
  const port = Number(env['PORT'] ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port <= 0) throw new Error('PORT must be a port number');
  return { tokens, port };
}

function sourceHost(entry: string): string {
  const host = entry.toLowerCase();
  const labels = host.split('.');
  if (isIP(host) !== 0 || labels.length < 2 || !labels.every((label) => HOST_LABEL.test(label))) {
    throw new Error(
      `UPLOAD_SCAN_SOURCE_HOSTS must list host names only (no scheme, port, path or IP address): ${entry}`,
    );
  }
  return host;
}

function positiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive whole number`);
  }
  return value;
}

export function loadSourceScanConfig(env: NodeJS.ProcessEnv): SourceScanConfig | null {
  const entries = (env['UPLOAD_SCAN_SOURCE_HOSTS'] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) return null;

  const limits = Object.fromEntries(
    (Object.keys(SOURCE_SCAN_VARIABLES) as Array<keyof SourceScanLimits>).map((key) => [
      key,
      positiveInteger(env, SOURCE_SCAN_VARIABLES[key], SOURCE_SCAN_DEFAULTS[key]),
    ]),
  ) as unknown as SourceScanLimits;

  const streamMax = clamdSizeBytes(CLAMD_SOURCE_SCAN_SETTINGS['StreamMaxLength'] ?? '0');
  if (limits.maxBytes > streamMax) {
    throw new Error(
      `MAX_SOURCE_SCAN_BYTES must not exceed clamd's StreamMaxLength (${streamMax} bytes), or clamd would close the stream before the end`,
    );
  }
  return { ...limits, hosts: [...new Set(entries.map(sourceHost))] };
}
