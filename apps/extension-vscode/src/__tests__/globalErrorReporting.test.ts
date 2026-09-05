import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

vi.mock('../platform/config', () => ({
  Config: { telemetryEnabled: vi.fn(() => true) },
}));

vi.mock('../core/telemetry', () => ({
  logError: vi.fn(),
}));

import { Config } from '../platform/config';
import * as telemetry from '../core/telemetry';
import { installGlobalErrorReporting } from '../core/errorReporting';

describe('installGlobalErrorReporting, VS Code telemetry level gate', () => {
  let disposable: vscode.Disposable | undefined;

  beforeEach(() => {
    vi.mocked(Config.telemetryEnabled).mockReturnValue(true);
    vi.mocked(telemetry.logError).mockClear();
    vscode.env.isTelemetryEnabled = true;
    disposable = installGlobalErrorReporting();
  });

  afterEach(() => {
    disposable?.dispose();
  });

  it('reports an uncaught exception when the extension setting and VS Code telemetry are both on', () => {
    process.emit('uncaughtException', new Error('boom'));

    expect(telemetry.logError).toHaveBeenCalledTimes(1);
  });

  it('reports an unhandled rejection the same way', () => {
    process.emit('unhandledRejection', new Error('boom'), Promise.resolve());

    expect(telemetry.logError).toHaveBeenCalledTimes(1);
  });

  it('does not report when VS Code telemetry is off, even if the extension setting is on', () => {
    vscode.env.isTelemetryEnabled = false;

    process.emit('uncaughtException', new Error('boom'));

    expect(telemetry.logError).not.toHaveBeenCalled();
  });

  it('does not report when the extension telemetry setting is off, even if VS Code telemetry is on', () => {
    vi.mocked(Config.telemetryEnabled).mockReturnValue(false);

    process.emit('uncaughtException', new Error('boom'));

    expect(telemetry.logError).not.toHaveBeenCalled();
  });

  it('never forwards the original error message, only a scrubbed name and stack', () => {
    process.emit('uncaughtException', new Error('super secret message'));

    const [reportedError] = vi.mocked(telemetry.logError).mock.calls[0] ?? [];
    expect(String(reportedError)).not.toContain('super secret message');
    expect(reportedError).toBeInstanceOf(Error);
  });

  it('removes both process listeners once disposed', () => {
    const before = process.listenerCount('uncaughtException');
    const beforeRejection = process.listenerCount('unhandledRejection');

    disposable?.dispose();

    expect(process.listenerCount('uncaughtException')).toBe(before - 1);
    expect(process.listenerCount('unhandledRejection')).toBe(beforeRejection - 1);
  });
});
