import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate } from '../extension';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';

interface PkgKeybinding {
  command: string;
  key?: string;
  mac?: string;
  when?: string;
}

const PKG_PATH = path.resolve(__dirname, '../../package.json');
const SRC_ROOT = path.resolve(__dirname, '..');

function readKeybindings(): PkgKeybinding[] {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')) as {
    contributes?: { keybindings?: PkgKeybinding[] };
  };
  return pkg.contributes?.keybindings ?? [];
}

function extractCustomContextKeys(when: string): string[] {
  const matches = when.match(/(?<!['"])agi-workforce\.[a-zA-Z0-9.]+(?!['"])/g) ?? [];
  return matches;
}

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function collectSetContextKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of collectSourceFiles(SRC_ROOT)) {
    const content = fs.readFileSync(file, 'utf8');
    const re = /setContext['"]?\s*,\s*['"](agi-workforce\.[a-zA-Z0-9.]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      keys.add(m[1] as string);
    }
  }
  return keys;
}

describe('keybinding when-clause context parity', () => {
  it('every custom agi-workforce.* context key in a keybinding when-clause is set via setContext somewhere', () => {
    const keybindings = readKeybindings();
    expect(keybindings.length).toBeGreaterThan(0);

    const setKeys = collectSetContextKeys();

    const unwired: string[] = [];
    for (const kb of keybindings) {
      if (!kb.when) continue;
      for (const key of extractCustomContextKeys(kb.when)) {
        if (!setKeys.has(key)) {
          unwired.push(`${key} (keybinding: ${kb.command}, when: "${kb.when}")`);
        }
      }
    }

    expect(
      unwired,
      `Found keybinding when-clause(s) referencing an agi-workforce.* context key that is never ` +
        `set via setContext anywhere in src/, the keybinding can never fire:\n${unwired.join('\n')}`,
    ).toEqual([]);
  });
});

describe('keybound commands tolerate a zero-argument invocation', () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;
  let originalRegisterCommand: typeof vscode.commands.registerCommand;

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
      storageUri: vscode.Uri.file('/mock/storage'),
      globalStorageUri: vscode.Uri.file('/mock/global-storage'),
      logUri: vscode.Uri.file('/mock/log'),
      extensionMode: 1,
      environmentVariableCollection: {} as never,
      extension: { packageJSON: { version: '0.3.0' } } as never,
      languageModelAccessInformation: {} as never,
    } as unknown as vscode.ExtensionContext;
  }

  beforeEach(() => {
    handlers = new Map();
    originalRegisterCommand = vscode.commands.registerCommand;
    (
      vscode.commands as { registerCommand: typeof vscode.commands.registerCommand }
    ).registerCommand = vi.fn((id: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(id, handler);
      return { dispose: () => undefined } as vscode.Disposable;
    }) as never;
    vscode.window.activeTextEditor = undefined;
    vscode.window.activeTerminal = undefined;
    vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);
  });

  afterEach(() => {
    (
      vscode.commands as { registerCommand: typeof vscode.commands.registerCommand }
    ).registerCommand = originalRegisterCommand;
    vi.restoreAllMocks();
    __resetSubsystemHealthForTests();
  });

  it('invokes every keybound command with no arguments without throwing', async () => {
    activate(makeMockContext());

    const keybound = [...new Set(readKeybindings().map((kb) => kb.command))];
    expect(keybound.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const id of keybound) {
      const handler = handlers.get(id);
      expect(handler, `${id} is keybound in package.json but never registered`).toBeDefined();
      try {
        await Promise.resolve(handler?.());
      } catch (err) {
        failures.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    expect(
      failures,
      `keybound command(s) failed when invoked with no arguments, the keyboard path is dead:\n${failures.join('\n')}`,
    ).toEqual([]);
  });

  it('registers no keybound command with a required leading parameter', () => {
    const setupSource = fs.readFileSync(path.resolve(__dirname, '../core/commandSetup.ts'), 'utf8');
    const keybound = [...new Set(readKeybindings().map((kb) => kb.command))];

    const checked: string[] = [];
    const offenders: string[] = [];
    for (const id of keybound) {
      const match = new RegExp(
        `register\\('${id.replace(/\./g, '\\.')}',\\s*(?:async\\s*)?\\(([^)]*)\\)`,
      ).exec(setupSource);
      if (match === null) continue;
      checked.push(id);
      const first = (match[1] ?? '').split(',')[0]?.trim() ?? '';
      const optional =
        first === '' || first.startsWith('...') || first.includes('?:') || first.includes('=');
      if (!optional) offenders.push(`${id} (first parameter "${first}" is required)`);
    }

    expect(checked).toEqual(
      expect.arrayContaining(['agi-workforce.acceptDiff', 'agi-workforce.rejectDiff']),
    );
    expect(
      offenders,
      `keybound command(s) declare a required first parameter no keybinding can supply:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
