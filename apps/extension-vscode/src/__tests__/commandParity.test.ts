/**
 * commandParity.test.ts — A2 parity guarantee.
 *
 * Asserts that every command declared in `package.json contributes.commands`
 * is registered at runtime by calling `activate(mockContext)`. Catches the
 * "dropped handler in a refactor" class of regression that no other test in
 * this suite covers.
 *
 * Implementation: reads package.json at test time, mocks
 * `vscode.commands.registerCommand` to record ids, runs activate(), then
 * compares the recorded set against the declared set.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate } from '../extension';

interface DeclaredCommand {
  command: string;
  title?: string;
}

function readDeclaredCommands(): DeclaredCommand[] {
  const pkgPath = path.resolve(__dirname, '../../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    contributes?: { commands?: DeclaredCommand[] };
  };
  return pkg.contributes?.commands ?? [];
}

function makeMockContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
    secrets: {
      get: vi.fn().mockResolvedValue(undefined),
      store: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      onDidChange: vi.fn(),
    },
    extensionUri: vscode.Uri.file('/mock/extension'),
    extensionPath: '/mock/extension',
    globalState: {
      get: vi.fn().mockReturnValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockReturnValue([]),
      setKeysForSync: vi.fn(),
    },
    workspaceState: {
      get: vi.fn().mockReturnValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockReturnValue([]),
    },
    asAbsolutePath: vi.fn((p: string) => `/mock/extension/${p}`),
    storagePath: '/mock/storage',
    storageUri: vscode.Uri.file('/mock/storage'),
    globalStoragePath: '/mock/global-storage',
    globalStorageUri: vscode.Uri.file('/mock/global-storage'),
    logPath: '/mock/log',
    logUri: vscode.Uri.file('/mock/log'),
    extensionMode: 1, // Production
    environmentVariableCollection: {} as never,
    extension: {
      packageJSON: { version: '0.3.0' },
    } as never,
    languageModelAccessInformation: {} as never,
  } as unknown as vscode.ExtensionContext;
}

describe('package.json ↔ runtime command parity', () => {
  let registeredIds: string[];
  let originalRegisterCommand: typeof vscode.commands.registerCommand;

  beforeEach(() => {
    registeredIds = [];
    originalRegisterCommand = vscode.commands.registerCommand;
    (
      vscode.commands as { registerCommand: typeof vscode.commands.registerCommand }
    ).registerCommand = vi.fn((id: string, _handler: (...args: unknown[]) => unknown) => {
      registeredIds.push(id);
      return { dispose: () => undefined } as vscode.Disposable;
    });
  });

  afterEach(() => {
    (
      vscode.commands as { registerCommand: typeof vscode.commands.registerCommand }
    ).registerCommand = originalRegisterCommand;
    vi.restoreAllMocks();
  });

  it('every command declared in package.json is registered at runtime', () => {
    const declared = readDeclaredCommands().map((c) => c.command);
    expect(declared.length).toBeGreaterThan(0);

    activate(makeMockContext());

    const missing = declared.filter((id) => !registeredIds.includes(id));
    expect(
      missing,
      `package.json declares ${missing.length} command(s) with no runtime handler`,
    ).toEqual([]);
  });

  it('every registered command is declared in package.json', () => {
    const declared = new Set(readDeclaredCommands().map((c) => c.command));

    activate(makeMockContext());

    // Some commands are intentionally registered without being in package.json
    // (e.g. internal helpers triggered via `executeCommand` from other code,
    // bridge auto-actions, etc.). Allowlist them here so the test still flags
    // accidental drift in the user-facing surface.
    const allowedUndeclared = new Set<string>([
      // Add ids here only with a comment explaining why they're hidden.
    ]);

    const undeclared = registeredIds.filter(
      (id) => !declared.has(id) && !allowedUndeclared.has(id),
    );
    expect(
      undeclared,
      `${undeclared.length} command(s) registered at runtime but missing from package.json contributes.commands`,
    ).toEqual([]);
  });

  it('no duplicate registrations', () => {
    activate(makeMockContext());
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const id of registeredIds) {
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    }
    expect(dupes, `duplicate command registrations: ${dupes.join(', ')}`).toEqual([]);
  });
});
