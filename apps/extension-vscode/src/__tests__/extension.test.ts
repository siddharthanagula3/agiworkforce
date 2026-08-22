
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';
import { getModelMetadataById } from '@agiworkforce/types';
import { MODEL_PICKER_OPTIONS } from '../features/model-picker/modelConstants';
import { buildExtensionStatusBarText } from '../core/statusBar';
import { commandLabel } from '../core/runInlineCommand';
import { activate } from '../extension';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';

describe('commandLabel', () => {
  it('names every inline command the way the plan-mode prompt shows it', () => {
    expect(commandLabel('explain')).toBe('Explain Code');
    expect(commandLabel('fix')).toBe('Fix Issues');
    expect(commandLabel('refactor')).toBe('Refactor');
    expect(commandLabel('tests')).toBe('Generate Tests');
    expect(commandLabel('docs')).toBe('Generate Docs');
  });

  it('falls back to the raw command id rather than showing nothing', () => {
    expect(commandLabel('unmapped-command')).toBe('unmapped-command');
  });
});

describe('buildStatusBarText', () => {
  it('shows model only when no features enabled', () => {
    expect(buildExtensionStatusBarText('auto', 'auto')).toBe('$(hubot) AGI: auto');
  });

  it('shows plan mode chip', () => {
    const text = buildExtensionStatusBarText('current-model', 'plan');
    expect(text).toContain('plan');
    expect(text).toContain('current-model');
  });

  it('keeps optional desktop connectivity out of the primary model status', () => {
    const fixtureModelId = 'fixture-status-model';
    const text = buildExtensionStatusBarText(fixtureModelId, 'plan');
    expect(text).toContain('plan');
    expect(text).toContain(fixtureModelId);
    expect(text).not.toContain('bridge');
  });
});

function getPackageJsonCommands(): string[] {
  const pkgPath = path.resolve(__dirname, '../../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    contributes?: { commands?: Array<{ command: string }> };
  };
  return (pkg.contributes?.commands ?? []).map((c) => c.command);
}

describe('extension command registration', () => {
  const PACKAGE_COMMANDS = getPackageJsonCommands();

  it('reads commands from package.json', () => {
    expect(PACKAGE_COMMANDS.length).toBeGreaterThan(0);
  });

  it('includes all core agi-workforce commands', () => {
    const REQUIRED = [
      'agi-workforce.chat',
      'agi-workforce.agentMode',
      'agi-workforce.explain',
      'agi-workforce.fix',
      'agi-workforce.refactor',
      'agi-workforce.generateTests',
      'agi-workforce.setApiKey',
      'agi-workforce.clearApiKey',
      'agi-workforce.selectModel',
      'agi-workforce.openConversation',
      'agi-workforce.deleteConversation',
      'agi-workforce.refreshConversations',
    ];
    for (const cmd of REQUIRED) {
      expect(PACKAGE_COMMANDS).toContain(cmd);
    }
  });

  it('includes git and test utility commands', () => {
    expect(PACKAGE_COMMANDS).toContain('agi.git.status');
    expect(PACKAGE_COMMANDS).toContain('agi.git.diff');
    expect(PACKAGE_COMMANDS).toContain('agi.git.commit');
    expect(PACKAGE_COMMANDS).toContain('agi.test.run');
  });

  it('has at least 18 commands registered', () => {
    expect(PACKAGE_COMMANDS.length).toBeGreaterThanOrEqual(18);
  });

  it('has no duplicate command ids', () => {
    const unique = new Set(PACKAGE_COMMANDS);
    expect(unique.size).toBe(PACKAGE_COMMANDS.length);
  });
});

describe('model selection', () => {
  const MODELS = MODEL_PICKER_OPTIONS.map((option) => option.id);
  const MANUAL_MODELS = MODELS.filter((model) => !model.startsWith('auto'));

  it('loads model options from the catalog-backed picker', () => {
    expect(MODELS.length).toBeGreaterThan(3);
    expect(MANUAL_MODELS.every((model) => getModelMetadataById(model) !== null)).toBe(true);
  });

  it('includes all major providers', () => {
    const providers = new Set(
      MANUAL_MODELS.map((model) => getModelMetadataById(model)?.provider).filter(Boolean),
    );
    expect(providers.size).toBeGreaterThanOrEqual(6);
  });

  it('exposes one shared self-routing Auto option', () => {
    const autoModels = MODELS.filter((m) => m.startsWith('auto'));
    expect(autoModels).toEqual(['auto']);
  });

  it('marks current model as picked', () => {
    const currentModel = MANUAL_MODELS[0] ?? 'auto';
    const items = MODELS.map((m) => ({
      label: m,
      picked: m === currentModel,
    }));

    const picked = items.filter((i) => i.picked);
    expect(picked).toHaveLength(1);
    expect(picked[0].label).toBe(currentModel);
  });
});

describe('inline completions first-run privacy notice', () => {
  const NOTICE_KEY = 'inlineCompletions.firstRunNoticeShown';

  function activationContext(alreadyShown?: boolean): vscode.ExtensionContext {
    const store = new Map<string, unknown>();
    if (alreadyShown !== undefined) store.set(NOTICE_KEY, alreadyShown);
    return {
      subscriptions: [],
      secrets: {
        get: vi.fn().mockResolvedValue(undefined),
        store: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        onDidChange: vi.fn(),
      },
      extensionUri: vscode.Uri.file('/mock/extension'),
      extensionPath: '/mock/extension',
      globalState: {
        get: (key: string) => store.get(key),
        update: async (key: string, value: unknown) => {
          store.set(key, value);
        },
        keys: () => [...store.keys()],
        setKeysForSync: vi.fn(),
      },
      workspaceState: {
        get: () => undefined,
        update: vi.fn().mockResolvedValue(undefined),
        keys: () => [],
      },
      asAbsolutePath: (p: string) => `/mock/extension/${p}`,
      storageUri: vscode.Uri.file('/mock/storage'),
      globalStorageUri: vscode.Uri.file('/mock/global-storage'),
      logUri: vscode.Uri.file('/mock/log'),
      extensionMode: 1,
      environmentVariableCollection: {} as never,
      extension: { packageJSON: { version: '0.3.0' } } as never,
      languageModelAccessInformation: {} as never,
    } as unknown as vscode.ExtensionContext;
  }

  function configureInlineCompletions(enabled: boolean, globalValue?: boolean): void {
    vi.mocked(vscode.workspace.getConfiguration).mockImplementation(
      () =>
        ({
          get: vi.fn((key: string, fallback?: unknown) =>
            key === 'inlineCompletions.enabled' ? enabled : fallback,
          ),
          update: vi.fn(),
          has: vi.fn().mockReturnValue(true),
          inspect: vi.fn((key: string) =>
            key === 'agiWorkforce.inlineCompletions.enabled' || key === 'inlineCompletions.enabled'
              ? { key, globalValue }
              : undefined,
          ),
        }) as unknown as vscode.WorkspaceConfiguration,
    );
  }

  function privacyNotices(): string[] {
    return vi
      .mocked(vscode.window.showInformationMessage)
      .mock.calls.map(([message]) => String(message))
      .filter((message) => message.includes('surrounding code are sent'));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    __resetSubsystemHealthForTests();
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined as never);
  });

  it('tells the user what inline completions send, the first time they are on', async () => {
    configureInlineCompletions(true);
    const context = activationContext();

    activate(context);
    await vi.waitFor(() => expect(privacyNotices()).toHaveLength(1));

    const [notice] = privacyNotices();
    expect(notice).toContain('sensitive-file denylist');
    await vi.waitFor(() => expect(context.globalState.get(NOTICE_KEY)).toBe(true));
  });

  it('does not repeat the notice once it has been shown', async () => {
    configureInlineCompletions(true);
    const context = activationContext(true);

    activate(context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(privacyNotices()).toEqual([]);
  });

  it('asks for a credential when inline completions are on without one', async () => {
    configureInlineCompletions(true);

    activate(activationContext(true));
    await vi.waitFor(() =>
      expect(vi.mocked(vscode.window.showInformationMessage)).toHaveBeenCalledWith(
        expect.stringContaining('need AGI Cloud sign-in or an AGI API key'),
        expect.anything(),
      ),
    );
  });

  it('stays silent while inline completions are off', async () => {
    configureInlineCompletions(false);
    const context = activationContext();

    activate(context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(privacyNotices()).toEqual([]);
    expect(context.globalState.get(NOTICE_KEY)).toBeUndefined();
  });
});
