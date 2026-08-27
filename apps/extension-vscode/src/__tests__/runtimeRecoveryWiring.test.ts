import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { activate } from '../extension';
import { SidebarProvider } from '../features/sidebar-webview/sidebarProvider';
import { LocalRuntimePool } from '../integrations/localRuntimePool';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';

type Listener = (...args: unknown[]) => unknown;

function listenersOf(mock: unknown): Listener[] {
  return vi
    .mocked(mock as (listener: Listener) => vscode.Disposable)
    .mock.calls.map((call) => call[0]);
}

describe('the developer-runtime banner has a way out', () => {
  let refreshRuntimeStatus: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetSubsystemHealthForTests();
    vscode.workspace.isTrusted = true;
    refreshRuntimeStatus = vi
      .spyOn(SidebarProvider.prototype, 'refreshRuntimeStatus')
      .mockImplementation(() => undefined);
    activate(new vscode.ExtensionContext());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetSubsystemHealthForTests();
  });

  it('re-probes the runtime when the host grants workspace trust', () => {
    const listeners = listenersOf(vscode.workspace.onDidGrantWorkspaceTrust);
    expect(listeners).toHaveLength(1);

    refreshRuntimeStatus.mockClear();
    listeners[0]!();

    expect(refreshRuntimeStatus).toHaveBeenCalledOnce();
  });

  it('re-probes the runtime when the open folder set changes', () => {
    const listeners = listenersOf(vscode.workspace.onDidChangeWorkspaceFolders);
    expect(listeners.length).toBeGreaterThan(0);

    refreshRuntimeStatus.mockClear();
    for (const listener of listeners) listener({ added: [], removed: [] });

    expect(refreshRuntimeStatus).toHaveBeenCalled();
  });

  it('re-probes after the CLI path changes, whether or not the restart succeeded', async () => {
    const restartAll = vi
      .spyOn(LocalRuntimePool.prototype, 'restartAll')
      .mockRejectedValue(new Error('protocol handshake failed'));
    const listeners = listenersOf(vscode.workspace.onDidChangeConfiguration);
    expect(listeners.length).toBeGreaterThan(0);

    refreshRuntimeStatus.mockClear();
    for (const listener of listeners) {
      listener({ affectsConfiguration: (key: string) => key === 'agiWorkforce.cliPath' });
    }
    await vi.waitFor(() => expect(refreshRuntimeStatus).toHaveBeenCalled());

    expect(restartAll).toHaveBeenCalledOnce();
  });
});
