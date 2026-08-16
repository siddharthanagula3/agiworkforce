
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate } from '../extension';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';

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
    __resetSubsystemHealthForTests();
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

  it('does not advertise unavailable checkpoint, worktree, or rewind controls', () => {
    const unsupported = /checkpoint|worktree|rewind/i;
    const declared = readDeclaredCommands().filter(
      (command) => unsupported.test(command.command) || unsupported.test(command.title ?? ''),
    );
    const setupSource = fs.readFileSync(path.resolve(__dirname, '../core/commandSetup.ts'), 'utf8');

    expect(declared).toEqual([]);
    expect(setupSource).not.toMatch(/restore-checkpoint|restoreCheckpoint|rewindLast/);
  });

  it('keeps Cloud connectors and Team administration as explicit Web handoffs', () => {
    const setupSource = fs.readFileSync(path.resolve(__dirname, '../core/commandSetup.ts'), 'utf8');

    expect(setupSource).toContain('!isEntitledSubscriptionStatus(tierInfo.subscriptionStatus)');
    expect(setupSource).toContain('Manage Cloud connectors on Web');
    expect(setupSource).toContain(
      "Cloud connectors do not replace this workspace's local MCP configuration",
    );
    expect(setupSource).toContain('https://agiworkforce.com/connectors?from=vscode-extension');
    expect(setupSource).toContain('https://agiworkforce.com/settings/team?from=vscode-extension');
    expect(setupSource).toContain('https://agiworkforce.com/teams?from=vscode-extension');
  });

  it('parity holds on second activate after reset (module-state isolation)', () => {
    activate(makeMockContext());
    const firstIds = [...registeredIds];
    expect(firstIds.length).toBeGreaterThan(0);

    __resetSubsystemHealthForTests();
    registeredIds = [];
    activate(makeMockContext());

    const declared = readDeclaredCommands().map((c) => c.command);
    const missing = declared.filter((id) => !registeredIds.includes(id));
    expect(
      missing,
      `after re-activation, ${missing.length} command(s) missing (likely module-level state not reset)`,
    ).toEqual([]);
  });
});
