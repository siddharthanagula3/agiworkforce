import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { activate } from '../extension';
import { LocalRuntimePool } from '../integrations/localRuntimePool';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';

const { openAgentConfigMock } = vi.hoisted(() => ({
  openAgentConfigMock: vi.fn().mockResolvedValue('/host/.agiworkforce/config.toml'),
}));

vi.mock('../features/config/agentConfig', () => ({
  agentConfigPath: () => '/host/.agiworkforce/config.toml',
  openAgentConfig: openAgentConfigMock,
}));

describe('agent configuration commands', () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;
  let originalRegister: typeof vscode.commands.registerCommand;
  let restartAll: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = new Map();
    originalRegister = vscode.commands.registerCommand;
    (
      vscode.commands as { registerCommand: typeof vscode.commands.registerCommand }
    ).registerCommand = vi.fn((id: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(id, handler);
      return { dispose: () => undefined } as vscode.Disposable;
    });
    restartAll = vi.spyOn(LocalRuntimePool.prototype, 'restartAll');
    activate(new vscode.ExtensionContext());
  });

  afterEach(() => {
    (
      vscode.commands as { registerCommand: typeof vscode.commands.registerCommand }
    ).registerCommand = originalRegister;
    vi.restoreAllMocks();
    __resetSubsystemHealthForTests();
  });

  it('opens the host config and offers an immediate runtime restart', async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce('Restart local runtime');

    await handlers.get('agi-workforce.openAgentConfig')!();

    expect(openAgentConfigMock).toHaveBeenCalledOnce();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('/host/.agiworkforce/config.toml'),
      'Restart local runtime',
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'agi-workforce.restartLocalRuntime',
    );
  });

  it('restarts every pooled workspace runtime', async () => {
    const result = await handlers.get('agi-workforce.restartLocalRuntime')!();

    expect(restartAll).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, restartedWorkspaces: 0 });
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('configuration reloaded'),
    );
  });

  it('reports a restart only after the replacement process is ready', async () => {
    let resolveRestart!: (value: { restartedWorkspaces: number }) => void;
    restartAll.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRestart = resolve;
      }),
    );

    const command = Promise.resolve(handlers.get('agi-workforce.restartLocalRuntime')!());
    await new Promise((resolve) => setImmediate(resolve));

    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    resolveRestart({ restartedWorkspaces: 1 });
    await command;
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'AGI Workforce: Local runtime restarted in 1 workspace.',
    );
  });

  it('never claims the restarted runtime is ready, the sidebar re-probes and decides', async () => {
    await handlers.get('agi-workforce.restartLocalRuntime')!();

    const announced = vi
      .mocked(vscode.window.showInformationMessage)
      .mock.calls.map((call) => String(call[0]));
    expect(announced.some((message) => /\bready\b/i.test(message))).toBe(false);
  });

  it('returns a structured failure after preserving the visible restart error', async () => {
    restartAll.mockRejectedValueOnce(new Error('protocol handshake failed'));

    const result = await handlers.get('agi-workforce.restartLocalRuntime')!();

    expect(result).toEqual({ ok: false, error: 'protocol handshake failed' });
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'AGI Workforce: Local runtime restart failed, protocol handshake failed',
    );
  });
});
