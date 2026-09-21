import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { activate } from '../extension';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';
import { __resetStartupWorkForTests } from '../core/startupWork';
import { ChatEditorPanel } from '../providers/chatEditorPanel';

const { heartbeat, tierRefresh } = vi.hoisted(() => ({
  heartbeat: vi.fn(),
  tierRefresh: vi.fn(),
}));

vi.mock('../features/device-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/device-registry')>();
  return {
    ...actual,
    startVscodeHeartbeat: (...args: unknown[]) => {
      heartbeat(...args);
      return new vscode.Disposable(() => undefined);
    },
  };
});

vi.mock('../integrations/tierResolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../integrations/tierResolver')>();
  return {
    ...actual,
    refreshAccountTierCache: (...args: unknown[]) => {
      tierRefresh(...args);
      return Promise.resolve(undefined);
    },
  };
});

function startupSetting(enabled: boolean): void {
  vi.mocked(vscode.workspace.getConfiguration).mockImplementation(
    () =>
      ({
        get: vi.fn((key: string, defaultValue?: unknown) =>
          key === 'activateOnStartup' ? enabled : defaultValue,
        ),
        update: vi.fn().mockResolvedValue(undefined),
        has: vi.fn().mockReturnValue(false),
        inspect: vi.fn((key: string) =>
          key === 'activateOnStartup' ? { key, globalValue: enabled } : undefined,
        ),
      }) as unknown as vscode.WorkspaceConfiguration,
  );
}

function openTheChatView(): void {
  const [, provider] = vi
    .mocked(vscode.window.registerWebviewViewProvider)
    .mock.calls.find(([id]) => id === 'agi-workforce.sidebar') ?? [undefined, undefined];
  const view = {
    webview: {
      options: {},
      html: '',
      cspSource: 'https://mock.csp.source',
      asWebviewUri: (uri: vscode.Uri) => uri,
      postMessage: vi.fn().mockResolvedValue(true),
      onDidReceiveMessage: vi.fn(() => new vscode.Disposable()),
    },
    onDidChangeVisibility: vi.fn(() => new vscode.Disposable()),
    onDidDispose: vi.fn(() => new vscode.Disposable()),
    visible: true,
    show: vi.fn(),
  };
  (provider as vscode.WebviewViewProvider).resolveWebviewView(
    view as unknown as vscode.WebviewView,
    {} as vscode.WebviewViewResolveContext,
    {} as vscode.CancellationToken,
  );
}

describe('background work waits for the user to reach for AGI', () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    heartbeat.mockClear();
    tierRefresh.mockClear();
    __resetStartupWorkForTests();
    ChatEditorPanel.__resetForTests();
    startupSetting(false);
    handlers = new Map();
    vi.mocked(vscode.commands.registerCommand).mockImplementation((id, handler) => {
      handlers.set(id, handler);
      return new vscode.Disposable(() => undefined);
    });
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
  });

  afterEach(() => {
    __resetSubsystemHealthForTests();
    __resetStartupWorkForTests();
    ChatEditorPanel.__resetForTests();
    vi.restoreAllMocks();
  });

  it('opens a window without a heartbeat or a plan lookup', () => {
    activate(new vscode.ExtensionContext());

    expect(heartbeat).not.toHaveBeenCalled();
    expect(tierRefresh).not.toHaveBeenCalled();
  });

  it('starts them when the activity-bar view is opened', () => {
    activate(new vscode.ExtensionContext());
    expect(heartbeat).not.toHaveBeenCalled();

    openTheChatView();

    expect(heartbeat).toHaveBeenCalledTimes(1);
    expect(tierRefresh).toHaveBeenCalledTimes(1);
  });

  it('starts them when a command is invoked', async () => {
    activate(new vscode.ExtensionContext());
    expect(heartbeat).not.toHaveBeenCalled();

    await handlers.get('agi-workforce.openSettings')?.();

    expect(heartbeat).toHaveBeenCalledTimes(1);
    expect(tierRefresh).toHaveBeenCalledTimes(1);
  });

  it('starts them when a chat editor tab is restored', async () => {
    activate(new vscode.ExtensionContext());
    expect(heartbeat).not.toHaveBeenCalled();

    await restoreChatPanel();

    expect(heartbeat).toHaveBeenCalledTimes(1);
    expect(tierRefresh).toHaveBeenCalledTimes(1);
  });

  it('starts them at window startup when the user asked for that', () => {
    startupSetting(true);

    activate(new vscode.ExtensionContext());

    expect(heartbeat).toHaveBeenCalledTimes(1);
    expect(tierRefresh).toHaveBeenCalledTimes(1);
  });

  it('starts them once, however many times AGI is reached for', async () => {
    activate(new vscode.ExtensionContext());

    openTheChatView();
    await handlers.get('agi-workforce.openSettings')?.();
    await restoreChatPanel();

    expect(heartbeat).toHaveBeenCalledTimes(1);
    expect(tierRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('what wakes the extension', () => {
  it('names every way a user reaches AGI, so none of them needs the window-start event', () => {
    const manifest = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
    ) as {
      activationEvents: string[];
      contributes: { views: Record<string, Array<{ id: string }>> };
    };

    const viewId = Object.values(manifest.contributes.views).flat()[0]?.id;
    expect(manifest.activationEvents).toEqual(
      expect.arrayContaining([
        `onView:${viewId}`,
        `onWebviewPanel:${ChatEditorPanel.viewType}`,
        'onUri',
        expect.stringMatching(/^workspaceContains:/u),
      ]),
    );
  });
});

describe('a restored AGI chat tab comes back with its chat in it', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetStartupWorkForTests();
    ChatEditorPanel.__resetForTests();
    startupSetting(false);
    vi.mocked(vscode.commands.registerCommand).mockImplementation(
      () => new vscode.Disposable(() => undefined),
    );
  });

  afterEach(() => {
    __resetSubsystemHealthForTests();
    __resetStartupWorkForTests();
    ChatEditorPanel.__resetForTests();
    vi.restoreAllMocks();
  });

  it('registers a serializer for the chat panel view type', () => {
    activate(new vscode.ExtensionContext());

    expect(
      vi.mocked(vscode.window.registerWebviewPanelSerializer).mock.calls.map(([id]) => id),
    ).toContain(ChatEditorPanel.viewType);
  });

  it('fills the restored panel instead of leaving an empty tab', async () => {
    activate(new vscode.ExtensionContext());

    const panel = await restoreChatPanel();

    expect(panel.webview.html).toContain('<html');
    expect(panel.webview.options).toMatchObject({ enableScripts: true });
  });

  it('numbers the next new chat above the restored one', async () => {
    activate(new vscode.ExtensionContext());

    await restoreChatPanel('AGI Chat 4');

    expect(createdPanelTitles()).toEqual([]);
    ChatEditorPanel.createNew(
      vscode.Uri.file('/ext'),
      new vscode.ExtensionContext().secrets,
      new vscode.ExtensionContext(),
      { runtimeFor: () => undefined } as never,
      { refresh: () => undefined } as never,
      {} as never,
    );
    expect(createdPanelTitles()).toEqual(['AGI Chat 5']);
  });
});

function createdPanelTitles(): string[] {
  return vi.mocked(vscode.window.createWebviewPanel).mock.calls.map(([, title]) => String(title));
}

async function restoreChatPanel(title = 'AGI Chat'): Promise<{
  webview: { html: string; options: unknown };
}> {
  const serializer = vi
    .mocked(vscode.window.registerWebviewPanelSerializer)
    .mock.calls.find(([id]) => id === ChatEditorPanel.viewType)?.[1];
  if (serializer === undefined) throw new Error('no serializer was registered');
  const panel = {
    title,
    webview: {
      html: '',
      options: {} as unknown,
      cspSource: 'https://mock.csp.source',
      asWebviewUri: (uri: vscode.Uri) => uri,
      onDidReceiveMessage: vi.fn(() => new vscode.Disposable()),
      postMessage: vi.fn().mockResolvedValue(true),
    },
    onDidDispose: vi.fn(),
    onDidChangeViewState: vi.fn(() => new vscode.Disposable()),
    reveal: vi.fn(),
    dispose: vi.fn(),
  };
  await serializer.deserializeWebviewPanel(panel as unknown as vscode.WebviewPanel, undefined);
  return panel;
}
