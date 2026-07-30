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
});
