import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { setupCommands, type CommandDeps } from '../core/commandSetup';
import { DiffDecorationProvider } from '../providers/diffDecorationProvider';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';

type Handler = (...args: unknown[]) => unknown;

function makeEditor(uri: vscode.Uri) {
  const lines = Array.from({ length: 12 }, (_, index) => `line ${index}`);
  return {
    document: {
      uri,
      lineCount: lines.length,
      lineAt: (line: number) => ({ text: lines[line] ?? '' }),
    },
    selection: { active: { line: 0, character: 0 } },
    setDecorations: vi.fn(),
  } as unknown as vscode.TextEditor;
}

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

function seed(provider: DiffDecorationProvider): void {
  provider.showDiff(
    makeEditor(vscode.Uri.file('/workspace/a.ts')),
    'old a',
    'new a',
    new vscode.Range(1, 0, 1, 5),
    { batchId: 'batch-1', filePath: 'a.ts' },
  );
  provider.showDiff(
    makeEditor(vscode.Uri.file('/workspace/b.ts')),
    'old b',
    'new b',
    new vscode.Range(2, 0, 2, 5),
    { batchId: 'batch-1', filePath: 'b.ts' },
  );
  provider.showDiff(
    makeEditor(vscode.Uri.file('/workspace/c.ts')),
    'old c',
    'new c',
    new vscode.Range(3, 0, 3, 5),
    { filePath: 'c.ts' },
  );
}

function paletteWhenClause(command: string): string | undefined {
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
  ) as { contributes?: { menus?: { commandPalette?: Array<{ command: string; when?: string }> } } };
  return (pkg.contributes?.menus?.commandPalette ?? []).find((entry) => entry.command === command)
    ?.when;
}

describe('batch diff scoping', () => {
  let provider: DiffDecorationProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new DiffDecorationProvider();
    seed(provider);
  });

  it('matches only the named batch, never the sessions that carry no batch id', () => {
    expect(provider.sessionsForBatch('batch-1').map((s) => s.filePath)).toEqual(['a.ts', 'b.ts']);
    expect(provider.allSessions()).toHaveLength(3);
  });

  it('restores a rejected batch so a mis-click is not a lost proposal', () => {
    provider.rejectBatch('batch-1');
    expect(provider.sessionCount).toBe(1);
    expect(provider.restorableCount).toBe(2);

    const restored = provider.restoreRejected();

    expect(restored.map((s) => s.filePath)).toEqual(['a.ts', 'b.ts']);
    expect(provider.sessionCount).toBe(3);
    expect(provider.restorableCount).toBe(0);
  });

  it('restores a globally rejected set and never double-restores', () => {
    provider.rejectAllGlobal();
    expect(provider.sessionCount).toBe(0);

    expect(provider.restoreRejected()).toHaveLength(3);
    expect(provider.restoreRejected()).toHaveLength(0);
    expect(provider.sessionCount).toBe(3);
  });

  it('leaves nothing to restore after an accept, because accept is not a discard', async () => {
    await provider.acceptBatch('batch-1');

    expect(provider.restorableCount).toBe(0);
    expect(provider.sessionCount).toBe(1);
  });
});

describe('bulk diff commands never write or discard silently', () => {
  let handlers: Map<string, Handler>;
  let provider: DiffDecorationProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetSubsystemHealthForTests();
    vscode.window.activeTextEditor = undefined;
    ({ handlers, provider } = registerDiffCommands());
    seed(provider);
  });

  it('writes nothing when the batch command is fuzzy-typed from the palette', async () => {
    await handlers.get('agi-workforce.acceptBatch')!(undefined);
    await handlers.get('agi-workforce.rejectBatch')!(undefined);

    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    expect(provider.sessionCount).toBe(3);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('CodeLens'),
    );
  });

  it('hides the argument-only batch commands from the palette entirely', () => {
    expect(paletteWhenClause('agi-workforce.acceptBatch')).toBe('false');
    expect(paletteWhenClause('agi-workforce.rejectBatch')).toBe('false');
  });

  it('gates every remaining palette diff entry on there being a pending diff', () => {
    for (const command of [
      'agi-workforce.acceptAllDiffs',
      'agi-workforce.rejectAllDiffs',
      'agi-workforce.acceptAllDiffsGlobal',
      'agi-workforce.rejectAllDiffsGlobal',
      'agi-workforce.acceptCurrentDiff',
      'agi-workforce.rejectCurrentDiff',
    ]) {
      expect(paletteWhenClause(command), command).toBe('agi-workforce.hasDiff');
    }
  });

  it('asks with a modal naming the count and files before writing a batch', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);

    await handlers.get('agi-workforce.acceptBatch')!('batch-1');

    const [message, options] = vi.mocked(vscode.window.showWarningMessage).mock.calls[0] ?? [];
    expect(String(message)).toContain('2 pending changes');
    expect(options).toMatchObject({ modal: true });
    expect(String((options as { detail?: string }).detail)).toContain('a.ts');
    expect(String((options as { detail?: string }).detail)).toContain('b.ts');
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    expect(provider.sessionCount).toBe(3);
  });

  it('applies a batch only after the user picks the named write action', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
      'Write changes' as unknown as vscode.MessageItem,
    );

    await handlers.get('agi-workforce.acceptBatch')!('batch-1');

    expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(2);
    expect(provider.sessionCount).toBe(1);
  });

  it('discards a batch only after confirmation, and offers the restore', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
      'Discard changes' as unknown as vscode.MessageItem,
    );

    await handlers.get('agi-workforce.rejectBatch')!('batch-1');

    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    expect(provider.sessionCount).toBe(1);
    expect(provider.restorableCount).toBe(2);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('discarded 2 pending changes'),
      'Restore discarded',
    );
  });

  it('confirms the whole-tree accept before touching any file', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);

    await handlers.get('agi-workforce.acceptAllDiffsGlobal')!();

    const [message, options] = vi.mocked(vscode.window.showWarningMessage).mock.calls[0] ?? [];
    expect(String(message)).toContain('3 pending changes');
    expect(String(message)).toContain('across 3 files');
    expect(options).toMatchObject({ modal: true });
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });

  it('confirms the whole-tree discard and keeps it recoverable', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
      'Discard changes' as unknown as vscode.MessageItem,
    );

    await handlers.get('agi-workforce.rejectAllDiffsGlobal')!();
    expect(provider.sessionCount).toBe(0);

    handlers.get('agi-workforce.restoreRejectedDiffs')!();
    expect(provider.sessionCount).toBe(3);
  });

  it('defaults the per-file commands to the active editor instead of throwing', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);
    vscode.window.activeTextEditor = makeEditor(vscode.Uri.file('/workspace/c.ts'));

    await handlers.get('agi-workforce.acceptAllDiffs')!(undefined);

    const [message] = vi.mocked(vscode.window.showWarningMessage).mock.calls[0] ?? [];
    expect(String(message)).toContain('1 pending change');
    expect(String(message)).toContain('c.ts');
  });

  it('warns instead of throwing when the per-file command has no editor to fall back to', async () => {
    vscode.window.activeTextEditor = undefined;

    await expect(handlers.get('agi-workforce.rejectAllDiffs')!(undefined)).resolves.toBeUndefined();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('open the file'),
    );
  });

  it('tells the user when there is nothing left to restore', () => {
    handlers.get('agi-workforce.restoreRejectedDiffs')!();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('no discarded changes'),
    );
  });
});
