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
