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

// ─── Event names ─────────────────────────────────────────────────────────────

export const TelemetryEvents = {
  EXTENSION_ACTIVATED: 'extension/activated',
  INLINE_COMMAND_EXECUTED: 'inlineCommand/executed',
  MODEL_SELECTED: 'model/selected',
  ERROR_OCCURRED: 'error/occurred',
} as const;

type TelemetryEventName = (typeof TelemetryEvents)[keyof typeof TelemetryEvents];

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

let logger: vscode.TelemetryLogger | undefined;
let sessionId: string | undefined;

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
    extensionVersion:
      vscode.extensions.getExtension('agiworkforce.agi-workforce')?.packageJSON?.version ?? '0.1.0',
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
  function postEvent(payload: Record<string, unknown>): void {
    // Guard: only post when VS Code global telemetry is enabled.
    if (!vscode.env.isTelemetryEnabled) return;
    if (!telemetryEndpoint) return;
    // Guard: only post to allowed telemetry domains.
    if (!isAllowedTelemetryEndpoint(telemetryEndpoint)) return;
    try {
      // Use fetch (available in VS Code's Node.js 18+ runtime via global).
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

  const sender: vscode.TelemetrySender = {
    sendEventData(eventName: string, data?: Record<string, unknown>): void {
      // The TelemetryLogger gates on vscode.env.isTelemetryEnabled before calling here.
      // We additionally guard inside postEvent() as a defense-in-depth measure.
      postEvent({
        type: 'event',
        eventName,
        data: data ?? {},
        timestamp: new Date().toISOString(),
        extensionVersion:
          vscode.extensions.getExtension('agiworkforce.agi-workforce')?.packageJSON?.version ??
          '0.1.0',
        vscodeVersion: vscode.version,
        sessionId: sessionId ?? 'unknown',
      });
    },
    sendErrorData(error: Error, data?: Record<string, unknown>): void {
      postEvent({
        type: 'error',
        errorName: error.name,
        errorMessage: error.message,
        data: data ?? {},
        timestamp: new Date().toISOString(),
        extensionVersion:
          vscode.extensions.getExtension('agiworkforce.agi-workforce')?.packageJSON?.version ??
          '0.1.0',
        vscodeVersion: vscode.version,
        sessionId: sessionId ?? 'unknown',
      });
    },
  };

  logger = vscode.env.createTelemetryLogger(sender, {
    ignoreBuiltInCommonProperties: false,
    ignoreUnhandledErrors: true,
  });

  // Note: do NOT push to context.subscriptions here — extension.ts pushes the
  // returned Disposable, which is this same logger. Pushing twice would cause
  // double-disposal on deactivation.

  // Log activation event
  logEvent(TelemetryEvents.EXTENSION_ACTIVATED, {
    model: normalizeConfiguredModelId(
      vscode.workspace.getConfiguration('agiWorkforce').get<string>('model'),
    ),
  });

  return logger;
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
      ...properties,
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

    const err = typeof error === 'string' ? new Error(error) : error;

    const merged = {
      ...getCommonProperties(),
      ...properties,
    };

    logger.logError(err, merged);
  } catch {
    // Telemetry must never throw or block the caller
  }
}
