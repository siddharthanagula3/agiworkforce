import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { DiffDecorationProvider } from '../providers/diffDecorationProvider';

function editorFixture(lines: string[]) {
  const setDecorations = vi.fn();
  const text = lines.join('\n');
  const document = {
    uri: vscode.Uri.file('/mock/workspace/src/app.ts'),
    lineCount: lines.length,
    lineAt: (line: number) => ({ text: lines[line] ?? '' }),
    getText: () => text,
    offsetAt: (position: vscode.Position) =>
      lines.slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0) +
      position.character,
  };
  const editor = { document, setDecorations } as unknown as vscode.TextEditor;
  return { editor, document, setDecorations };
}

function decoratedLines(setDecorations: ReturnType<typeof vi.fn>): number[] {
  return setDecorations.mock.calls
    .flatMap((call) => call[1] as vscode.DecorationOptions[])
    .map((option) => option.range.start.line);
}

describe('DiffDecorationProvider', () => {
  afterEach(() => {
    vi.mocked(vscode.commands.executeCommand).mockClear();
    vi.mocked(vscode.workspace.registerTextDocumentContentProvider).mockClear();
  });

  it('offsets preview decorations to the selected editor range', () => {
    const { editor, setDecorations } = editorFixture(
      Array.from({ length: 12 }, (_, index) => `line ${index}`),
    );
    const provider = new DiffDecorationProvider();

    provider.showDiff(editor, 'old value', 'new value', new vscode.Range(7, 0, 7, 9));

    const lines = decoratedLines(setDecorations);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line === 7)).toBe(true);
  });

  it('marks only the insertion point, never the existing lines after it, for an insertion', () => {
    const { editor, setDecorations } = editorFixture(
      Array.from({ length: 60 }, (_, index) => `line ${index}`),
    );
    const provider = new DiffDecorationProvider();

    provider.showDiff(editor, '', 'a\nb\nc\nd', new vscode.Range(40, 0, 40, 0));

    expect(decoratedLines(setDecorations)).toEqual([40]);
  });

  it('opens a diff whose right side holds the proposed code', async () => {
    const lines = ['const a = 1;', 'const b = 2;', 'const c = 3;'];
    const { editor, document } = editorFixture(lines);
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValueOnce(document as never);
    const provider = new DiffDecorationProvider();
    const contentProvider = vi.mocked(vscode.workspace.registerTextDocumentContentProvider).mock
      .calls[0]?.[1] as vscode.TextDocumentContentProvider;

    provider.showDiff(editor, 'const b = 2;', 'const b = 20;', new vscode.Range(1, 0, 1, 12));

    const diffCall = vi
      .mocked(vscode.commands.executeCommand)
      .mock.calls.find((call) => call[0] === 'vscode.diff');
    expect(diffCall?.[1]).toBe(document.uri);
    const proposed = diffCall?.[2] as vscode.Uri;
    expect(proposed.scheme).not.toBe('file');
    expect(
      await contentProvider.provideTextDocumentContent(proposed, {} as vscode.CancellationToken),
    ).toBe('const a = 1;\nconst b = 20;\nconst c = 3;');
  });
});
