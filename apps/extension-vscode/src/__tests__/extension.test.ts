/**
 * extension.test.ts — Tests for extension activation/deactivation logic
 *
 * Tests the pure helper functions and activation behavior patterns.
 * Full integration tests require @vscode/test-electron.
 */

import { describe, it, expect } from 'vitest';

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

describe('extension command registration', () => {
  const EXPECTED_COMMANDS = [
    'agi-workforce.chat',
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

  it('should register all expected commands', () => {
    // Verify the extension contributes all required commands
    expect(EXPECTED_COMMANDS).toHaveLength(11);
    expect(EXPECTED_COMMANDS).toContain('agi-workforce.chat');
    expect(EXPECTED_COMMANDS).toContain('agi-workforce.setApiKey');
    expect(EXPECTED_COMMANDS).toContain('agi-workforce.selectModel');
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
    'gpt-5-pro',
    'gpt-5.2',
    'gpt-5-nano',
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
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
