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
  ] as const)(
    'lets a trusted repository turn off %s, but only the user turn it on',
    (key, read) => {
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
        expect(read()).toBe(false);
        stubConfiguration({
          [key]: { defaultValue: false, globalValue: true, workspaceFolderValue: false },
        });
        expect(read()).toBe(false);
        stubConfiguration({ [key]: { defaultValue: false, globalValue: true } });
        expect(read()).toBe(true);
      } finally {
        (vscode.workspace as { isTrusted: boolean }).isTrusted = trusted;
      }
    },
  );

  it.each([
    ['inlineCompletions.enabled', () => Config.inlineCompletionsEnabled()],
    ['autoApplyFixes', () => Config.autoApplyFixes()],
    ['memory.enabled', () => Config.memoryEnabled()],
  ] as const)(
    'turns off %s for the whole window when any folder of a multi-root workspace does',
    (key, read) => {
      const folders = vscode.workspace.workspaceFolders;
      const personal = { uri: vscode.Uri.file('/work/personal'), name: 'personal', index: 0 };
      const client = { uri: vscode.Uri.file('/work/client'), name: 'client', index: 1 };
      const byFolder = new Map<string, InspectedValues>([
        [personal.uri.fsPath, { defaultValue: false, globalValue: true }],
        [
          client.uri.fsPath,
          { defaultValue: false, globalValue: true, workspaceFolderValue: false },
        ],
      ]);
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [personal, client];
      vi.mocked(vscode.workspace.getConfiguration).mockImplementation(((
        _section?: string,
        scope?: { fsPath?: string },
      ) => {
        const values =
          (scope?.fsPath === undefined ? undefined : byFolder.get(scope.fsPath)) ??
          ({ defaultValue: false, globalValue: true } satisfies InspectedValues);
        return {
          get: vi.fn(),
          inspect: vi.fn((inspectedKey: string) => (inspectedKey === key ? values : undefined)),
          update: vi.fn().mockResolvedValue(undefined),
          has: vi.fn().mockReturnValue(false),
        };
      }) as never);
      try {
        expect(read()).toBe(false);
        byFolder.set(client.uri.fsPath, { defaultValue: false, globalValue: true });
        expect(read()).toBe(true);
      } finally {
        (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = folders;
      }
    },
  );

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
      'memory.enabled': { defaultValue: true, globalValue: true, workspaceValue: false },
      respectGitIgnore: { defaultValue: true, globalValue: true, workspaceValue: false },
      'editorContext.autoAttach': { defaultValue: true, globalValue: true, workspaceValue: false },
    });

    expect(Config.settingsSnapshot('unknown').workspaceOverrides).toEqual([
      'memory.enabled',
      'editorContext.autoAttach',
    ]);
  });
});
