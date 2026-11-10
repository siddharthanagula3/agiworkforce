import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { DEVELOPER_REASONING_EFFORTS } from '@agiworkforce/local-runtime-contract';

import { AgiDiagnosticsProvider } from '../providers/diagnosticsProvider';
import { resolveReviewEffort, reviewDepthInstruction } from '../providers/reviewEffort';

const chatCompletion = vi.hoisted(() => vi.fn());
const realpath = vi.hoisted(() => vi.fn<(path: string) => string>());

vi.mock('../utils/api', () => ({ chatCompletion }));

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  realpathSync: realpath,
}));

function editorWith(text: string): vscode.TextEditor {
  return {
    document: {
      uri: vscode.Uri.file('/repo/src/app.ts'),
      languageId: 'typescript',
      getText: () => text,
    },
    selection: new vscode.Selection(0, 0, 0, 0),
  } as unknown as vscode.TextEditor;
}

describe('review depth by effort', () => {
  it('gives each of the four review levels a different pass', () => {
    const passes = (['low', 'medium', 'high', 'xhigh'] as const).map(reviewDepthInstruction);
    expect(new Set(passes).size).toBe(4);
    expect(passes[0]).toContain('one quick pass');
    expect(passes[2]).toContain('Trace how each value flows');
    expect(passes[3]).toContain('second pass');
    expect(passes[3]).toContain(passes[2]);
  });

  it('treats the levels below low as a quick pass and max as the deepest', () => {
    expect(reviewDepthInstruction('none')).toBe(reviewDepthInstruction('low'));
    expect(reviewDepthInstruction('minimal')).toBe(reviewDepthInstruction('low'));
    expect(reviewDepthInstruction('max')).toContain('Unconfirmed:');
    expect(reviewDepthInstruction('max')).toContain(reviewDepthInstruction('xhigh'));
  });

  it('has an instruction decision for every level on the ladder', () => {
    for (const effort of DEVELOPER_REASONING_EFFORTS) {
      expect(typeof reviewDepthInstruction(effort)).toBe('string');
    }
  });

  it('uses the session effort when no level is passed and a passed level overrides it', () => {
    expect(resolveReviewEffort(undefined, 'high')).toBe('high');
    expect(resolveReviewEffort('xhigh', 'low')).toBe('xhigh');
    expect(resolveReviewEffort('extreme', 'low')).toBe('low');
    expect(resolveReviewEffort({ level: 'high' }, 'medium')).toBe('medium');
  });
});

describe('reviewing code at an effort', () => {
  beforeEach(() => {
    vscode.workspace.isTrusted = true;
    chatCompletion.mockReset();
    chatCompletion.mockResolvedValue('Looks fine.');
    realpath.mockReset().mockImplementation((path) => path);
  });

  afterEach(() => {
    vscode.workspace.isTrusted = true;
  });

  async function userPromptAt(effort: Parameters<typeof reviewDepthInstruction>[0]) {
    const provider = new AgiDiagnosticsProvider();
    await provider.reviewCode(
      editorWith('const a = 1;'),
      {} as vscode.SecretStorage,
      new vscode.CancellationTokenSource().token,
      effort,
    );
    const messages = chatCompletion.mock.calls.at(-1)?.[1] as { role: string; content: string }[];
    return messages.find((message) => message.role === 'user')?.content ?? '';
  }

  it('sends a different prompt for each level and leaves the medium prompt as it was', async () => {
    const low = await userPromptAt('low');
    const medium = await userPromptAt('medium');
    const xhigh = await userPromptAt('xhigh');

    expect(new Set([low, medium, xhigh]).size).toBe(3);
    expect(low).toContain('one quick pass');
    expect(medium.endsWith('```')).toBe(true);
    expect(xhigh).toContain('second pass');
    expect(xhigh).toContain('const a = 1;');
  });

  it.each(['untrusted-workspace', 'credential-target', 'unresolved'] as const)(
    'reports no review and reads or sends nothing for %s',
    async (refusal) => {
      if (refusal === 'untrusted-workspace') {
        vscode.workspace.isTrusted = false;
      } else if (refusal === 'credential-target') {
        realpath.mockReturnValue('/repo/.env');
      } else {
        realpath.mockImplementation(() => {
          throw new Error('EACCES');
        });
      }
      const editor = editorWith('const a = 1;');
      const read = vi.spyOn(editor.document, 'getText');
      const provider = new AgiDiagnosticsProvider();

      const result = await provider.reviewCode(
        editor,
        {} as vscode.SecretStorage,
        new vscode.CancellationTokenSource().token,
        'medium',
      );

      expect(result).toEqual({
        status: 'not-reviewed',
        reason: expect.stringMatching(/contents are not sent/),
      });
      expect(read).not.toHaveBeenCalled();
      expect(chatCompletion).not.toHaveBeenCalled();
      expect(provider.collection.set).not.toHaveBeenCalled();
      expect(provider.collection.delete).not.toHaveBeenCalled();
    },
  );

  it('reports no review for empty code without calling the model or changing diagnostics', async () => {
    const provider = new AgiDiagnosticsProvider();

    const result = await provider.reviewCode(
      editorWith(' \n\t'),
      {} as vscode.SecretStorage,
      new vscode.CancellationTokenSource().token,
      'medium',
    );

    expect(result).toEqual({ status: 'not-reviewed', reason: 'No code to review.' });
    expect(chatCompletion).not.toHaveBeenCalled();
    expect(provider.collection.set).not.toHaveBeenCalled();
    expect(provider.collection.delete).not.toHaveBeenCalled();
  });

  it.each([
    { response: 'Looks fine.', diagnosticCount: 0, summary: 'Looks fine.' },
    {
      response: 'ISSUE|0|error|Unchecked value\nOne issue.',
      diagnosticCount: 1,
      summary: 'One issue.',
    },
  ])('reports a completed review with $diagnosticCount findings', async (review) => {
    chatCompletion.mockResolvedValue(review.response);
    const provider = new AgiDiagnosticsProvider();

    const result = await provider.reviewCode(
      editorWith('const a = 1;'),
      {} as vscode.SecretStorage,
      new vscode.CancellationTokenSource().token,
      'medium',
    );

    expect(result).toEqual({
      status: 'completed',
      diagnosticCount: review.diagnosticCount,
      summary: review.summary,
    });
    expect(chatCompletion).toHaveBeenCalledOnce();
  });
});

describe('a review that finishes after the file moved on', () => {
  beforeEach(() => {
    vscode.workspace.isTrusted = true;
    chatCompletion.mockReset();
    realpath.mockReset().mockImplementation((path) => path);
  });

  function versionedEditor(text: string) {
    const editor = editorWith(text);
    const document = editor.document as { version: number; isClosed: boolean };
    document.version = 1;
    document.isClosed = false;
    return { editor, document };
  }

  function deferred() {
    let resolve!: (value: string) => void;
    const promise = new Promise<string>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  async function review(provider: AgiDiagnosticsProvider, editor: vscode.TextEditor) {
    return provider.reviewCode(
      editor,
      {} as vscode.SecretStorage,
      new vscode.CancellationTokenSource().token,
      'medium',
    );
  }

  it('publishes nothing when the document was edited while the review ran', async () => {
    const pending = deferred();
    chatCompletion.mockReturnValue(pending.promise);
    const provider = new AgiDiagnosticsProvider();
    const { editor, document } = versionedEditor('const a = 1;');

    const result = review(provider, editor);
    document.version = 2;
    pending.resolve('ISSUE|0|error|Unchecked value\nOne issue.');

    await expect(result).resolves.toEqual({
      status: 'not-reviewed',
      reason: expect.stringMatching(/changed while the review ran/),
    });
    expect(provider.collection.set).not.toHaveBeenCalled();
    expect(provider.collection.delete).not.toHaveBeenCalled();
  });

  it('publishes nothing when the document was closed while the review ran', async () => {
    const pending = deferred();
    chatCompletion.mockReturnValue(pending.promise);
    const provider = new AgiDiagnosticsProvider();
    const { editor, document } = versionedEditor('const a = 1;');

    const result = review(provider, editor);
    document.isClosed = true;
    pending.resolve('Looks fine.');

    await expect(result).resolves.toMatchObject({ status: 'not-reviewed' });
    expect(provider.collection.delete).not.toHaveBeenCalled();
  });

  it('keeps the newer review findings when an older review for the file finishes last', async () => {
    const older = deferred();
    const newer = deferred();
    chatCompletion.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const provider = new AgiDiagnosticsProvider();
    const { editor } = versionedEditor('const a = 1;');

    const olderResult = review(provider, editor);
    const newerResult = review(provider, editor);
    newer.resolve('ISSUE|0|warning|Shadowed name\nOne issue.');
    await expect(newerResult).resolves.toMatchObject({ status: 'completed', diagnosticCount: 1 });
    expect(provider.collection.set).toHaveBeenCalledTimes(1);

    older.resolve('Looks fine.');
    await expect(olderResult).resolves.toMatchObject({ status: 'not-reviewed' });
    expect(provider.collection.set).toHaveBeenCalledTimes(1);
    expect(provider.collection.delete).toHaveBeenCalledTimes(1);
  });

  it('reviews a different file independently of one still running', async () => {
    const first = deferred();
    chatCompletion.mockReturnValueOnce(first.promise).mockResolvedValueOnce('Looks fine.');
    const provider = new AgiDiagnosticsProvider();
    const one = versionedEditor('const a = 1;');
    const other = versionedEditor('const b = 2;');
    (other.document as unknown as { uri: vscode.Uri }).uri = vscode.Uri.file('/repo/src/other.ts');

    const firstResult = review(provider, one.editor);
    await expect(review(provider, other.editor)).resolves.toMatchObject({ status: 'completed' });
    first.resolve('Looks fine.');
    await expect(firstResult).resolves.toMatchObject({ status: 'completed' });
  });
});

type ImportedModule0 = typeof import('node:fs');
