import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { applyLlmEdit } from '../platform/applyEdit';
import { INLINE_PROPOSAL_SCHEME, getInlineProposals } from '../platform/inlineProposal';

const uri = vscode.Uri.file('/mock/workspace/math.ts');

function fakeDocument(text: string) {
  return {
    languageId: 'typescript',
    uri,
    getText: (range?: { start: number; end: number }) =>
      range === undefined ? text : text.slice(range.start, range.end),
    offsetAt: (position: number) => position,
  };
}

const original = 'export const lte = (a, b) => a < b;\n';
const selection = {
  isEmpty: false,
  start: 0,
  end: original.length - 1,
} as unknown as vscode.Selection;
const response = 'Fixed.\n\n```typescript\nexport const lte = (a, b) => a <= b;\n```';

function proposalUri(): vscode.Uri {
  const calls = vi
    .mocked(vscode.commands.executeCommand)
    .mock.calls.filter(([command]) => command === 'vscode.diff');
  return calls[calls.length - 1]?.[2] as vscode.Uri;
}

async function propose(text = original) {
  const document = fakeDocument(text);
  const editor = { document } as unknown as vscode.TextEditor;
  const outcome = applyLlmEdit(editor, selection, response, 'Fix');
  await vi.waitFor(() => expect(proposalUri()).toBeDefined());
  return { document, outcome };
}

afterEach(async () => {
  const pending = proposalUri();
  if (pending !== undefined) await getInlineProposals().reject(pending);
  vi.clearAllMocks();
});

describe('an inline Fix result', () => {
  it('opens a diff of the whole file with the proposed lines, and changes nothing yet', async () => {
    await propose();

    const proposed = proposalUri();
    expect(proposed.scheme).toBe(INLINE_PROPOSAL_SCHEME);
    expect(getInlineProposals().provideTextDocumentContent(proposed)).toBe(
      'export const lte = (a, b) => a <= b;\n',
    );
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('applies the edit only when the proposal is accepted', async () => {
    const { document, outcome } = await propose();
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(document as never);
    vi.mocked(vscode.workspace.applyEdit).mockResolvedValue(true);

    await expect(getInlineProposals().accept(proposalUri())).resolves.toBe(true);

    await expect(outcome).resolves.toBe('accepted');
    expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1);
    expect(getInlineProposals().pending()).toBe(0);
  });

  it('applies nothing when rejected', async () => {
    const { outcome } = await propose();

    await getInlineProposals().reject(proposalUri());

    await expect(outcome).resolves.toBe('dismissed');
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });

  it('stays open until acted on, and refuses an accept after the file moved on', async () => {
    const { outcome } = await propose();
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(
      fakeDocument('export const lte = (a, b) => b > a;\n') as never,
    );

    await expect(getInlineProposals().accept(proposalUri())).resolves.toBe(false);

    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('changed since the edit was proposed'),
    );
    expect(getInlineProposals().pending()).toBe(1);
    await getInlineProposals().reject(proposalUri());
    await expect(outcome).resolves.toBe('dismissed');
  });
});
