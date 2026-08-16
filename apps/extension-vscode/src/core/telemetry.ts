
import * as vscode from 'vscode';
import { normalizeConfiguredModelId } from '../features/model-picker/modelConstants';
import { getExtensionVersion } from '../platform/version';
import { Config } from '../platform/config';

export const TelemetryEvents = {
  EXTENSION_ACTIVATED: 'extension/activated',
  INLINE_COMMAND_EXECUTED: 'inlineCommand/executed',
  MODEL_SELECTED: 'model/selected',
  ERROR_OCCURRED: 'error/occurred',
} as const;

type TelemetryEventName = (typeof TelemetryEvents)[keyof typeof TelemetryEvents];

const SECRET_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    '[REDACTED]',
  ], // PEM private key block
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '[REDACTED]'], // JWT
  [/Bearer\s+[A-Za-z0-9._\-+/=]{8,}/gi, '[REDACTED]'], // Bearer tokens
  [/sk-ant-[A-Za-z0-9_-]{20,}/g, '[REDACTED]'], // Anthropic API key
  [/sk-proj-[A-Za-z0-9_-]{20,}/g, '[REDACTED]'], // OpenAI project key
  [/sk-[A-Za-z0-9]{20,}/g, '[REDACTED]'], // Generic OpenAI sk-
  [/(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9_]{16,}/g, '[REDACTED]'], // Stripe + AGI live/test keys
  [/gsk_[A-Za-z0-9]{48,}/g, '[REDACTED]'], // Groq API key
  [/xai-[A-Za-z0-9]{20,}/g, '[REDACTED]'], // xAI API key
  [/xox[baprs]-[A-Za-z0-9-]{10,}/g, '[REDACTED]'], // Slack tokens
  [/github_pat_[A-Za-z0-9_]{22,}/g, '[REDACTED]'], // GitHub fine-grained PAT
  [/gh[pousr]_[A-Za-z0-9]{30,}/g, '[REDACTED]'], // GitHub classic PAT / OAuth / refresh
  [/AIza[A-Za-z0-9_-]{30,}/g, '[REDACTED]'], // Google API key
  [/A(?:KIA|SIA)[A-Z0-9]{16}/g, '[REDACTED]'], // AWS access / session key id
  [/\b([a-z][a-z0-9+.-]*):\/\/[^\s:@/]+:[^\s@/]+@/gi, '$1://[REDACTED]@'], // credentials in a URL (DATABASE_URL et al)
  [
    /\b([A-Za-z0-9_]{0,32}(?:password|passwd|api[_-]?key|apikey|secret[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|refresh[_-]?token))["']?\s*[=:]\s*["']?[^\s,'"}]{8,}/gi,
    '$1=[REDACTED]',
  ], // named credential assignment
];

/**
 * Returns a copy of the input with any matched secret replaced by `[REDACTED]`.
 * Exported for unit tests; safe to call on any string (never throws).
 */
export function redactSecrets(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return input;
  let out = input;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
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

const ALLOWED_TELEMETRY_HOSTS = new Set<string>([
  'telemetry.agiworkforce.com',
  'agiworkforce.com',
  'localhost',
  '127.0.0.1',
]);

function isAllowedTelemetryEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_TELEMETRY_HOSTS.has(parsed.hostname);
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

export function activate(_context: vscode.ExtensionContext): vscode.Disposable {
  sessionId = generateSessionId();

  const telemetryEndpoint =
    vscode.workspace.getConfiguration('agiWorkforce').get<string>('telemetryEndpoint') ??
    'https://telemetry.agiworkforce.com/v1/events';

  if (!isAllowedTelemetryEndpoint(telemetryEndpoint)) {
    console.warn(
      `[AGI Workforce] Telemetry endpoint "${telemetryEndpoint}" is not in the allowed domain list. Telemetry is disabled.`,
    );
  }

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

  const localBatcher = batcher;
  logger = innerLogger;
  const composite: vscode.Disposable = {
    dispose() {
      localBatcher?.dispose();
      innerLogger.dispose();
    },
  };

  logEvent(TelemetryEvents.EXTENSION_ACTIVATED, {
    model: normalizeConfiguredModelId(Config.model()),
  });

  return composite;
}

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
