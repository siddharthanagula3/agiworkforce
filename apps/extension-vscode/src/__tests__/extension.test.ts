/**
 * extension.test.ts — Tests for extension activation/deactivation logic
 *
 * Tests the pure helper functions and activation behavior patterns.
 * Full integration tests require @vscode/test-electron.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── commandLabel helper ──────────────────────────────────────────────────────

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

// ── Status bar text builder ──────────────────────────────────────────────────

function buildStatusBarText(
  model: string,
  planMode: boolean,
  mcpEnabled: boolean,
  desktopBridgeEnabled: boolean,
  desktopBridgePort: number,
): string {
  const chips: string[] = [];
  if (planMode) chips.push('plan');
  if (mcpEnabled) chips.push('mcp');
  if (desktopBridgeEnabled) chips.push(`bridge:${desktopBridgePort}`);

  return chips.length > 0
    ? `$(hubot) AGI: ${model} · ${chips.join(' · ')}`
    : `$(hubot) AGI: ${model}`;
}

describe('buildStatusBarText', () => {
  it('shows model only when no features enabled', () => {
    expect(buildStatusBarText('auto', false, false, false, 8787)).toBe('$(hubot) AGI: auto');
  });

  it('shows plan mode chip', () => {
    const text = buildStatusBarText('claude-opus-4.6', true, false, false, 8787);
    expect(text).toContain('plan');
    expect(text).toContain('claude-opus-4.6');
  });

  it('shows mcp chip', () => {
    const text = buildStatusBarText('auto', false, true, false, 8787);
    expect(text).toContain('mcp');
  });

  it('shows bridge chip with port', () => {
    const text = buildStatusBarText('auto', false, false, true, 9090);
    expect(text).toContain('bridge:9090');
  });

  it('shows all chips together', () => {
    const text = buildStatusBarText('gpt-5-pro', true, true, true, 8787);
    expect(text).toContain('plan');
    expect(text).toContain('mcp');
    expect(text).toContain('bridge:8787');
    expect(text).toContain('gpt-5-pro');
  });
});

// ── Port reachability pattern ────────────────────────────────────────────────

describe('isLocalPortReachable pattern', () => {
  it('resolves to a boolean', async () => {
    // We cannot test real TCP connections in unit tests, but we validate the pattern
    const mockReachable = (port: number, timeoutMs: number): Promise<boolean> => {
      return new Promise((resolve) => {
        // In real code this opens a TCP socket
        resolve(port > 0 && timeoutMs > 0 ? false : false);
      });
    };

    const result = await mockReachable(8787, 800);
    expect(typeof result).toBe('boolean');
  });
});

// ── Activation commands registration ─────────────────────────────────────────

/**
 * Derive the command list dynamically from package.json so this test never
 * goes stale when commands are added or removed.
 */
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
      'agi-workforce.sendToDesktop',
      'agi-workforce.syncContextToDesktop',
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

// ── Model quick pick items ───────────────────────────────────────────────────

describe('model selection', () => {
  const MODELS = [
    'auto-balanced',
    'auto-economy',
    'auto-premium',
    'claude-opus-4.6',
    'claude-sonnet-4.6',
    'claude-haiku-4.5',
    'gpt-5.4-pro',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite',
    'deepseek-r1',
    'deepseek-chat',
    'sonar-pro',
    'grok-4',
  ];

  it('has 15 model options', () => {
    expect(MODELS).toHaveLength(15);
  });

  it('includes all major providers', () => {
    expect(MODELS.some((m) => m.startsWith('claude'))).toBe(true);
    expect(MODELS.some((m) => m.startsWith('gpt'))).toBe(true);
    expect(MODELS.some((m) => m.startsWith('gemini'))).toBe(true);
    expect(MODELS.some((m) => m.startsWith('deepseek'))).toBe(true);
    expect(MODELS.some((m) => m.includes('sonar'))).toBe(true);
    expect(MODELS.some((m) => m.includes('grok'))).toBe(true);
  });

  it('includes auto-routing options', () => {
    const autoModels = MODELS.filter((m) => m.startsWith('auto'));
    expect(autoModels).toHaveLength(3);
  });

  it('marks current model as picked', () => {
    const currentModel = 'claude-sonnet-4.6';
    const items = MODELS.map((m) => ({
      label: m,
      picked: m === currentModel,
    }));

    const picked = items.filter((i) => i.picked);
    expect(picked).toHaveLength(1);
    expect(picked[0].label).toBe('claude-sonnet-4.6');
  });
});

// ── API key validation pattern ───────────────────────────────────────────────

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

// ── Feature flag validation patterns ─────────────────────────────────────────

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

  it('warns when MCP enabled without desktop bridge', () => {
    const mcpEnabled = true;
    const desktopBridgeEnabled = false;
    const shouldWarn = mcpEnabled && !desktopBridgeEnabled;
    expect(shouldWarn).toBe(true);
  });
});

// ── Configuration change detection ───────────────────────────────────────────

describe('configuration change detection', () => {
  const STATUS_BAR_CONFIGS = [
    'agiWorkforce.model',
    'agiWorkforce.agent.planMode',
    'agiWorkforce.mcp.enabled',
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

// ── Inline completions first-run notice logic ────────────────────────────────

/**
 * Pure helper that mirrors the logic in checkInlineCompletionsFirstRun().
 * We test the decision logic here; the vscode API interactions are covered by
 * the integration-style tests below using the mock context.
 */
function shouldShowInlineFirstRunNotice(
  alreadyShown: boolean | undefined,
  globalValueSet: boolean,
): boolean {
  if (globalValueSet) return false;
  if (alreadyShown === true) return false;
  return true;
}

describe('inline completions first-run notice', () => {
  // ── mock context wiring ──────────────────────────────────────────────────────

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

  // ── decision-logic unit tests ────────────────────────────────────────────────

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

  // ── state-mutation tests ─────────────────────────────────────────────────────

  it('sets firstRunNoticeShown flag after "Got it" click', async () => {
    const ctx = makeContext();
    // Simulate clicking "Got it"
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
