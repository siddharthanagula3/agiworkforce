import * as vscode from 'vscode';
import { redactWithPolicy } from '@agiworkforce/utils/secret-redaction';
import { getExtensionVersion } from '../platform/version';
import { Config } from '../platform/config';

/**
 * Returns a copy of the input with any matched secret replaced by `[REDACTED]`,
 * under the shared telemetry redaction policy. Safe to call on any string.
 */
export function redactTelemetryText(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return input;
  return redactWithPolicy(input, 'telemetry');
}

function redactProperties(props: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) {
    out[k] = typeof v === 'string' ? redactTelemetryText(v) : v;
  }
  return out;
}

const ALLOWED_TELEMETRY_HOSTS = new Set<string>(['telemetry.agiworkforce.com', 'agiworkforce.com']);
const LOOPBACK_TELEMETRY_HOSTS = new Set<string>(['localhost', '127.0.0.1', '[::1]']);

function isAllowedTelemetryEndpoint(url: string, allowLoopback: boolean): boolean {
  try {
    const parsed = new URL(url);
    if (ALLOWED_TELEMETRY_HOSTS.has(parsed.hostname)) return true;
    return allowLoopback && LOOPBACK_TELEMETRY_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

const TELEMETRY_FLUSH_INTERVAL_MS = 30_000;
const TELEMETRY_BATCH_MAX = 50;

let logger: vscode.TelemetryLogger | undefined;
let sessionId: string | undefined;

class TelemetryBatcher implements vscode.Disposable {
  private buffer: Array<Record<string, unknown>> = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;

  constructor(private readonly send: (payload: Record<string, unknown>) => void) {
    this.timer = setInterval(() => this.flush(), TELEMETRY_FLUSH_INTERVAL_MS);
  }

  enqueue(event: Record<string, unknown>): void {
    if (this.disposed) return;
    this.buffer.push(event);
    if (this.buffer.length >= TELEMETRY_BATCH_MAX) {
      this.flush();
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return;
    const events = this.buffer;
    this.buffer = [];
    this.send({
      batch: events,
      batchSize: events.length,
      flushedAt: new Date().toISOString(),
    });
  }

  size(): number {
    return this.buffer.length;
  }

  dispose(): void {
    this.flush();
    this.disposed = true;
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

let batcher: TelemetryBatcher | undefined;

export function __resetTelemetryForTests(): void {
  batcher?.dispose();
  batcher = undefined;
  logger = undefined;
  sessionId = undefined;
}

function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isExtensionTelemetryEnabled(): boolean {
  return Config.telemetryEnabled();
}

function getCommonProperties(): Record<string, string> {
  return {
    sessionId: sessionId ?? 'unknown',
    extensionVersion: getExtensionVersion(),
    vscodeVersion: vscode.version,
    platform: process.platform,
  };
}

export function activate(context: vscode.ExtensionContext): vscode.Disposable {
  sessionId = generateSessionId();

  const telemetryEndpoint = Config.telemetryEndpoint();
  const allowLoopback = context.extensionMode !== vscode.ExtensionMode.Production;

  if (!isAllowedTelemetryEndpoint(telemetryEndpoint, allowLoopback)) {
    console.warn(
      `[AGI Workforce] Telemetry endpoint "${telemetryEndpoint}" is not in the allowed domain list. Telemetry is disabled.`,
    );
  }

  function postBatch(payload: Record<string, unknown>): void {
    if (!vscode.env.isTelemetryEnabled) return;
    if (!telemetryEndpoint) return;
    if (!isAllowedTelemetryEndpoint(telemetryEndpoint, allowLoopback)) return;
    try {
      void fetch(telemetryEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {
      // Synchronous errors (e.g. JSON.stringify failure) are also swallowed.
    }
  }

  batcher = new TelemetryBatcher(postBatch);

  const sender: vscode.TelemetrySender = {
    sendEventData(eventName: string, data?: Record<string, unknown>): void {
      batcher?.enqueue({
        type: 'event',
        eventName,
        data: data ?? {},
        timestamp: new Date().toISOString(),
        extensionVersion: getExtensionVersion(),
        vscodeVersion: vscode.version,
        sessionId: sessionId ?? 'unknown',
      });
    },
    sendErrorData(error: Error, data?: Record<string, unknown>): void {
      batcher?.enqueue({
        type: 'error',
        errorName: error.name,
        errorMessage: error.message,
        data: data ?? {},
        timestamp: new Date().toISOString(),
        extensionVersion: getExtensionVersion(),
        vscodeVersion: vscode.version,
        sessionId: sessionId ?? 'unknown',
      });
    },
  };

  const innerLogger = vscode.env.createTelemetryLogger(sender, {
    ignoreBuiltInCommonProperties: false,
    ignoreUnhandledErrors: true,
  });

  const localBatcher = batcher;
  logger = innerLogger;
  const composite: vscode.Disposable = {
    dispose() {
      localBatcher?.dispose();
      innerLogger.dispose();
    },
  };

  return composite;
}

export function logError(error: Error | string, properties?: Record<string, string>): void {
  try {
    if (logger === undefined) return;
    if (!isExtensionTelemetryEnabled()) return;

    const sourceMessage = typeof error === 'string' ? error : error.message;
    const redactedMessage = redactTelemetryText(sourceMessage);
    const err = new Error(redactedMessage);
    if (typeof error !== 'string' && error.name) err.name = error.name;

    const merged = {
      ...getCommonProperties(),
      ...redactProperties(properties ?? {}),
    };

    logger.logError(err, merged);
  } catch {
    // Telemetry must never throw or block the caller
  }
}
