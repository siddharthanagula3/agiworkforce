/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSettingsWebviewContent } from '../features/settings/settingsWebviewContent';
import type {
  SettingsLocalCapabilities,
  SettingsPanelState,
  SettingsSection,
} from '../features/settings/settingsProtocol';
import { vscodeApiStub } from './vscodeApiStub';

const state: SettingsPanelState = {
  values: {
    apiEndpoint: 'https://agiworkforce.com/api/llm/v1',
    model: 'auto',
    cliPath: 'agi',
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
    currentTier: 'pro',
  },
  workspaceOverrides: [],
  workspaceTrusted: true,
  accountConnected: false,
  accountStatus: 'signed-out',
  agentConfigPath: '/host/.agiworkforce/config.toml',
  instructionContext: {
    host: '',
    workspace: '',
    effective: '',
    effectiveScope: 'host',
    turnPrelude: '',
    projectSources: [],
  },
};

const capabilities: SettingsLocalCapabilities = {
  canAddMcpServer: true,
  mcp: {
    status: 'ready',
    rows: [
      {
        name: 'computer-use',
        source: 'user',
        enabled: false,
        switchable: true,
        inspectable: false,
        state: 'Off',
      },
      { name: 'context7', source: 'user', enabled: true, switchable: true, inspectable: true },
      {
        name: 'repo-tools',
        source: 'project',
        enabled: true,
        switchable: false,
        inspectable: true,
        state: 'From this workspace',
      },
      {
        name: 'sites-picker',
        source: 'plugin',
        enabled: true,
        switchable: false,
        inspectable: true,
      },
    ],
  },
  plugins: {
    status: 'ready',
    rows: [
      { id: 'reviewer', name: 'Reviewer', detail: '1.2.0, user', enabled: true, switchable: true },
      { id: 'docs', name: 'Docs', detail: 'project', enabled: false, switchable: true },
    ],
  },
  skills: {
    status: 'ready',
    rows: [
      {
        id: 'release-notes',
        name: 'release-notes',
        detail: 'Draft release notes',
        enabled: true,
        switchable: true,
      },
      {
        id: 'local-deploy',
        name: 'local-deploy',
        detail: 'Not allowed in this folder yet',
        enabled: false,
        switchable: false,
      },
    ],
  },
};

function boot(section: SettingsSection = 'mcp'): ReturnType<typeof vi.fn> {
  const parsed = new DOMParser().parseFromString(
    getSettingsWebviewContent(
      { cspSource: 'vscode-webview://settings-test' } as never,
      'settings-test-nonce',
      state,
      section,
    ),
    'text/html',
  );
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  const postMessage = vi.fn();
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => vscodeApiStub({ postMessage }),
  });
  const script = Array.from(parsed.querySelectorAll('script')).find((candidate) =>
    candidate.textContent?.includes('acquireVsCodeApi()'),
  );
  // llm-guardrail-allow: executes repository-owned settings webview JavaScript in jsdom
  new Function(script?.textContent ?? '')();
  return postMessage;
}

function deliver(next: SettingsLocalCapabilities): void {
  window.dispatchEvent(
    new MessageEvent('message', { data: { type: 'settings.capabilities', capabilities: next } }),
  );
}

function rowNames(listId: string): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`#${listId} .capability-row-name`)).map(
    (name) => name.textContent ?? '',
  );
}

function visibleSection(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-settings-section]:not([hidden])');
}

describe('settings local capability pages', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('opens on the reference title and a loading list instead of the old placeholder', () => {
    boot();

    expect(document.getElementById('pageTitle')?.textContent).toBe('MCP servers');
    expect(document.getElementById('pageDescription')?.textContent).toBe(
      'Connect external tools and data sources.',
    );
    expect(document.body.textContent).not.toContain('Local MCP is runtime-owned');
    expect(document.body.textContent).not.toContain('No VS Code plugin registry is installed');
    expect(rowNames('mcpServerList')).toEqual([]);
    expect(document.querySelector('#mcpServerList .capability-list-note')?.textContent).toBe(
      'Loading…',
    );
    expect(document.getElementById('mcpAddServer')?.hidden).toBe(true);
  });

  it('lists servers with switches and details, and plugin servers read-only below', () => {
    boot();
    deliver(capabilities);

    expect(rowNames('mcpServerList')).toEqual(['computer-use', 'context7', 'repo-tools']);
    expect(rowNames('mcpPluginServerList')).toEqual(['sites-picker']);
    expect(document.getElementById('mcpPluginServers')?.hidden).toBe(false);
    expect(document.querySelector('#mcpPluginServerList input, #mcpPluginServerList button')).toBe(
      null,
    );

    const switches = Array.from(
      document.querySelectorAll<HTMLInputElement>('#mcpServerList input[role="switch"]'),
    );
    expect(switches.map((input) => [input.getAttribute('aria-label'), input.checked])).toEqual([
      ['computer-use', false],
      ['context7', true],
    ]);
    expect(
      Array.from(document.querySelectorAll('#mcpServerList [data-mcp-details]')).map((button) =>
        button.getAttribute('data-mcp-details'),
      ),
    ).toEqual(['context7', 'repo-tools']);
    expect(document.getElementById('mcpAddServer')?.hidden).toBe(false);
  });

  it('shows a count after each tab name, counting only the servers card for MCPs', () => {
    boot();
    deliver(capabilities);

    const tabs = Array.from(
      document.querySelectorAll<HTMLButtonElement>('#section-mcp .capability-tab'),
    );
    expect(tabs.map((tab) => tab.textContent?.replace(/\s+/gu, ' ').trim())).toEqual([
      'Plugins2',
      'MCPs3',
      'Skills2',
    ]);
    expect(tabs[1]?.getAttribute('aria-current')).toBe('page');
  });

  it('sends a switch change at once and puts it back when the runtime refuses', () => {
    const postMessage = boot();
    deliver(capabilities);
    const computerUse = document.querySelector<HTMLInputElement>(
      '#mcpServerList input[aria-label="computer-use"]',
    );
    computerUse!.checked = true;
    computerUse!.dispatchEvent(new Event('change'));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'settings.capability.setEnabled',
      kind: 'mcp',
      id: 'computer-use',
      enabled: true,
    });
    expect(computerUse!.disabled).toBe(true);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'settings.error', message: 'computer-use could not be turned on' },
      }),
    );
    const restored = document.querySelector<HTMLInputElement>(
      '#mcpServerList input[aria-label="computer-use"]',
    );
    expect(restored?.checked).toBe(false);
    expect(restored?.disabled).toBe(false);
    expect(document.getElementById('status')?.textContent).toBe(
      'computer-use could not be turned on',
    );
  });

  it('asks the host to add a server and to open a server’s details', () => {
    const postMessage = boot();
    deliver(capabilities);

    document.getElementById('mcpAddServer')?.click();
    document.querySelector<HTMLButtonElement>('[data-mcp-details="context7"]')?.click();

    expect(postMessage).toHaveBeenCalledWith({ type: 'settings.mcp.add' });
    expect(postMessage).toHaveBeenCalledWith({ type: 'settings.mcp.details', name: 'context7' });
  });

  it('switches pages from the tabs and toggles plugins and skills', () => {
    const postMessage = boot();
    deliver(capabilities);

    document
      .querySelector<HTMLButtonElement>('#section-mcp [data-capability-tab="plugins"]')
      ?.click();
    expect(visibleSection()?.id).toBe('section-plugins');
    expect(document.getElementById('pageTitle')?.textContent).toBe('Plugins');
    expect(rowNames('pluginList')).toEqual(['Reviewer', 'Docs']);
    const docs = document.querySelector<HTMLInputElement>('#pluginList input[aria-label="Docs"]');
    docs!.checked = true;
    docs!.dispatchEvent(new Event('change'));
    expect(postMessage).toHaveBeenCalledWith({
      type: 'settings.capability.setEnabled',
      kind: 'plugin',
      id: 'docs',
      enabled: true,
    });

    document
      .querySelector<HTMLButtonElement>('#section-plugins [data-capability-tab="skills"]')
      ?.click();
    expect(visibleSection()?.id).toBe('section-skills');
    expect(rowNames('skillList')).toEqual(['release-notes', 'local-deploy']);
    expect(
      Array.from(document.querySelectorAll('#skillList input[role="switch"]')).map((input) =>
        input.getAttribute('aria-label'),
      ),
    ).toEqual(['release-notes']);
  });

  it('says why a list is missing when the runtime cannot provide it', () => {
    boot('plugins');
    deliver({
      ...capabilities,
      canAddMcpServer: false,
      plugins: { status: 'unavailable', message: 'Needs AGI CLI 1.0.0 to manage plugins' },
      mcp: { status: 'ready', rows: [] },
    });

    expect(document.querySelector('#pluginList .capability-list-note')?.textContent).toBe(
      'Needs AGI CLI 1.0.0 to manage plugins',
    );
    expect(document.querySelector('#mcpServerList .capability-list-note')?.textContent).toBe(
      'No MCP servers are configured yet.',
    );
    expect(document.getElementById('mcpPluginServers')?.hidden).toBe(true);
    expect(
      document.querySelector('#section-plugins [data-capability-count="plugins"]')?.textContent,
    ).toBe('');
  });
});
