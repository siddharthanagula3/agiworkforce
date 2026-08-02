/**
 * diffKeybindingCommands.test.ts — SIX-14.
 *
 * `contributes.keybindings` binds `agi-workforce.acceptDiff` to
 * Ctrl/Cmd+Shift+Enter and `agi-workforce.rejectDiff` to Escape, both gated on
 * `editorTextFocus && agi-workforce.hasDiff`. Keybindings pass no arguments,
 * but both handlers required a `sessionId`, so the keypress ended in
 * `_activeDiffs.get(undefined)` / `Map.delete(undefined)` — no edit, no
 * dismissal, no toast, no log. Pressing Escape over a diff did nothing at all.
 *
 * These tests invoke the real registered handlers the way VS Code does for a
 * keybinding: with zero arguments.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { setupCommands, type CommandDeps } from '../core/commandSetup';
import { DiffDecorationProvider } from '../providers/diffDecorationProvider';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';

type Handler = (...args: unknown[]) => unknown;

interface PkgKeybinding {
  command: string;
  when?: string;
}

function readKeybindings(): PkgKeybinding[] {
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
  ) as {
    contributes?: { keybindings?: PkgKeybinding[] };
  };
  return pkg.contributes?.keybindings ?? [];
}

function makeEditor(uri: vscode.Uri, cursorLine: number) {
  const lines = Array.from({ length: 12 }, (_, index) => `line ${index}`);
  return {
    document: {
      uri,
      lineCount: lines.length,
      lineAt: (line: number) => ({ text: lines[line] ?? '' }),
    },
    selection: { active: { line: cursorLine, character: 0 } },
    setDecorations: vi.fn(),
  } as unknown as vscode.TextEditor;
}

/**
 * Register the real command handlers against a real DiffDecorationProvider.
 * Only the provider under test is real — the other deps are never touched by
 * the diff commands.
 */
function registerDiffCommands(): {
  handlers: Map<string, Handler>;
  provider: DiffDecorationProvider;
} {
  const handlers = new Map<string, Handler>();
  vi.mocked(vscode.commands.registerCommand).mockImplementation(((id: string, handler: Handler) => {
    handlers.set(id, handler);
    return new vscode.Disposable(() => undefined);
  }) as never);

  const provider = new DiffDecorationProvider();
  const stub = new Proxy({}, { get: () => vi.fn() });
  setupCommands(
    { subscriptions: [], secrets: {} } as unknown as vscode.ExtensionContext,
    {
      sidebarProvider: stub,
      conversationTreeProvider: stub,
      localRuntimes: stub,
      contextPanelProvider: stub,
      memoryTreeProvider: stub,
      diffDecorationProvider: provider,
      diagnosticsProvider: stub,
      nativeChatAvailable: false,
    } as unknown as CommandDeps,
  );

  return { handlers, provider };
}

describe('diff keybinding commands (SIX-14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSubsystemHealthForTests();
    vscode.window.activeTextEditor = undefined;
    vscode.window.visibleTextEditors = [];
    vi.mocked(vscode.workspace.applyEdit).mockResolvedValue(true);
  });

  it('binds acceptDiff and rejectDiff with no arguments — the shape under test', () => {
    const bindings = readKeybindings().filter(
      (kb) =>
        kb.command === 'agi-workforce.acceptDiff' || kb.command === 'agi-workforce.rejectDiff',
    );
    // If these ever stop being keybound, this whole file can go.
    expect(bindings.map((kb) => kb.command).sort()).toEqual([
      'agi-workforce.acceptDiff',
      'agi-workforce.rejectDiff',
    ]);
  });

  it('rejectDiff invoked with no arguments dismisses the diff under the cursor', async () => {
    const { handlers, provider } = registerDiffCommands();
    const uri = vscode.Uri.file('/mock/workspace/src/app.ts');
    const editor = makeEditor(uri, 3);
    vscode.window.activeTextEditor = editor;

    provider.showDiff(editor, 'old value', 'new value', new vscode.Range(3, 0, 3, 9));
    expect(provider.sessionCount).toBe(1);

    // Exactly what pressing Escape sends: the command id and nothing else.
    await handlers.get('agi-workforce.rejectDiff')?.();

    expect(provider.sessionCount).toBe(0);
  });

  it('acceptDiff invoked with no arguments applies the diff under the cursor', async () => {
    const { handlers, provider } = registerDiffCommands();
    const uri = vscode.Uri.file('/mock/workspace/src/app.ts');
    const editor = makeEditor(uri, 3);
    vscode.window.activeTextEditor = editor;

    provider.showDiff(editor, 'old value', 'new value', new vscode.Range(3, 0, 3, 9));

    await handlers.get('agi-workforce.acceptDiff')?.();

    expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1);
    expect(provider.sessionCount).toBe(0);
  });

  it('still honours the session id the CodeLens passes', async () => {
    const { handlers, provider } = registerDiffCommands();
    const uri = vscode.Uri.file('/mock/workspace/src/app.ts');
    const editor = makeEditor(uri, 0);
    vscode.window.activeTextEditor = editor;

    const first = provider.showDiff(editor, 'a', 'b', new vscode.Range(1, 0, 1, 1));
    const second = provider.showDiff(editor, 'c', 'd', new vscode.Range(9, 0, 9, 1));
    expect(provider.sessionCount).toBe(2);

    // The cursor sits on line 0, nearest `first` — the explicit id must win.
    await handlers.get('agi-workforce.rejectDiff')?.(second.id);

    expect(provider.getSession(second.id)).toBeUndefined();
    expect(provider.getSession(first.id)).toBeDefined();
  });

  it('says so when the accept chord resolves nothing instead of failing silently', async () => {
    const { handlers, provider } = registerDiffCommands();
    const editor = makeEditor(vscode.Uri.file('/mock/workspace/src/app.ts'), 3);
    // A diff exists (so `agi-workforce.hasDiff` is true and the chord fires)
    // but the user is focused on a different file.
    provider.showDiff(editor, 'old', 'new', new vscode.Range(3, 0, 3, 3));
    vscode.window.activeTextEditor = makeEditor(vscode.Uri.file('/mock/workspace/src/other.ts'), 0);

    await handlers.get('agi-workforce.acceptDiff')?.();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('no suggestion to accept in the active editor'),
    );
    expect(provider.sessionCount).toBe(1);
  });

  it('keeps Escape silent when there is nothing under the cursor to dismiss', async () => {
    const { handlers, provider } = registerDiffCommands();
    const editor = makeEditor(vscode.Uri.file('/mock/workspace/src/app.ts'), 3);
    provider.showDiff(editor, 'old', 'new', new vscode.Range(3, 0, 3, 3));
    vscode.window.activeTextEditor = makeEditor(vscode.Uri.file('/mock/workspace/src/other.ts'), 0);

    await handlers.get('agi-workforce.rejectDiff')?.();

    // Escape is a global dismissal key; it must not nag on every press.
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    expect(provider.sessionCount).toBe(1);
  });

  it('every keybound diff command tolerates a zero-argument invocation', async () => {
    const { handlers } = registerDiffCommands();
    const diffCommands = readKeybindings()
      .map((kb) => kb.command)
      .filter((id) => /Diff/.test(id));
    expect(diffCommands.length).toBeGreaterThan(0);

    for (const id of diffCommands) {
      const handler = handlers.get(id);
      expect(handler, `${id} is keybound but not registered`).toBeDefined();
      // A keybinding supplies no arguments. A handler that throws or rejects
      // here is dead on the keyboard path.
      await expect(
        Promise.resolve(handler?.()),
        `${id} threw when invoked with no arguments`,
      ).resolves.not.toThrow();
    }
  });
});
