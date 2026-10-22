import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { SettingsPanel } from '../features/settings/SettingsPanel';
import {
  parseSettingsWebviewMessage,
  type SettingsHostMessage,
  type SettingsLocalCapabilities,
} from '../features/settings/settingsProtocol';
import type { CliCapabilityAdapter } from '../features/surfaces/cliCapabilities';
import type { McpServerDetailsProvider } from '../features/surfaces/mcpServerDetails';
import { initializeAgentModeConsent } from '../features/permissions/agentModeConsent';

const LISTS: Record<string, unknown> = {
  mcpServers: {
    servers: [
      { name: 'context7', transport: 'stdio', scope: 'user', status: 'configured' },
      {
        name: 'computer-use',
        transport: 'stdio',
        scope: 'user',
        status: 'configured',
        disabled: true,
      },
      { name: 'github', transport: 'http', scope: 'user', status: 'needs_auth' },
      { name: 'repo-tools', transport: 'stdio', scope: 'project', status: 'configured' },
      { name: 'sites-picker', transport: 'stdio', scope: 'plugin', status: 'configured' },
    ],
  },
  plugins: {
    plugins: [
      {
        id: 'reviewer',
        name: 'Reviewer',
        version: '1.2.0',
        enabled: true,
        source: 'user',
        path: '/home/dev/.agiworkforce/plugins/reviewer',
      },
    ],
  },
  skills: {
    skills: [
      {
        name: 'release-notes',
        description: 'Draft release notes',
        scope: 'user',
        enabled: true,
        consented: true,
      },
      {
        name: 'local-deploy',
        description: 'Deploy from this folder',
        scope: 'project',
        enabled: true,
        consented: false,
      },
    ],
  },
};

function fakeAdapter(offered: readonly string[]) {
  const call = vi.fn(async (capability: string) =>
    capability in LISTS
      ? { status: 'ok' as const, value: LISTS[capability] }
      : { status: 'ok' as const, value: { servers: [] } },
  );
  const offers = vi.fn(async (family: string) => offered.includes(family));
  return { call, offers, adapter: { call, offers } as unknown as CliCapabilityAdapter };
}

describe('SettingsPanel local capabilities', () => {
  let context: vscode.ExtensionContext;
  let handler: ((message: unknown) => Promise<void>) | undefined;
  let posted: SettingsHostMessage[];
  const details = { show: vi.fn() } as unknown as McpServerDetailsProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    SettingsPanel.__resetForTests();
    context = new vscode.ExtensionContext();
    initializeAgentModeConsent(context);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((_key: string, fallback?: unknown) => fallback),
      update: vi.fn(),
      has: vi.fn(),
      inspect: vi.fn(() => undefined),
    } as unknown as vscode.WorkspaceConfiguration);
    handler = undefined;
    posted = [];
    const panel = {
      webview: {
        html: '',
        options: {},
        cspSource: 'vscode-webview://settings-test',
        postMessage: vi.fn(async (message: SettingsHostMessage) => {
          posted.push(message);
          return true;
        }),
        onDidReceiveMessage: vi.fn((next: (message: unknown) => Promise<void>) => {
          handler = next;
          return { dispose: vi.fn() };
        }),
      },
      reveal: vi.fn(),
      onDidDispose: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      dispose: vi.fn(),
      viewColumn: vscode.ViewColumn.One,
    } as unknown as vscode.WebviewPanel;
    vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel);
  });

  afterEach(() => {
    SettingsPanel.__resetForTests();
    vi.restoreAllMocks();
  });

  function lastCapabilities(): SettingsLocalCapabilities | undefined {
    const message = posted.filter((entry) => entry.type === 'settings.capabilities').at(-1);
    return message?.type === 'settings.capabilities' ? message.capabilities : undefined;
  }

  it('sends the runtime’s servers, plugins and skills once the page is ready', async () => {
    const { adapter } = fakeAdapter(['mcpSetEnabled', 'installs', 'mcpInspect']);
    SettingsPanel.createOrShow(context, 'mcp', undefined, { adapter, mcpServerDetails: details });
    await handler!({ type: 'settings.ready' });

    const capabilities = lastCapabilities();
    expect(capabilities?.canAddMcpServer).toBe(true);
    expect(capabilities?.mcp).toEqual({
      status: 'ready',
      rows: [
        { name: 'context7', source: 'user', enabled: true, switchable: true, inspectable: true },
        {
          name: 'computer-use',
          source: 'user',
          enabled: false,
          switchable: true,
          inspectable: false,
          state: 'Off',
        },
        {
          name: 'github',
          source: 'user',
          enabled: true,
          switchable: true,
          inspectable: true,
          state: 'Needs sign-in',
        },
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
    });
    expect(capabilities?.plugins).toEqual({
      status: 'ready',
      rows: [
        {
          id: 'reviewer',
          name: 'Reviewer',
          detail: '1.2.0, user',
          enabled: true,
          switchable: true,
        },
      ],
    });
    expect(capabilities?.skills).toMatchObject({
      status: 'ready',
      rows: [
        { id: 'release-notes', enabled: true, switchable: true },
        { id: 'local-deploy', enabled: false, switchable: false },
      ],
    });
  });

  it('offers no server switch to a runtime that does not advertise one', async () => {
    const { adapter } = fakeAdapter(['installs']);
    SettingsPanel.createOrShow(context, 'mcp', undefined, { adapter, mcpServerDetails: details });
    await handler!({ type: 'settings.ready' });

    const mcp = lastCapabilities()?.mcp;
    expect(mcp?.status === 'ready' && mcp.rows.some((row) => row.switchable)).toBe(false);
    expect(mcp?.status === 'ready' && mcp.rows.some((row) => row.inspectable)).toBe(false);
  });

  it('turns a server off through the runtime and sends the refreshed list', async () => {
    const { adapter, call } = fakeAdapter(['mcpSetEnabled']);
    SettingsPanel.createOrShow(context, 'mcp', undefined, { adapter, mcpServerDetails: details });

    await handler!({
      type: 'settings.capability.setEnabled',
      kind: 'mcp',
      id: 'context7',
      enabled: false,
    });

    expect(call).toHaveBeenCalledWith('mcpSetEnabled', 'context7', false);
    expect(lastCapabilities()?.mcp.status).toBe('ready');
    expect(posted.some((message) => message.type === 'settings.error')).toBe(false);
  });

  it('reports a refused switch and still resends the runtime’s state', async () => {
    const { adapter, call } = fakeAdapter(['mcpSetEnabled']);
    call.mockImplementationOnce(async () => ({
      status: 'failed',
      reason: 'Reviewer could not be turned off',
    }));
    SettingsPanel.createOrShow(context, 'mcp', undefined, { adapter, mcpServerDetails: details });

    await handler!({
      type: 'settings.capability.setEnabled',
      kind: 'plugin',
      id: 'reviewer',
      enabled: false,
    });

    expect(call).toHaveBeenNthCalledWith(1, 'pluginsSetEnabled', 'reviewer', false);
    expect(posted).toContainEqual({
      type: 'settings.error',
      message: 'Reviewer could not be turned off',
    });
    expect(posted.at(-1)?.type).toBe('settings.capabilities');
  });

  it('opens the plugin and skill managers and the server details view', async () => {
    const { adapter, call } = fakeAdapter(['mcpInspect']);
    call.mockImplementation(async (capability: string) =>
      capability === 'mcpInspect'
        ? { status: 'ok' as const, value: { name: 'context7' } }
        : { status: 'ok' as const, value: LISTS[capability] },
    );
    SettingsPanel.createOrShow(context, 'mcp', undefined, { adapter, mcpServerDetails: details });

    await handler!({ type: 'settings.command', command: 'showSkills' });
    await handler!({ type: 'settings.command', command: 'showPlugins' });
    await handler!({ type: 'settings.mcp.details', name: 'context7' });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('agi-workforce.showSkills');
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('agi-workforce.showPlugins');
    expect(call).toHaveBeenCalledWith('mcpInspect', 'context7');
    expect(details.show).toHaveBeenCalledWith({ name: 'context7' });
  });

  it('says the runtime is not connected when the panel has no capability host', async () => {
    SettingsPanel.createOrShow(context, 'plugins');
    await handler!({ type: 'settings.ready' });

    expect(lastCapabilities()?.plugins).toEqual({
      status: 'unavailable',
      message: 'The AGI CLI is not connected to this window.',
    });
  });

  it('accepts only well-formed capability messages from the page', () => {
    expect(
      parseSettingsWebviewMessage({
        type: 'settings.capability.setEnabled',
        kind: 'skill',
        id: 'release-notes',
        enabled: true,
      }),
    ).toEqual({
      type: 'settings.capability.setEnabled',
      kind: 'skill',
      id: 'release-notes',
      enabled: true,
    });
    expect(
      parseSettingsWebviewMessage({
        type: 'settings.capability.setEnabled',
        kind: 'hook',
        id: 'x',
        enabled: true,
      }),
    ).toBeUndefined();
    expect(
      parseSettingsWebviewMessage({
        type: 'settings.capability.setEnabled',
        kind: 'mcp',
        id: '',
        enabled: true,
      }),
    ).toBeUndefined();
    expect(parseSettingsWebviewMessage({ type: 'settings.mcp.add', extra: 1 })).toBeUndefined();
    expect(parseSettingsWebviewMessage({ type: 'settings.mcp.details', name: 'context7' })).toEqual(
      { type: 'settings.mcp.details', name: 'context7' },
    );
  });
});
