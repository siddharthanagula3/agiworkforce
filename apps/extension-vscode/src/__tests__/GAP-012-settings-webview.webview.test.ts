/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSettingsWebviewContent } from '../features/settings/settingsWebviewContent';
import { SETTINGS_SECTIONS, type SettingsPanelState } from '../features/settings/settingsProtocol';
import { SETTINGS_PANEL_SETTING_KEYS } from '../platform/config';

const initialState: SettingsPanelState = {
  values: {
    apiEndpoint: 'https://agiworkforce.com/api/llm/v1',
    model: 'auto',
    cliPath: 'agi',
    streamingEnabled: true,
    'composer.followUpBehavior': 'queue',
    contextLines: 50,
    telemetryEnabled: false,
    hoverEnabled: false,
    codeLensEnabled: false,
    autoApplyFixes: false,
    'inlineCompletions.enabled': false,
    'inlineCompletions.debounceMs': 300,
    'inlineCompletions.maxLength': 500,
    'agent.mode': 'auto',
    'agent.effort': 'medium',
    'agent.thinking': false,
    'mcp.enabled': false,
    'desktopBridge.enabled': false,
    'desktopBridge.port': 8787,
    telemetryEndpoint: 'https://telemetry.agiworkforce.com/v1/events',
    useProviderStream: false,
    gatewayUrl: 'https://api.agiworkforce.com',
    tier: 'byok',
    currentTier: 'pro',
  },
  workspaceOverrides: [],
  workspaceTrusted: true,
  accountConnected: false,
  agentConfigPath: '/host/.agiworkforce/config.toml',
  instructionContext: {
    host: 'Prefer focused tests.',
    workspace: '',
    effective: 'Prefer focused tests.',
    effectiveScope: 'host',
    turnPrelude:
      '## User-saved custom instructions (this VS Code host)\n\n<custom_instructions>\nPrefer focused tests.\n</custom_instructions>',
    projectSources: [
      {
        fileName: 'AGENTS.md',
        path: '/workspace/AGENTS.md',
        content: 'Use pnpm.',
        truncated: false,
      },
    ],
  },
};

function render(): string {
  return getSettingsWebviewContent(
    { cspSource: 'vscode-webview://settings-test' } as never,
    'settings-test-nonce',
    initialState,
    'general',
  );
}

function parse(): Document {
  return new DOMParser().parseFromString(render(), 'text/html');
}

function boot(): ReturnType<typeof vi.fn> {
  const parsed = parse();
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  const postMessage = vi.fn();
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => ({ postMessage }),
  });
  const script = Array.from(parsed.querySelectorAll('script')).find((candidate) =>
    candidate.textContent?.includes('acquireVsCodeApi()'),
  );
  // llm-guardrail-allow: executes repository-owned settings webview JavaScript in jsdom
  new Function(script?.textContent ?? '')();
  return postMessage;
}

describe('settings webview', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('uses a nonce-only CSP and ships parseable browser JavaScript', () => {
    const html = render();
    const doc = parse();
    const scripts = Array.from(doc.querySelectorAll('script')).filter(
      (script) => (script.textContent ?? '').trim().length > 0,
    );

    expect(html).toMatch(/default-src\s+'none'/u);
    expect(html).toMatch(/script-src\s+'nonce-settings-test-nonce'/u);
    expect(html).not.toMatch(/script-src[^;]*'unsafe-(?:inline|eval)'/u);
    for (const script of scripts) {
      // llm-guardrail-allow: parser-only use in a test; the function is never invoked here
      expect(() => new Function(script.textContent ?? '')).not.toThrow();
    }
  });

  it('renders the full branded information architecture and every active setting', () => {
    const doc = parse();
    const navSections = Array.from(doc.querySelectorAll('.nav-button[data-section]')).map(
      (button) => button.getAttribute('data-section'),
    );
    const renderedSettings = Array.from(doc.querySelectorAll('[data-setting]')).map((control) =>
      control.getAttribute('data-setting'),
    );

    expect(navSections).toEqual(SETTINGS_SECTIONS);
    expect([...new Set(renderedSettings)].sort()).toEqual([...SETTINGS_PANEL_SETTING_KEYS].sort());
    expect(renderedSettings).not.toContain('agent.planMode');
    expect(doc.querySelector('[data-command="openRawSettings"]')).not.toBeNull();
    expect(doc.querySelectorAll('[id]').length).toBe(
      new Set(Array.from(doc.querySelectorAll('[id]')).map((element) => element.id)).size,
    );
  });

  it('keeps surface-bound capabilities visible with honest VS Code availability', () => {
    const doc = parse();
    const rows = Array.from(
      doc.querySelectorAll<HTMLElement>('[data-capability-id][data-capability-available]'),
    );

    expect(rows.map((row) => row.dataset.capabilityId)).toEqual([
      'managed-plugins',
      'browser-control',
      'computer-use',
    ]);
    for (const row of rows) {
      expect(row.dataset.capabilityAvailable).toBe('false');
      expect(row.classList.contains('is-unavailable')).toBe(true);
      expect(row.querySelector('.capability-availability-status')?.textContent).toBe(
        'Unavailable in this context',
      );
      // Availability used to be a hover-only `title` tooltip. It is now a
      // visible second column (.surface-availability), which is why the grid
      // caps that column's width — see settingsWebviewContent.ts:685-692.
      // Hover-only disclosure was unreachable by keyboard and touch.
      expect(row.querySelector('.surface-availability')?.textContent).toMatch(
        /^Available in .+\.$/u,
      );
    }

    expect(rows[1]?.querySelector('.surface-availability')?.textContent).toBe(
      'Available in Desktop app and Chrome extension.',
    );
    expect(rows[2]?.querySelector('.surface-availability')?.textContent).toBe(
      'Available in Desktop app and Chrome extension.',
    );
    expect(doc.querySelector('[aria-label="Capability availability in VS Code"]')).not.toBeNull();
  });

  it('navigates sections and emits a typed numeric settings update', () => {
    const postMessage = boot();
    const configurationButton = document.querySelector(
      '.nav-button[data-section="configuration"]',
    ) as HTMLButtonElement;
    configurationButton.click();

    expect(document.getElementById('section-configuration')?.hidden).toBe(false);
    expect(document.getElementById('section-general')?.hidden).toBe(true);
    expect(configurationButton.getAttribute('aria-current')).toBe('page');

    const contextLines = document.getElementById('setting-context-lines') as HTMLInputElement;
    contextLines.value = '120';
    contextLines.dispatchEvent(new Event('change', { bubbles: true }));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'settings.update',
      key: 'contextLines',
      value: 120,
    });
    expect(contextLines.disabled).toBe(true);
  });

  it('reflects host snapshots for overrides, trust, and account connection', () => {
    boot();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'settings.snapshot',
          state: {
            ...initialState,
            workspaceTrusted: false,
            workspaceOverrides: ['model'],
            accountConnected: true,
          },
        },
      }),
    );

    expect(document.getElementById('trustPill')?.textContent).toBe('Restricted workspace');
    expect(document.getElementById('overrideNotice')?.textContent).toContain('Model');
    expect(document.getElementById('overrideNotice')?.hidden).toBe(false);
    expect(document.getElementById('accountStatus')?.textContent).toBe('Connected to AGI Cloud');
    expect((document.getElementById('signOutButton') as HTMLButtonElement).hidden).toBe(false);
  });

  it('renders instruction sources and emits explicit-scope saves', () => {
    const postMessage = boot();
    expect(document.getElementById('agentConfigPath')?.textContent).toBe(
      '/host/.agiworkforce/config.toml',
    );
    expect(document.getElementById('instructionPrelude')?.textContent).toContain(
      'Prefer focused tests.',
    );
    expect(document.getElementById('instructionSources')?.textContent).toContain('AGENTS.md');

    const workspaceInstructions = document.getElementById(
      'workspaceCustomInstructions',
    ) as HTMLTextAreaElement;
    workspaceInstructions.value = 'Use the workspace fixtures.';
    workspaceInstructions.dispatchEvent(new Event('input', { bubbles: true }));
    (document.querySelector('[data-instruction-save="workspace"]') as HTMLButtonElement).click();

    expect(document.getElementById('workspaceInstructionCount')?.textContent).toContain('27');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'settings.instructions.update',
      scope: 'workspace',
      value: 'Use the workspace fixtures.',
    });
  });
});
