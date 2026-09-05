import * as vscode from 'vscode';
import { scrubErrorPayload, type ScrubbedErrorPayload } from '@agiworkforce/observability';
import { Config } from '../platform/config';
import * as telemetry from './telemetry';

const SOURCE_UNCAUGHT_EXCEPTION = 'uncaughtException';
const SOURCE_UNHANDLED_REJECTION = 'unhandledRejection';

function toError(value: unknown, fallbackMessage: string): Error {
  return value instanceof Error ? value : new Error(fallbackMessage);
}

function toStructuralError(payload: ScrubbedErrorPayload): Error {
  const structural = new Error(payload.name);
  structural.name = payload.name;
  structural.stack = [
    payload.name,
    ...payload.frames.map((frame) => `    at ${frame.functionName}`),
  ].join('\n');
  return structural;
}

function reportUnhandled(error: Error, source: string): void {
  if (!Config.telemetryEnabled()) return;
  if (!vscode.env.isTelemetryEnabled) return;
  telemetry.logError(toStructuralError(scrubErrorPayload(error)), { source });
}

export function installGlobalErrorReporting(): vscode.Disposable {
  const handleUncaughtException = (error: Error): void => {
    reportUnhandled(error, SOURCE_UNCAUGHT_EXCEPTION);
  };
  const handleUnhandledRejection = (reason: unknown): void => {
    reportUnhandled(toError(reason, SOURCE_UNHANDLED_REJECTION), SOURCE_UNHANDLED_REJECTION);
  };

  process.on('uncaughtException', handleUncaughtException);
  process.on('unhandledRejection', handleUnhandledRejection);

  return new vscode.Disposable(() => {
    process.removeListener('uncaughtException', handleUncaughtException);
    process.removeListener('unhandledRejection', handleUnhandledRejection);
  });
}
