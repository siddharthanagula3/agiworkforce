import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  BYPASS_CANCEL_ACTION,
  BYPASS_CONFIRM_ACTION,
  MAX_BYPASS_CANCEL_ACTION,
  MAX_BYPASS_CONFIRM_ACTION,
  enforceAgentModeConsent,
  initializeAgentModeConsent,
  reconcileAgentControlConsent,
  reconcileAgentEffortConsent,
  reconcileAgentModeConsent,
  setAgentEffortWithConsent,
  setAgentModeWithConsent,
} from '../features/permissions/agentModeConsent';

function configurationHarness(
  initialMode: 'ask' | 'auto' | 'plan' | 'bypass' = 'auto',
  initialEffort: 'low' | 'medium' | 'high' | 'max' = 'medium',
) {
  let mode = initialMode;
  let effort = initialEffort;
  const update = vi.fn(async (key: string, value: string) => {
    if (key === 'agent.mode') mode = value as typeof mode;
    if (key === 'agent.effort') effort = value as typeof effort;
  });
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: vi.fn((key: string, fallback?: unknown) => {
      if (key === 'agent.mode') return mode;
      if (key === 'agent.effort') return effort;
      return fallback;
    }),
    update,
    has: vi.fn(),
    inspect: vi.fn(),
  } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
  return { update, mode: () => mode, effort: () => effort };
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

  it('requires compound-risk consent before entering Max with Bypass Permissions', async () => {
    const context = new vscode.ExtensionContext();
    const config = configurationHarness('auto', 'max');
    initializeAgentModeConsent(context);
    vi.mocked(vscode.window.showWarningMessage)
      .mockResolvedValueOnce({ title: BYPASS_CONFIRM_ACTION })
      .mockResolvedValueOnce({
        title: MAX_BYPASS_CANCEL_ACTION,
        isCloseAffordance: true,
      });

    await expect(setAgentModeWithConsent(context, 'bypass')).resolves.toBe(false);

    expect(config.mode()).toBe('auto');
    expect(enforceAgentModeConsent('bypass')).toBe('auto');
    expect(vscode.window.showWarningMessage).toHaveBeenNthCalledWith(
      2,
      'Use Max reasoning with Bypass Permissions?',
      expect.objectContaining({
        modal: true,
        detail: expect.stringMatching(
          /commands.*network-capable tools.*plan limits.*prompt-injection/s,
        ),
      }),
      expect.objectContaining({ title: MAX_BYPASS_CANCEL_ACTION, isCloseAffordance: true }),
      expect.objectContaining({ title: MAX_BYPASS_CONFIRM_ACTION }),
    );
  });

  it('guards Max effort while bypass is active and remembers the active-pair acknowledgement', async () => {
    const context = new vscode.ExtensionContext();
    const config = configurationHarness('auto', 'high');
    initializeAgentModeConsent(context);
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce({
      title: BYPASS_CONFIRM_ACTION,
    });
    await setAgentModeWithConsent(context, 'bypass');
    vi.mocked(vscode.window.showWarningMessage).mockClear();
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce({
      title: MAX_BYPASS_CONFIRM_ACTION,
    });

    await expect(setAgentEffortWithConsent(context, 'max')).resolves.toBe(true);
    await expect(setAgentEffortWithConsent(context, 'max')).resolves.toBe(true);

    expect(config.effort()).toBe('max');
    expect(vscode.window.showWarningMessage).toHaveBeenCalledOnce();
  });

  it('fails a raw Max effort edit closed to High and restores it only after confirmation', async () => {
    const context = new vscode.ExtensionContext();
    const config = configurationHarness('auto', 'high');
    initializeAgentModeConsent(context);
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce({
      title: BYPASS_CONFIRM_ACTION,
    });
    await setAgentModeWithConsent(context, 'bypass');

    await config.update('agent.effort', 'max');
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce({
      title: MAX_BYPASS_CANCEL_ACTION,
      isCloseAffordance: true,
    });
    await reconcileAgentEffortConsent(context);
    expect(config.effort()).toBe('high');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'AGI Workforce kept High reasoning effort. Max with Bypass Permissions was not enabled.',
    );

    await config.update('agent.effort', 'max');
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce({
      title: MAX_BYPASS_CONFIRM_ACTION,
    });
    await reconcileAgentEffortConsent(context);
    expect(config.effort()).toBe('max');
  });

  it('requires fresh compound-risk consent after leaving the elevated pair', async () => {
    const context = new vscode.ExtensionContext();
    configurationHarness('auto', 'high');
    initializeAgentModeConsent(context);
    vi.mocked(vscode.window.showWarningMessage)
      .mockResolvedValueOnce({ title: BYPASS_CONFIRM_ACTION })
      .mockResolvedValueOnce({ title: MAX_BYPASS_CONFIRM_ACTION });
    await setAgentModeWithConsent(context, 'bypass');
    await setAgentEffortWithConsent(context, 'max');
    await setAgentEffortWithConsent(context, 'high');
    vi.mocked(vscode.window.showWarningMessage).mockClear();
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce({
      title: MAX_BYPASS_CANCEL_ACTION,
      isCloseAffordance: true,
    });

    await expect(setAgentEffortWithConsent(context, 'max')).resolves.toBe(false);

    expect(vscode.window.showWarningMessage).toHaveBeenCalledOnce();
  });

  it('serializes overlapping raw configuration events without duplicating consent prompts', async () => {
    const context = new vscode.ExtensionContext();
    const config = configurationHarness('auto', 'max');
    initializeAgentModeConsent(context);
    await config.update('agent.mode', 'bypass');
    vi.mocked(vscode.window.showWarningMessage)
      .mockResolvedValueOnce({ title: BYPASS_CONFIRM_ACTION })
      .mockResolvedValueOnce({ title: MAX_BYPASS_CONFIRM_ACTION });

    await Promise.all([
      reconcileAgentControlConsent(context),
      reconcileAgentControlConsent(context),
    ]);

    expect(config.mode()).toBe('bypass');
    expect(config.effort()).toBe('max');
    expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(2);
  });
});
