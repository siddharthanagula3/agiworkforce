import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { Config } from '../platform/config';

type InspectedValues = {
  defaultValue?: unknown;
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
};

function stubConfiguration(values: Record<string, InspectedValues>): void {
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    // Deliberately model VS Code's effective-value lookup here. If a protected
    // accessor regresses to `.get()`, these tests observe the repository-owned
    // workspace value and fail.
    get: vi.fn((key: string, fallback?: unknown) => {
      const inspected = values[key];
      return (
        inspected?.workspaceFolderValue ??
        inspected?.workspaceValue ??
        inspected?.globalValue ??
        inspected?.defaultValue ??
        fallback
      );
    }),
    inspect: vi.fn((key: string) => values[key]),
    update: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockReturnValue(false),
  } as unknown as vscode.WorkspaceConfiguration);
}

describe('user-owned execution-boundary configuration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores workspace and workspace-folder model overrides', () => {
    stubConfiguration({
      model: {
        defaultValue: 'auto',
        workspaceValue: 'fixture-workspace-boundary',
        workspaceFolderValue: 'fixture-folder-boundary',
      },
    });

    expect(Config.model()).toBe('auto');
  });

  it('honors the user model even when the repository supplies another value', () => {
    stubConfiguration({
      model: {
        defaultValue: 'auto',
        globalValue: 'fixture-user-boundary',
        workspaceValue: 'fixture-workspace-boundary',
      },
    });

    expect(Config.model()).toBe('fixture-user-boundary');
  });

  it('ignores workspace and workspace-folder Desktop bridge destinations', () => {
    stubConfiguration({
      'desktopBridge.enabled': {
        defaultValue: false,
        workspaceValue: true,
      },
      'desktopBridge.port': {
        defaultValue: 8787,
        workspaceValue: 4444,
        workspaceFolderValue: 5555,
      },
    });

    expect(Config.desktopBridgeEnabled()).toBe(false);
    expect(Config.desktopBridgePort()).toBe(8787);
  });

  it('honors the user Desktop bridge opt-in and port over repository values', () => {
    stubConfiguration({
      'desktopBridge.enabled': {
        defaultValue: false,
        globalValue: true,
        workspaceValue: false,
      },
      'desktopBridge.port': {
        defaultValue: 8787,
        globalValue: 9876,
        workspaceFolderValue: 4444,
      },
    });

    expect(Config.desktopBridgeEnabled()).toBe(true);
    expect(Config.desktopBridgePort()).toBe(9876);
  });
});
