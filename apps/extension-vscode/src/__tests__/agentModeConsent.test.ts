import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  BYPASS_CANCEL_ACTION,
  BYPASS_CONFIRM_ACTION,
  enforceAgentModeConsent,
  initializeAgentModeConsent,
  reconcileAgentModeConsent,
  setAgentModeWithConsent,
} from '../features/permissions/agentModeConsent';

function configurationHarness(initialMode: 'ask' | 'auto' | 'plan' | 'bypass' = 'auto') {
  let mode = initialMode;
  const update = vi.fn(async (key: string, value: string) => {
    if (key === 'agent.mode') mode = value as typeof mode;
  });
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: vi.fn((key: string, fallback?: unknown) => (key === 'agent.mode' ? mode : fallback)),
    update,
    has: vi.fn(),
    inspect: vi.fn(),
  } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
  return { update, mode: () => mode };
}

describe('agent-mode bypass consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a cancelled bypass escalation on the current safe mode', async () => {
    const context = new vscode.ExtensionContext();
    const config = configurationHarness('auto');
    initializeAgentModeConsent(context);
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce({
      title: BYPASS_CANCEL_ACTION,
      isCloseAffordance: true,
    });

    await expect(setAgentModeWithConsent(context, 'bypass')).resolves.toBe(false);

    expect(config.mode()).toBe('auto');
    expect(config.update).not.toHaveBeenCalled();
    expect(enforceAgentModeConsent('bypass')).toBe('auto');
  });

  it('names the granted scopes and risks before enabling bypass', async () => {
    const context = new vscode.ExtensionContext();
    const config = configurationHarness('auto');
    initializeAgentModeConsent(context);
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce({
      title: BYPASS_CONFIRM_ACTION,
    });

    await expect(setAgentModeWithConsent(context, 'bypass')).resolves.toBe(true);

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'Turn on Bypass Permissions?',
      expect.objectContaining({
        modal: true,
        detail: expect.stringMatching(
          /current workspace.*additional directories.*data loss.*prompt-injection/s,
        ),
      }),
      expect.objectContaining({ title: BYPASS_CANCEL_ACTION, isCloseAffordance: true }),
      expect.objectContaining({ title: BYPASS_CONFIRM_ACTION }),
    );
    expect(config.mode()).toBe('bypass');
    expect(enforceAgentModeConsent('bypass')).toBe('bypass');
  });

  it('fails closed and reverts an unconfirmed raw Settings edit', async () => {
    const context = new vscode.ExtensionContext();
    const config = configurationHarness('bypass');
    initializeAgentModeConsent(context);
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce({
      title: BYPASS_CANCEL_ACTION,
      isCloseAffordance: true,
    });

    expect(enforceAgentModeConsent('bypass')).toBe('auto');
    await reconcileAgentModeConsent(context);

    expect(config.mode()).toBe('auto');
    expect(config.update).toHaveBeenCalledWith(
      'agent.mode',
      'auto',
      vscode.ConfigurationTarget.Global,
    );
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'AGI Workforce kept Auto mode. Bypass Permissions was not enabled.',
    );
  });

  it('restores a raw Settings edit only after explicit confirmation', async () => {
    const context = new vscode.ExtensionContext();
    const config = configurationHarness('bypass');
    initializeAgentModeConsent(context);
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce({
      title: BYPASS_CONFIRM_ACTION,
    });

    await reconcileAgentModeConsent(context);

    expect(config.update).toHaveBeenNthCalledWith(
      1,
      'agent.mode',
      'auto',
      vscode.ConfigurationTarget.Global,
    );
    expect(config.update).toHaveBeenNthCalledWith(
      2,
      'agent.mode',
      'bypass',
      vscode.ConfigurationTarget.Global,
    );
    expect(enforceAgentModeConsent('bypass')).toBe('bypass');
  });

  it('clears durable consent when the user returns to a safe mode', async () => {
    const context = new vscode.ExtensionContext();
    const config = configurationHarness('auto');
    initializeAgentModeConsent(context);
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce({
      title: BYPASS_CONFIRM_ACTION,
    });
    await setAgentModeWithConsent(context, 'bypass');

    await setAgentModeWithConsent(context, 'plan');

    expect(config.mode()).toBe('plan');
    expect(enforceAgentModeConsent('bypass')).toBe('auto');
  });
});
