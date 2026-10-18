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
});
