import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { DiffDecorationProvider } from '../providers/diffDecorationProvider';

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

function documentReading(text: string): void {
  vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({
    getText: () => text,
  } as never);
}

describe('accepting an inline diff after the file moved on', () => {
  let provider: DiffDecorationProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.workspace.applyEdit).mockResolvedValue(true as never);
    provider = new DiffDecorationProvider();
  });

  it('applies the edit when the text is still the text it was written against', async () => {
    documentReading('old a');
    const session = provider.showDiff(
      makeEditor(vscode.Uri.file('/workspace/a.ts')),
      'old a',
      'new a',
      new vscode.Range(1, 0, 1, 5),
    );

    await expect(provider.acceptDiff(session.id)).resolves.toBe(true);
    expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1);
  });

  it('refuses, and writes nothing, when a person edited those lines first', async () => {
    const session = provider.showDiff(
      makeEditor(vscode.Uri.file('/workspace/a.ts')),
      'old a',
      'new a',
      new vscode.Range(1, 0, 1, 5),
    );
    documentReading('what the person typed instead');

    await expect(provider.acceptDiff(session.id)).resolves.toBe(false);
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
  });

  it('keeps the diff so the person can still read it, rather than dropping it', async () => {
    const session = provider.showDiff(
      makeEditor(vscode.Uri.file('/workspace/a.ts')),
      'old a',
      'new a',
      new vscode.Range(1, 0, 1, 5),
    );
    documentReading('changed');

    await provider.acceptDiff(session.id);

    expect(provider.getSession(session.id)).toBeDefined();
  });

  it('reports once for a batch instead of one warning per stale edit', async () => {
    for (const name of ['a', 'b', 'c']) {
      provider.showDiff(
        makeEditor(vscode.Uri.file(`/workspace/${name}.ts`)),
        `old ${name}`,
        `new ${name}`,
        new vscode.Range(1, 0, 1, 5),
        { batchId: 'batch-1', filePath: `${name}.ts` },
      );
    }
    documentReading('all three files moved on');

    await provider.acceptBatch('batch-1');

    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    expect(vi.mocked(vscode.window.showWarningMessage).mock.calls).toHaveLength(1);
    expect(String(vi.mocked(vscode.window.showWarningMessage).mock.calls[0]?.[0])).toContain('3');
  });
});

describe('accepting several edits in one file at once', () => {
  const uri = vscode.Uri.file('/workspace/a.ts');
  let provider: DiffDecorationProvider;
  let version: number;

  beforeEach(() => {
    vi.clearAllMocks();
    version = 1;
    vi.mocked(vscode.workspace.openTextDocument).mockImplementation((async () => ({
      version,
      getText: () => '',
    })) as never);
    vi.mocked(vscode.workspace.applyEdit).mockImplementation((async (edit: {
      entries: () => unknown[];
    }) => {
      version += edit.entries().length > 0 ? 1 : 0;
      return true;
    }) as never);
    provider = new DiffDecorationProvider();
  });

  function propose(line: number, text: string) {
    return provider.showDiff(
      versioned(makeEditor(uri), () => version),
      '',
      text,
      new vscode.Range(line, 0, line, 0),
    );
  }

  it('applies two insertions proposed at the same version in a single edit', async () => {
    propose(3, 'first');
    propose(10, 'second');

    await provider.acceptAll(uri);

    expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1);
    const edit = vi.mocked(vscode.workspace.applyEdit).mock.calls[0]?.[0] as unknown as {
      entries: () => Array<[unknown, Array<{ newText: string }>]>;
    };
    expect(edit.entries()[0]?.[1].map((change) => change.newText)).toEqual(['second', 'first']);
    expect(provider.sessionCount).toBe(0);
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('still refuses every insertion when the file changed after they were proposed', async () => {
    propose(3, 'first');
    propose(10, 'second');
    version += 1;

    await provider.acceptAll(uri);

    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    expect(provider.sessionCount).toBe(2);
    expect(String(vi.mocked(vscode.window.showWarningMessage).mock.calls[0]?.[0])).toContain('2');
  });

  it('applies the fresh edits and leaves the stale one waiting', async () => {
    const stale = provider.showDiff(
      versioned(makeEditor(uri), () => version),
      'old',
      'new',
      new vscode.Range(5, 0, 5, 3),
    );
    propose(10, 'second');
    vi.mocked(vscode.workspace.openTextDocument).mockImplementation((async () => ({
      version,
      getText: () => 'edited by hand',
    })) as never);

    await provider.acceptAll(uri);

    expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1);
    expect(provider.getSession(stale.id)).toBeDefined();
    expect(provider.sessionCount).toBe(1);
  });

  it('applies neither of two insertions at the same point, and keeps both', async () => {
    propose(4, 'one');
    propose(4, 'two');

    await provider.acceptAll(uri);

    expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1);
    expect(provider.sessionCount).toBe(1);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps every edit and says so when the editor refuses the write', async () => {
    propose(3, 'first');
    propose(10, 'second');
    vi.mocked(vscode.workspace.applyEdit).mockResolvedValue(false as never);

    await provider.acceptAll(uri);

    expect(provider.sessionCount).toBe(2);
    expect(String(vi.mocked(vscode.window.showWarningMessage).mock.calls[0]?.[0])).toContain('2');
  });
});

function versioned(editor: vscode.TextEditor, read: () => number): vscode.TextEditor {
  Object.defineProperty(editor.document, 'version', { get: read });
  return editor;
}
