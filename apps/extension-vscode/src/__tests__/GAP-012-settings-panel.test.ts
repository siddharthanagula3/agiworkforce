import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import * as accountApi from '../utils/api';
import { SettingsPanel } from '../features/settings/SettingsPanel';
import {
  BYPASS_CANCEL_ACTION,
  initializeAgentModeConsent,
} from '../features/permissions/agentModeConsent';

describe('SettingsPanel', () => {
  let context: vscode.ExtensionContext;
  let values: Record<string, unknown>;
  let configurationUpdate: ReturnType<typeof vi.fn>;
  let webviewMessageHandler: ((message: unknown) => Promise<void>) | undefined;
  let panelPostMessage: ReturnType<typeof vi.fn>;
  let panelReveal: ReturnType<typeof vi.fn>;
  let createPanel: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    SettingsPanel.__resetForTests();
    context = new vscode.ExtensionContext();
    initializeAgentModeConsent(context);
    values = {
      apiEndpoint: 'https://agiworkforce.com/api/llm/v1',
      model: 'auto',
      cliPath: 'agi',
      contextLines: 50,
      telemetryEnabled: false,
      hoverEnabled: false,
      codeLensEnabled: false,
      autoApplyFixes: false,
      'memory.enabled': true,
      'inlineCompletions.enabled': false,
      'inlineCompletions.debounceMs': 300,
      'inlineCompletions.maxLength': 500,
      'agent.mode': 'auto',
      'agent.effort': 'medium',
      'agent.thinking': false,
      'desktopBridge.enabled': false,
      'desktopBridge.port': 8787,
      telemetryEndpoint: 'https://telemetry.agiworkforce.com/v1/events',
      currentTier: 'unknown',
    };
    configurationUpdate = vi.fn(async (key: string, value: unknown) => {
      values[key] = value;
    });
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
      update: configurationUpdate,
      has: vi.fn(),
      inspect: vi.fn((key: string) => ({
        key: `agiWorkforce.${key}`,
        defaultValue: values[key],
        globalValue: values[key],
      })),
    } as unknown as vscode.WorkspaceConfiguration);

    webviewMessageHandler = undefined;
    panelPostMessage = vi.fn().mockResolvedValue(true);
    panelReveal = vi.fn();
    const panel = {
      webview: {
        html: '',
        options: {},
        cspSource: 'vscode-webview://settings-test',
        postMessage: panelPostMessage,
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => Promise<void>) => {
          webviewMessageHandler = handler;
          return { dispose: vi.fn() };
        }),
      },
      reveal: panelReveal,
      onDidDispose: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      dispose: vi.fn(),
      viewColumn: vscode.ViewColumn.One,
    } as unknown as vscode.WebviewPanel;
    createPanel = vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel);
  });

  afterEach(() => {
    SettingsPanel.__resetForTests();
    vi.restoreAllMocks();
  });

  it('creates one branded panel and reveals it on subsequent opens', () => {
    const first = SettingsPanel.createOrShow(context, 'general');
    const second = SettingsPanel.createOrShow(context, 'account');

    expect(first).toBe(second);
    expect(createPanel).toHaveBeenCalledOnce();
    expect(createPanel).toHaveBeenCalledWith(
      SettingsPanel.viewType,
      'AGI Settings',
      vscode.ViewColumn.One,
      expect.objectContaining({
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      }),
    );
    expect(panelReveal).toHaveBeenCalledOnce();
    expect(panelPostMessage).toHaveBeenCalledWith({
      type: 'settings.navigate',
      section: 'account',
    });
  });

  it('writes validated settings at user scope and acknowledges the saved key', async () => {
    SettingsPanel.createOrShow(context);
    expect(webviewMessageHandler).toBeDefined();

    await webviewMessageHandler!({
      type: 'settings.update',
      key: 'contextLines',
      value: 120,
    });

    expect(configurationUpdate).toHaveBeenCalledWith(
      'contextLines',
      120,
      vscode.ConfigurationTarget.Global,
    );
    expect(panelPostMessage).toHaveBeenCalledWith({
      type: 'settings.saved',
      key: 'contextLines',
    });
  });

  it('routes bypass mode through consent and restores the safe value when cancelled', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce({
      title: BYPASS_CANCEL_ACTION,
      isCloseAffordance: true,
    });
    SettingsPanel.createOrShow(context);

    await webviewMessageHandler!({
      type: 'settings.update',
      key: 'agent.mode',
      value: 'bypass',
    });

    expect(configurationUpdate).not.toHaveBeenCalledWith(
      'agent.mode',
      'bypass',
      vscode.ConfigurationTarget.Global,
    );
    expect(values['agent.mode']).toBe('auto');
    expect(panelPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'settings.error',
        message: expect.stringContaining('elevated control combination was not enabled'),
      }),
    );
  });

  it('routes Max effort through the compound-risk guard while bypass is active', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce({
      title: 'Turn On Bypass Permissions',
    });
    SettingsPanel.createOrShow(context);
    await webviewMessageHandler!({
      type: 'settings.update',
      key: 'agent.mode',
      value: 'bypass',
    });
    configurationUpdate.mockClear();
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce({
      title: 'Keep Safer Settings',
      isCloseAffordance: true,
    });

    await webviewMessageHandler!({
      type: 'settings.update',
      key: 'agent.effort',
      value: 'max',
    });

    expect(configurationUpdate).not.toHaveBeenCalledWith(
      'agent.effort',
      'max',
      vscode.ConfigurationTarget.Global,
    );
    expect(panelPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'settings.error',
        message: expect.stringContaining('elevated control combination was not enabled'),
      }),
    );
  });

  it('drops malformed updates before they reach configuration storage', async () => {
    SettingsPanel.createOrShow(context);

    await webviewMessageHandler!({
      type: 'settings.update',
      key: 'desktopBridge.port',
      value: 22,
    });

    expect(configurationUpdate).not.toHaveBeenCalled();
  });

  it('keeps raw VS Code settings as an explicit escape hatch', async () => {
    SettingsPanel.createOrShow(context);

    await webviewMessageHandler!({
      type: 'settings.command',
      command: 'openRawSettings',
    });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.openSettings',
      'agiWorkforce',
    );
  });

  it('persists custom instructions in the selected scope and refreshes panel state', async () => {
    SettingsPanel.createOrShow(context, 'personalization');

    await webviewMessageHandler!({
      type: 'settings.instructions.update',
      scope: 'workspace',
      value: 'Use workspace fixtures.',
    });

    expect(context.workspaceState.get('agiWorkforce.customInstructions.workspace')).toBe(
      'Use workspace fixtures.',
    );
    expect(panelPostMessage).toHaveBeenCalledWith({
      type: 'settings.instructions.saved',
      scope: 'workspace',
    });
    expect(panelPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'settings.snapshot',
        state: expect.objectContaining({
          instructionContext: expect.objectContaining({
            effectiveScope: 'workspace',
            effective: 'Use workspace fixtures.',
          }),
        }),
      }),
    );
  });

  it('routes config-file and runtime-restart actions through registered extension commands', async () => {
    SettingsPanel.createOrShow(context, 'configuration');

    await webviewMessageHandler!({
      type: 'settings.command',
      command: 'openAgentConfig',
    });
    await webviewMessageHandler!({
      type: 'settings.command',
      command: 'restartLocalRuntime',
    });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('agi-workforce.openAgentConfig');
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'agi-workforce.restartLocalRuntime',
    );
  });

  it('publishes the cleared account state when a concurrent refresh invalidates the token', async () => {
    vi.spyOn(accountApi, 'getAccountAuthState')
      .mockResolvedValueOnce({ status: 'signed-in' })
      .mockResolvedValueOnce({ status: 'signed-out' });
    vi.spyOn(accountApi, 'fetchAccountIdentity').mockResolvedValue({
      displayName: 'Signed-in user',
      email: 'user@example.com',
      accountType: 'Personal account',
      planName: 'Pro',
      tier: 'pro',
    });
    vi.spyOn(accountApi, 'fetchTierInfo').mockResolvedValue({
      tier: 'pro',
      subscriptionStatus: 'active',
    });
    SettingsPanel.createOrShow(context, 'account');

    await webviewMessageHandler!({ type: 'settings.ready' });

    expect(accountApi.fetchAccountIdentity).toHaveBeenCalledOnce();
    expect(accountApi.fetchTierInfo).toHaveBeenCalledOnce();
    expect(panelPostMessage).toHaveBeenCalledWith({
      type: 'settings.snapshot',
      state: expect.objectContaining({
        accountConnected: false,
        accountStatus: 'signed-out',
      }),
    });
    const snapshot = panelPostMessage.mock.calls.find(
      ([message]) => message?.type === 'settings.snapshot',
    )?.[0];
    expect(snapshot?.state).not.toHaveProperty('accountIdentity');
    expect(snapshot?.state).not.toHaveProperty('tierInfo');
  });
});
