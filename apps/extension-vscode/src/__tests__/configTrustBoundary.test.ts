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

  it('keeps inline completions off when only a folder turns them on, trusted or not', () => {
    const trusted = vscode.workspace.isTrusted;
    stubConfiguration({
      'inlineCompletions.enabled': {
        defaultValue: false,
        workspaceValue: true,
        workspaceFolderValue: true,
      },
    });
    try {
      (vscode.workspace as { isTrusted: boolean }).isTrusted = false;
      expect(Config.inlineCompletionsEnabled()).toBe(false);
      (vscode.workspace as { isTrusted: boolean }).isTrusted = true;
      expect(Config.inlineCompletionsEnabled()).toBe(false);
    } finally {
      (vscode.workspace as { isTrusted: boolean }).isTrusted = trusted;
    }
  });

  it.each([
    ['inlineCompletions.enabled', () => Config.inlineCompletionsEnabled()],
    ['autoApplyFixes', () => Config.autoApplyFixes()],
    ['memory.enabled', () => Config.memoryEnabled()],
  ] as const)('lets only the user turn on %s, even in a trusted repository', (key, read) => {
    const trusted = vscode.workspace.isTrusted;
    (vscode.workspace as { isTrusted: boolean }).isTrusted = true;
    try {
      stubConfiguration({
        [key]: { defaultValue: false, globalValue: false, workspaceValue: true },
      });
      expect(read()).toBe(false);
      stubConfiguration({
        [key]: { defaultValue: false, globalValue: true, workspaceValue: false },
      });
      expect(read()).toBe(true);
    } finally {
      (vscode.workspace as { isTrusted: boolean }).isTrusted = trusted;
    }
  });

  it('lets a repository tighten, but never loosen, the editor context privacy settings', () => {
    stubConfiguration({
      respectGitIgnore: { defaultValue: true, globalValue: true, workspaceValue: false },
      'editorContext.autoAttach': { defaultValue: true, globalValue: false, workspaceValue: true },
    });
    expect(Config.respectGitIgnore()).toBe(true);
    expect(Config.editorContextAutoAttach()).toBe(false);

    stubConfiguration({
      respectGitIgnore: { defaultValue: true, globalValue: false, workspaceFolderValue: true },
      'editorContext.autoAttach': { defaultValue: true, globalValue: true, workspaceValue: false },
    });
    expect(Config.respectGitIgnore()).toBe(true);
    expect(Config.editorContextAutoAttach()).toBe(false);

    stubConfiguration({
      respectGitIgnore: { defaultValue: true, globalValue: false },
      'editorContext.autoAttach': { defaultValue: true, globalValue: true },
    });
    expect(Config.respectGitIgnore()).toBe(false);
    expect(Config.editorContextAutoAttach()).toBe(true);
  });

  it('reports a workspace value as an override only when it takes effect', () => {
    stubConfiguration({
      autoApplyFixes: { defaultValue: false, workspaceValue: true },
      respectGitIgnore: { defaultValue: true, globalValue: true, workspaceValue: false },
      'editorContext.autoAttach': { defaultValue: true, globalValue: true, workspaceValue: false },
    });

    expect(Config.settingsSnapshot('unknown').workspaceOverrides).toEqual([
      'editorContext.autoAttach',
    ]);
  });
});
