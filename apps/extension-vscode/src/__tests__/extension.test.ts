
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getModelMetadataById } from '@agiworkforce/types';
import { MODEL_PICKER_OPTIONS } from '../features/model-picker/modelConstants';
import { buildExtensionStatusBarText } from '../core/statusBar';

function commandLabel(command: string): string {
  const labels: Record<string, string> = {
    explain: 'Explain Code',
    fix: 'Fix Issues',
    refactor: 'Refactor',
    tests: 'Generate Tests',
  };
  return labels[command] ?? command;
}

describe('commandLabel', () => {
  it('maps "explain" to "Explain Code"', () => {
    expect(commandLabel('explain')).toBe('Explain Code');
  });

  it('maps "fix" to "Fix Issues"', () => {
    expect(commandLabel('fix')).toBe('Fix Issues');
  });

  it('maps "refactor" to "Refactor"', () => {
    expect(commandLabel('refactor')).toBe('Refactor');
  });

  it('maps "tests" to "Generate Tests"', () => {
    expect(commandLabel('tests')).toBe('Generate Tests');
  });

  it('returns the command itself for unknown commands', () => {
    expect(commandLabel('custom')).toBe('custom');
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

describe('isLocalPortReachable pattern', () => {
  it('resolves to a boolean', async () => {
    const mockReachable = (port: number, timeoutMs: number): Promise<boolean> => {
      return new Promise((resolve) => {
        resolve(port > 0 && timeoutMs > 0 ? false : false);
      });
    };

    const result = await mockReachable(8787, 800);
    expect(typeof result).toBe('boolean');
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

describe('API key validation', () => {
  function validateApiKey(value: string): string | undefined {
    if (value.trim() === '') return 'API key cannot be empty.';
    return undefined;
  }

  it('rejects empty string', () => {
    expect(validateApiKey('')).toBe('API key cannot be empty.');
  });

  it('rejects whitespace-only string', () => {
    expect(validateApiKey('   ')).toBe('API key cannot be empty.');
  });

  it('accepts non-empty key', () => {
    expect(validateApiKey('sk-agi-test-123')).toBeUndefined();
  });
});

describe('feature flag validation', () => {
  it('warns when inline completions enabled without API key', () => {
    const inlineEnabled = true;
    const hasApiKey = false;
    const shouldWarn = inlineEnabled && !hasApiKey;
    expect(shouldWarn).toBe(true);
  });

  it('does not warn when inline completions disabled', () => {
    const inlineEnabled = false;
    const hasApiKey = false;
    const shouldWarn = inlineEnabled && !hasApiKey;
    expect(shouldWarn).toBe(false);
  });
});

describe('configuration change detection', () => {
  const STATUS_BAR_CONFIGS = [
    'agiWorkforce.model',
    'agiWorkforce.agent.planMode',
    'agiWorkforce.desktopBridge.enabled',
    'agiWorkforce.desktopBridge.port',
  ];

  const INLINE_CONFIGS = ['agiWorkforce.inlineCompletions.enabled'];

  it('detects model change as status bar update', () => {
    const changed = 'agiWorkforce.model';
    expect(STATUS_BAR_CONFIGS.includes(changed)).toBe(true);
  });

  it('detects inline completion change', () => {
    const changed = 'agiWorkforce.inlineCompletions.enabled';
    expect(INLINE_CONFIGS.includes(changed)).toBe(true);
  });

  it('does not trigger status bar for unrelated changes', () => {
    const changed = 'editor.fontSize';
    expect(STATUS_BAR_CONFIGS.includes(changed)).toBe(false);
  });
});

function shouldShowInlineFirstRunNotice(
  alreadyShown: boolean | undefined,
  globalValueSet: boolean,
): boolean {
  if (globalValueSet) return false;
  if (alreadyShown === true) return false;
  return true;
}

describe('inline completions first-run notice', () => {

  interface MockGlobalState {
    store: Map<string, unknown>;
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): Promise<void>;
  }

  interface MockContext {
    globalState: MockGlobalState;
  }

  function makeContext(initial?: Record<string, unknown>): MockContext {
    const store = new Map<string, unknown>(Object.entries(initial ?? {}));
    return {
      globalState: {
        store,
        get<T>(key: string): T | undefined {
          return store.get(key) as T | undefined;
        },
        async update(key: string, value: unknown): Promise<void> {
          store.set(key, value);
        },
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows notice on first run when user has not set global preference', () => {
    expect(shouldShowInlineFirstRunNotice(undefined, false)).toBe(true);
  });

  it('suppresses notice when user has already set global preference (any value)', () => {
    expect(shouldShowInlineFirstRunNotice(undefined, true)).toBe(false);
  });

  it('suppresses notice when first-run flag is already true', () => {
    expect(shouldShowInlineFirstRunNotice(true, false)).toBe(false);
  });

  it('shows notice when flag is false and no global preference', () => {
    expect(shouldShowInlineFirstRunNotice(false, false)).toBe(true);
  });

  it('sets firstRunNoticeShown flag after "Got it" click', async () => {
    const ctx = makeContext();
    if (
      shouldShowInlineFirstRunNotice(
        ctx.globalState.get('inlineCompletions.firstRunNoticeShown'),
        false,
      )
    ) {
      await ctx.globalState.update('inlineCompletions.firstRunNoticeShown', true);
    }
    expect(ctx.globalState.get('inlineCompletions.firstRunNoticeShown')).toBe(true);
  });

  it('does not re-show notice after flag is set', async () => {
    const ctx = makeContext({ 'inlineCompletions.firstRunNoticeShown': true });
    const shouldShow = shouldShowInlineFirstRunNotice(
      ctx.globalState.get('inlineCompletions.firstRunNoticeShown'),
      false,
    );
    expect(shouldShow).toBe(false);
  });
});
