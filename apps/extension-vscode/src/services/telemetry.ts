/**
 * telemetry.ts — Anonymous usage telemetry for AGI Workforce VS Code extension
 *
 * Uses VS Code's built-in TelemetryLogger API. Respects both:
 * - VS Code global telemetry setting (vscode.env.isTelemetryEnabled)
 * - Extension-level agiWorkforce.telemetryEnabled setting
 *
 * No PII is collected. All events are anonymous.
 */

import * as vscode from 'vscode';
import { normalizeConfiguredModelId } from './modelConstants';
import { getExtensionVersion } from '../utils/version';

// ─── Event names ─────────────────────────────────────────────────────────────

export const TelemetryEvents = {
  EXTENSION_ACTIVATED: 'extension/activated',
  INLINE_COMMAND_EXECUTED: 'inlineCommand/executed',
  MODEL_SELECTED: 'model/selected',
  ERROR_OCCURRED: 'error/occurred',
} as const;

type TelemetryEventName = (typeof TelemetryEvents)[keyof typeof TelemetryEvents];

// ─── Secret redaction (D3) ──────────────────────────────────────────────────

/**
 * Patterns that match common secret / credential formats. Anything matching
 * is replaced with a fixed marker before being sent to the telemetry endpoint.
 * Order matters: more specific patterns first so we don't double-redact.
 */
const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, // JWT
  /Bearer\s+[A-Za-z0-9._\-+/=]{8,}/gi, // Bearer tokens
  /sk-ant-[A-Za-z0-9_-]{20,}/g, // Anthropic API key
  /sk-proj-[A-Za-z0-9_-]{20,}/g, // OpenAI project key
  /sk-[A-Za-z0-9]{20,}/g, // Generic OpenAI sk-
  /sk_(live|test)_[A-Za-z0-9_]{16,}/g, // Stripe + AGI live/test keys
  /xox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /ghp_[A-Za-z0-9]{30,}/g, // GitHub PAT
  /AIza[A-Za-z0-9_-]{30,}/g, // Google API key
  /AKIA[A-Z0-9]{16}/g, // AWS access key
];

/**
 * Returns a copy of the input with any matched secret replaced by `[REDACTED]`.
 * Exported for unit tests; safe to call on any string (never throws).
 */
export function redactSecrets(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return input;
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

function redactProperties(props: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) {
    out[k] = typeof v === 'string' ? redactSecrets(v) : v;
  }
  return out;
}

// ─── Telemetry endpoint allowlist ────────────────────────────────────────────

const ALLOWED_TELEMETRY_DOMAINS = ['agiworkforce.com', 'localhost', '127.0.0.1'];

function isAllowedTelemetryEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_TELEMETRY_DOMAINS.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain),
    );
  } catch {
    return false;
  }
}

// ─── Telemetry service ───────────────────────────────────────────────────────

const TELEMETRY_FLUSH_INTERVAL_MS = 30_000;
const TELEMETRY_BATCH_MAX = 50;

let logger: vscode.TelemetryLogger | undefined;
let sessionId: string | undefined;

/**
 * In-memory batch buffer. One POST per flush of N≤50 events instead of
 * one POST per event. Flushes on 30s timer, on size threshold, and on
 * extension dispose. If the network call fails, events are dropped (no
 * persistent retry queue — telemetry must never grow unbounded).
 */
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

  /** Test-only inspector. */
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

/** Test-only: reset module state between tests. */
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
  const config = vscode.workspace.getConfiguration('agiWorkforce');
  return config.get<boolean>('telemetryEnabled') ?? false;
}

function getCommonProperties(): Record<string, string> {
  return {
    sessionId: sessionId ?? 'unknown',
    extensionVersion: getExtensionVersion(),
    vscodeVersion: vscode.version,
    platform: process.platform,
  };
}

/**
 * Initialize the telemetry service. Call once during extension activation.
 * Returns a Disposable that cleans up the logger.
 */
export function activate(_context: vscode.ExtensionContext): vscode.Disposable {
  sessionId = generateSessionId();

  // Resolve the telemetry endpoint once at activation time.
  // If not configured, all events are silently suppressed — never thrown.
  const telemetryEndpoint =
    vscode.workspace.getConfiguration('agiWorkforce').get<string>('telemetryEndpoint') ??
    'https://telemetry.agiworkforce.com/v1/events';

  // Security: validate the endpoint against the domain allowlist to prevent data exfiltration
  // via malicious configuration. If invalid, all telemetry is silently suppressed.
  if (!isAllowedTelemetryEndpoint(telemetryEndpoint)) {
    console.warn(
      `[AGI Workforce] Telemetry endpoint "${telemetryEndpoint}" is not in the allowed domain list. Telemetry is disabled.`,
    );
  }

  /** Fire-and-forget HTTP POST. Never throws — telemetry must not affect the caller. */
  function postBatch(payload: Record<string, unknown>): void {
    if (!vscode.env.isTelemetryEnabled) return;
    if (!telemetryEndpoint) return;
    if (!isAllowedTelemetryEndpoint(telemetryEndpoint)) return;
    try {
      void fetch(telemetryEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Network errors are silently swallowed — telemetry must never crash the extension.
      });
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

  // Wrap so the disposable returned to extension.ts also flushes the
  // batch buffer + tears down the timer on extension deactivation.
  const localBatcher = batcher;
  logger = innerLogger;
  const composite: vscode.Disposable = {
    dispose() {
      localBatcher?.dispose();
      innerLogger.dispose();
    },
  };

  // Note: do NOT push to context.subscriptions here — extension.ts pushes the
  // returned Disposable, which is this composite. Pushing twice would cause
  // double-disposal on deactivation.

  // Log activation event
  logEvent(TelemetryEvents.EXTENSION_ACTIVATED, {
    model: normalizeConfiguredModelId(
      vscode.workspace.getConfiguration('agiWorkforce').get<string>('model'),
    ),
  });

  return composite;
}

/**
 * Log a telemetry event. Respects both VS Code and extension-level telemetry settings.
 */
export function logEvent(eventName: TelemetryEventName, properties?: Record<string, string>): void {
  try {
    if (logger === undefined) return;
    if (!isExtensionTelemetryEnabled()) return;

    const merged = {
      ...getCommonProperties(),
      ...redactProperties(properties ?? {}),
    };

    logger.logUsage(eventName, merged);
  } catch {
    // Telemetry must never throw or block the caller
  }
}

/**
 * Log an error event.
 */
export function logError(error: Error | string, properties?: Record<string, string>): void {
  try {
    if (logger === undefined) return;
    if (!isExtensionTelemetryEnabled()) return;

    const sourceMessage = typeof error === 'string' ? error : error.message;
    const redactedMessage = redactSecrets(sourceMessage);
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
