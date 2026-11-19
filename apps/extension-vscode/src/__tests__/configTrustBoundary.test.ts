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

  const optOutFeatures = [
    [
      'inlineCompletions.enabled',
      'optOut.inlineCompletions',
      () => Config.inlineCompletionsEnabled(),
    ],
    ['autoApplyFixes', 'optOut.autoApplyFixes', () => Config.autoApplyFixes()],
    ['memory.enabled', 'optOut.memory', () => Config.memoryEnabled()],
  ] as const;

  it.each(optOutFeatures)(
    'takes %s only from the user value, and lets %s turn it off, trusted or not',
    (key, optOut, read) => {
      const trusted = vscode.workspace.isTrusted;
      try {
        for (const isTrusted of [true, false]) {
          (vscode.workspace as { isTrusted: boolean }).isTrusted = isTrusted;
          stubConfiguration({
            [key]: { defaultValue: false, globalValue: false, workspaceValue: true },
          });
          expect(read()).toBe(false);
          stubConfiguration({
            [key]: { defaultValue: false, globalValue: true },
            [optOut]: { defaultValue: false, workspaceValue: true },
          });
          expect(read()).toBe(false);
          stubConfiguration({
            [key]: { defaultValue: false, globalValue: true },
            [optOut]: { defaultValue: false, workspaceFolderValue: true },
          });
          expect(read()).toBe(false);
          stubConfiguration({
            [key]: { defaultValue: false, globalValue: true },
            [optOut]: { defaultValue: false, workspaceValue: false },
          });
          expect(read()).toBe(true);
          stubConfiguration({ [key]: { defaultValue: false, globalValue: true } });
          expect(read()).toBe(true);
        }
      } finally {
        (vscode.workspace as { isTrusted: boolean }).isTrusted = trusted;
      }
    },
  );

  it.each(optOutFeatures)(
    'keeps %s off in a remote window whose remote settings set %s',
    (key, optOut, read) => {
      const remoteName = vscode.env.remoteName;
      (vscode.env as { remoteName: string | undefined }).remoteName = 'dev-container';
      try {
        stubConfiguration({
          [key]: { defaultValue: false, globalValue: true },
          [optOut]: { defaultValue: false, globalValue: true },
        });
        expect(read()).toBe(false);
      } finally {
        (vscode.env as { remoteName: string | undefined }).remoteName = remoteName;
      }
    },
  );

  it.each(optOutFeatures)(
    'turns off %s for the whole window when any folder of a multi-root workspace sets %s',
    (key, optOut, read) => {
      const folders = vscode.workspace.workspaceFolders;
      const personal = { uri: vscode.Uri.file('/work/personal'), name: 'personal', index: 0 };
      const client = { uri: vscode.Uri.file('/work/client'), name: 'client', index: 1 };
      const byFolder = new Map<string, InspectedValues>([
        [personal.uri.fsPath, { defaultValue: false }],
        [client.uri.fsPath, { defaultValue: false, workspaceFolderValue: true }],
      ]);
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [personal, client];
      vi.mocked(vscode.workspace.getConfiguration).mockImplementation(((
        _section?: string,
        scope?: { fsPath?: string },
      ) => {
        const optOutValues =
          (scope?.fsPath === undefined ? undefined : byFolder.get(scope.fsPath)) ??
          ({ defaultValue: false } satisfies InspectedValues);
        const values: Record<string, InspectedValues> = {
          [key]: { defaultValue: false, globalValue: true },
          [optOut]: optOutValues,
        };
        return {
          get: vi.fn(),
          inspect: vi.fn((inspectedKey: string) => values[inspectedKey]),
          update: vi.fn().mockResolvedValue(undefined),
          has: vi.fn().mockReturnValue(false),
        };
      }) as never);
      try {
        expect(read()).toBe(false);
        byFolder.set(client.uri.fsPath, { defaultValue: false, workspaceFolderValue: false });
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
      'memory.enabled': { defaultValue: true, globalValue: true },
      'optOut.memory': { defaultValue: false, workspaceValue: true },
      'inlineCompletions.enabled': { defaultValue: false, globalValue: false },
      'optOut.inlineCompletions': { defaultValue: false, workspaceValue: true },
      respectGitIgnore: { defaultValue: true, globalValue: true, workspaceValue: false },
      'editorContext.autoAttach': { defaultValue: true, globalValue: true, workspaceValue: false },
    });

    const snapshot = Config.settingsSnapshot('unknown');
    expect(snapshot.workspaceOverrides).toEqual(['memory.enabled', 'editorContext.autoAttach']);
    expect(snapshot.values.autoApplyFixes).toBe(false);
    expect(snapshot.values['memory.enabled']).toBe(false);
  });
});
