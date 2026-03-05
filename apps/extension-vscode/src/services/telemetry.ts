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

// ─── Event names ─────────────────────────────────────────────────────────────

export const TelemetryEvents = {
  EXTENSION_ACTIVATED: 'extension/activated',
  COMPLETION_REQUESTED: 'completion/requested',
  COMPLETION_ACCEPTED: 'completion/accepted',
  CHAT_MESSAGE_SENT: 'chat/messageSent',
  INLINE_COMMAND_EXECUTED: 'inlineCommand/executed',
  MODEL_SELECTED: 'model/selected',
  ERROR_OCCURRED: 'error/occurred',
} as const;

type TelemetryEventName = (typeof TelemetryEvents)[keyof typeof TelemetryEvents];

// ─── Telemetry service ───────────────────────────────────────────────────────

let logger: vscode.TelemetryLogger | undefined;
let sessionId: string | undefined;

function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
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
export function activate(context: vscode.ExtensionContext): vscode.Disposable {
  sessionId = generateSessionId();

  const sender: vscode.TelemetrySender = {
    sendEventData(eventName: string, data?: Record<string, unknown>): void {
      // This is where you'd send to your telemetry backend.
      // For now, events are only processed by VS Code's built-in telemetry pipeline.
      // The TelemetryLogger handles gating on vscode.env.isTelemetryEnabled automatically.
      void eventName;
      void data;
    },
    sendErrorData(error: Error, data?: Record<string, unknown>): void {
      void error;
      void data;
    },
  };

  logger = vscode.env.createTelemetryLogger(sender, {
    ignoreBuiltInCommonProperties: false,
    ignoreUnhandledErrors: true,
  });

  context.subscriptions.push(logger);

  // Log activation event
  logEvent(TelemetryEvents.EXTENSION_ACTIVATED, {
    model: vscode.workspace.getConfiguration('agiWorkforce').get<string>('model') ?? 'auto',
  });

  return logger;
}

/**
 * Log a telemetry event. Respects both VS Code and extension-level telemetry settings.
 */
export function logEvent(eventName: TelemetryEventName, properties?: Record<string, string>): void {
  if (logger === undefined) return;
  if (!isExtensionTelemetryEnabled()) return;

  const merged = {
    ...getCommonProperties(),
    ...properties,
  };

  logger.logUsage(eventName, merged);
}

/**
 * Log an error event.
 */
export function logError(error: Error | string, properties?: Record<string, string>): void {
  if (logger === undefined) return;
  if (!isExtensionTelemetryEnabled()) return;

  const err = typeof error === 'string' ? new Error(error) : error;

  const merged = {
    ...getCommonProperties(),
    ...properties,
  };

  logger.logError(err, merged);
}
