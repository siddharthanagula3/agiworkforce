import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { buildContextAttachment, resolveContextMenuState } from '../data/composerContext';
import { getContextBuilder } from '../data/contextBuilder';

vi.mock('../data/contextBuilder', () => ({
  getContextBuilder: vi.fn(),
}));

interface BuilderStub {
  getActiveFileContext: ReturnType<typeof vi.fn>;
  getOpenFilesContext: ReturnType<typeof vi.fn>;
  getDiagnosticsContext: ReturnType<typeof vi.fn>;
  getGitContext: ReturnType<typeof vi.fn>;
}

let builder: BuilderStub;

function stateFor(kind: string) {
  return resolveContextMenuState().then((items) => items.find((item) => item.kind === kind));
}

function setActiveEditor(selection: { empty: boolean; from: number; to: number } | null): void {
  const editor =
    selection === null
      ? undefined
      : {
          selection: {
            isEmpty: selection.empty,
            start: { line: selection.from - 1, character: 0 },
            end: { line: selection.to - 1, character: 0 },
          },
          document: { uri: vscode.Uri.file('/workspace/src/app.ts') },
        };
  Object.defineProperty(vscode.window, 'activeTextEditor', {
    configurable: true,
    value: editor,
  });
}

beforeEach(() => {
  builder = {
    getActiveFileContext: vi.fn().mockReturnValue(undefined),
    getOpenFilesContext: vi.fn().mockReturnValue([]),
    getDiagnosticsContext: vi.fn().mockReturnValue([]),
    getGitContext: vi.fn().mockResolvedValue(''),
  };
  vi.mocked(getContextBuilder).mockReturnValue(builder as never);
  vi.mocked(vscode.workspace.asRelativePath).mockImplementation((value: unknown) =>
    String((value as { fsPath?: string }).fsPath ?? value).replace('/workspace/', ''),
  );
  Object.defineProperty(vscode.workspace, 'isTrusted', { configurable: true, value: true });
  setActiveEditor(null);
});

describe('selection item', () => {
  it('is unavailable with its reason when nothing is selected', async () => {
    expect(await stateFor('selection')).toEqual({
      kind: 'selection',
      available: false,
      detail: 'Select code in an editor first',
    });
    expect(await buildContextAttachment('selection')).toBeUndefined();
  });

  it('names the file and line span when a selection exists', async () => {
    setActiveEditor({ empty: false, from: 12, to: 20 });
    builder.getActiveFileContext.mockReturnValue({
      relativePath: 'src/app.ts',
      languageId: 'typescript',
      selectedText: 'const a = 1;',
    });

    expect(await stateFor('selection')).toEqual({
      kind: 'selection',
      available: true,
      detail: 'src/app.ts:12-20',
    });
    const attachment = await buildContextAttachment('selection');
    expect(attachment?.name).toBe('src/app.ts:12-20');
    expect(attachment?.text).toContain('const a = 1;');
    expect(attachment?.text).toContain('lines 12-20');
  });

  it('treats a caret with no span as no selection', async () => {
    setActiveEditor({ empty: true, from: 4, to: 4 });

    expect((await stateFor('selection'))?.available).toBe(false);
  });
});

describe('open editors item', () => {
  it('is unavailable with its reason when nothing is open', async () => {
    expect(await stateFor('open-files')).toEqual({
      kind: 'open-files',
      available: false,
      detail: 'No editors are open',
    });
  });

  it('counts the open editors and marks the active one', async () => {
    builder.getOpenFilesContext.mockReturnValue([
      { relativePath: 'src/a.ts', isActive: true },
      { relativePath: 'src/b.ts', isActive: false },
    ]);

    expect((await stateFor('open-files'))?.detail).toBe('2 open editors');
    const attachment = await buildContextAttachment('open-files');
    expect(attachment?.text).toContain('- src/a.ts (active editor)');
    expect(attachment?.text).toContain('- src/b.ts');
  });
});

describe('problems item', () => {
  it('says which file is clean when the active file reports nothing', async () => {
    setActiveEditor({ empty: true, from: 1, to: 1 });

    expect(await stateFor('problems')).toEqual({
      kind: 'problems',
      available: false,
      detail: 'No errors or warnings in src/app.ts',
    });
    expect(await buildContextAttachment('problems')).toBeUndefined();
  });

  it('asks for a file when no editor is active', async () => {
    expect((await stateFor('problems'))?.detail).toBe('Open a file to read its problems');
  });

  it('carries each diagnostic with its position', async () => {
    setActiveEditor({ empty: true, from: 1, to: 1 });
    builder.getDiagnosticsContext.mockReturnValue([
      { severity: 'error', message: 'bad argument', line: 31, column: 12, source: 'ts' },
    ]);

    expect((await stateFor('problems'))?.detail).toBe('1 problems in src/app.ts');
    expect((await buildContextAttachment('problems'))?.text).toContain(
      '- error at src/app.ts:31:12 (ts): bad argument',
    );
  });
});

describe('git changes item', () => {
  it('is unavailable on a clean tree', async () => {
    builder.getGitContext.mockResolvedValue('Git: clean working tree, no changes.');

    expect(await stateFor('git-diff')).toEqual({
      kind: 'git-diff',
      available: false,
      detail: 'No uncommitted changes',
    });
    expect(await buildContextAttachment('git-diff')).toBeUndefined();
  });

  it('never runs git in an untrusted workspace', async () => {
    Object.defineProperty(vscode.workspace, 'isTrusted', { configurable: true, value: false });

    expect(await stateFor('git-diff')).toEqual({
      kind: 'git-diff',
      available: false,
      detail: 'Trust this workspace to read git',
    });
    expect(builder.getGitContext).not.toHaveBeenCalled();
  });

  it('offers the status and diff when the tree is dirty', async () => {
    builder.getGitContext.mockResolvedValue('Git status:\n  Modified (1): src/a.ts');

    expect((await stateFor('git-diff'))?.available).toBe(true);
    expect((await buildContextAttachment('git-diff'))?.text).toContain('Modified (1): src/a.ts');
  });
});

describe('menu ordering', () => {
  it('publishes every kind once, in a stable order', async () => {
    const items = await resolveContextMenuState();

    expect(items.map((item) => item.kind)).toEqual([
      'selection',
      'open-files',
      'problems',
      'git-diff',
    ]);
  });
});
