import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { DiffDecorationProvider } from '../providers/diffDecorationProvider';

describe('DiffDecorationProvider', () => {
  it('offsets preview decorations to the selected editor range', () => {
    const setDecorations = vi.fn();
    const lines = Array.from({ length: 12 }, (_, index) => `line ${index}`);
    const editor = {
      document: {
        uri: vscode.Uri.file('/mock/workspace/src/app.ts'),
        lineCount: lines.length,
        lineAt: (line: number) => ({ text: lines[line] ?? '' }),
      },
      setDecorations,
    } as unknown as vscode.TextEditor;
    const provider = new DiffDecorationProvider();

    provider.showDiff(editor, 'old value', 'new value', new vscode.Range(7, 0, 7, 9));

    const decoratedRanges = setDecorations.mock.calls
      .flatMap((call) => call[1] as vscode.DecorationOptions[])
      .map((option) => option.range);
    expect(decoratedRanges.length).toBeGreaterThan(0);
    expect(decoratedRanges.every((range) => range.start.line === 7)).toBe(true);
  });
});
