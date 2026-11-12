import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { runInlineCommand } from '../core/runInlineCommand';
import { Config } from '../platform/config';
import * as api from '../utils/api';
import * as analytics from '../features/analytics/productAnalytics';
import * as recovery from '../core/cloudUtilityErrorActions';
import { t } from '../l10n';
import { ExtensionContext } from './__mocks__/vscode';
import { setEditorUtilityChat } from '../features/editor-utilities';
import { SYNTHETIC_LOCAL_MODEL_ID } from './catalogModelFixtures';

const realpath = vi.hoisted(() => vi.fn<(path: string) => string>());

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  realpathSync: realpath,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const buffersByUri = new Map<string, (edits: readonly vscode.TextEdit[]) => void>();

function editorFixture(file = '/workspace/a.ts') {
  let text = 'const x = 0;';
  let version = 1;
  let isClosed = false;
  let transaction: Promise<void> | undefined;
  const offset = (position: vscode.Position): number => {
    const lines = text.split('\n');
    return (
      lines.slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0) +
      position.character
    );
  };
  const applyTextEdits = (edits: readonly vscode.TextEdit[]): void => {
    for (const edit of [...edits].sort((a, b) => offset(b.range.start) - offset(a.range.start))) {
      text =
        text.slice(0, offset(edit.range.start)) + edit.newText + text.slice(offset(edit.range.end));
    }
    version += 1;
  };
  const range = new vscode.Selection(0, 0, 0, text.length);
  const document = {
    uri: vscode.Uri.file(file),
    languageId: 'typescript',
    isDirty: true,
    get version() {
      return version;
    },
    get isClosed() {
      return isClosed;
    },
    getText: (range?: vscode.Range) =>
      range ? text.slice(offset(range.start), offset(range.end)) : text,
  } as unknown as vscode.TextDocument;
  buffersByUri.set(document.uri.toString(), applyTextEdits);
  const edit = vi.fn(async (callback: (builder: vscode.TextEditorEdit) => void) => {
    const atStart = version;
    let replacement: { range: vscode.Range; text: string } | undefined;
    callback({
      replace: (range: vscode.Range, text: string) => {
        replacement = { range, text };
      },
    } as vscode.TextEditorEdit);
    if (transaction) await transaction;
    if (version !== atStart || isClosed || replacement === undefined) return false;
    applyTextEdits([{ range: replacement.range, newText: replacement.text }]);
    return true;
  });
  const editor = { document, selection: range, edit } as unknown as vscode.TextEditor;
  return {
    editor,
    edit,
    text: () => text,
    change: (next: string) => {
      text = next;
      version += 1;
    },
    close: () => {
      isClosed = true;
    },
    waitForTransaction: (wait: Promise<void>) => {
      transaction = wait;
    },
  };
}

describe('inline edit ownership across asynchronous work', () => {
  let progress: vscode.CancellationTokenSource;

  beforeEach(() => {
    vi.clearAllMocks();
    realpath.mockReset().mockImplementation((path) => path);
    buffersByUri.clear();
    progress = new vscode.CancellationTokenSource();
    vi.spyOn(Config, 'planModeActive').mockReturnValue(false);
    vi.spyOn(Config, 'autoApplyFixes').mockReturnValue(true);
    vi.spyOn(analytics, 'trackProductEvent').mockImplementation(() => undefined);
    vi.spyOn(vscode.window, 'withProgress').mockImplementation(async (_options, task) =>
      task({ report: vi.fn() }, progress.token),
    );
    vi.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace, 'openTextDocument').mockResolvedValue({} as vscode.TextDocument);
    vi.spyOn(vscode.workspace, 'applyEdit').mockImplementation(async (edit) => {
      for (const [uri, edits] of edit.entries()) buffersByUri.get(uri.toString())?.(edits);
      return true;
    });
    (vscode.workspace as { isTrusted: boolean }).isTrusted = true;
  });

  afterEach(() => {
    progress.dispose();
    (vscode.workspace as { isTrusted: boolean }).isTrusted = true;
    (vscode.window as { activeTextEditor: unknown }).activeTextEditor = undefined;
    vi.restoreAllMocks();
  });

  function start(target = editorFixture()) {
    const reply = deferred<string>();
    const completion = vi.spyOn(api, 'chatCompletion').mockReturnValue(reply.promise);
    (vscode.window as { activeTextEditor: unknown }).activeTextEditor = target.editor;
    const running = runInlineCommand(new ExtensionContext() as never, 'fix');
    return {
      target,
      running,
      completion,
      reply: () => reply.resolve('```typescript\nconst x = 1;\n```'),
    };
  }

  function expectNoWrite(target: ReturnType<typeof editorFixture>): void {
    expect(target.edit).not.toHaveBeenCalled();
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  }

  it.each(['fix', 'refactor', 'tests', 'docs'] as const)(
    'runs %s in the chat on a Local default model instead of sending it to AGI Cloud',
    async (command) => {
      vi.spyOn(Config, 'model').mockReturnValue(SYNTHETIC_LOCAL_MODEL_ID);
      vi.spyOn(vscode.workspace, 'asRelativePath').mockReturnValue('a.ts');
      const completion = vi.spyOn(api, 'chatCompletion');
      const chat = vi.fn();
      setEditorUtilityChat(chat);
      const target = editorFixture();
      (vscode.window as { activeTextEditor: unknown }).activeTextEditor = target.editor;
      try {
        await runInlineCommand(new ExtensionContext() as never, command);
      } finally {
        setEditorUtilityChat(undefined);
      }

      expect(completion).not.toHaveBeenCalled();
      expectNoWrite(target);
      expect(chat).toHaveBeenCalledOnce();
      expect(String(chat.mock.calls[0]?.[0])).toContain('a.ts, lines 1-1:');
      expect(String(chat.mock.calls[0]?.[0])).toContain('const x = 0;');
    },
  );

  it.each(['untrusted', 'credential'] as const)(
    'keeps the existing %s outbound refusal before the request',
    async (refusal) => {
      if (refusal === 'untrusted') {
        (vscode.workspace as { isTrusted: boolean }).isTrusted = false;
      }
      const run = start(editorFixture(refusal === 'credential' ? '/workspace/.env' : undefined));

      await run.running;

      expect(run.completion).not.toHaveBeenCalled();
      expectNoWrite(run.target);
      expect(vscode.window.showWarningMessage).toHaveBeenCalledOnce();
    },
  );

  it.each(['credential-target', 'unresolved'] as const)(
    'reads and sends nothing when the file path is %s',
    async (refusal) => {
      if (refusal === 'credential-target') {
        realpath.mockReturnValue('/workspace/.env');
      } else {
        realpath.mockImplementation(() => {
          throw new Error('ELOOP');
        });
      }
      const target = editorFixture();
      const read = vi.spyOn(target.editor.document, 'getText');
      const run = start(target);

      await run.running;

      expect(read).not.toHaveBeenCalled();
      expect(run.completion).not.toHaveBeenCalled();
      expectNoWrite(target);
      expect(vscode.window.showWarningMessage).toHaveBeenCalledOnce();
    },
  );

  it.each(['tests', 'docs'] as const)(
    'opens the %s result beside the code and never replaces the selection, even with auto-apply on',
    async (command) => {
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
        t('applyEdit.applyInline') as never,
      );
      vi.spyOn(api, 'chatCompletion').mockResolvedValue(
        '```typescript\nit("works", () => expect(x).toBe(0));\n```',
      );
      const target = editorFixture();
      (vscode.window as { activeTextEditor: unknown }).activeTextEditor = target.editor;

      await runInlineCommand(new ExtensionContext() as never, command);

      expectNoWrite(target);
      expect(target.text()).toBe('const x = 0;');
      expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('it("works"') }),
      );
    },
  );

  it('does not request a completion when the progress token was already cancelled', async () => {
    progress.cancel();
    const run = start();

    await run.running;

    expect(run.completion).not.toHaveBeenCalled();
    expectNoWrite(run.target);
  });

  it('applies to the captured dirty buffer after the active editor and selection change', async () => {
    const run = start();
    const other = editorFixture('/workspace/b.ts');
    (vscode.window as { activeTextEditor: unknown }).activeTextEditor = other.editor;
    run.target.editor.selection = new vscode.Selection(0, 4, 0, 5);
    run.reply();

    await run.running;

    expect(run.target.text()).toBe('const x = 1;');
    expect(other.edit).not.toHaveBeenCalled();
    expect(other.text()).toBe('const x = 0;');
    expect(run.target.editor.document.version).toBe(2);
  });

  it.each(['const x = 9;', '// inserted before the target\nconst x = 0;'])(
    'preserves a buffer changed during the model wait: %s',
    async (changed) => {
      const run = start();
      expect(run.completion).toHaveBeenCalledOnce();
      run.target.change(changed);
      run.reply();

      await run.running;

      expect(run.target.text()).toBe(changed);
      expectNoWrite(run.target);
      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
      expect(vscode.workspace.openTextDocument).toHaveBeenCalledOnce();
    },
  );

  it('rejects a closed target even when another editor has the same URI', async () => {
    const run = start();
    const reopened = editorFixture();
    run.target.close();
    (vscode.window as { activeTextEditor: unknown }).activeTextEditor = reopened.editor;
    run.reply();

    await run.running;

    expectNoWrite(run.target);
    expect(reopened.edit).not.toHaveBeenCalled();
    expect(vscode.workspace.openTextDocument).toHaveBeenCalledOnce();
  });

  it('does not write when workspace trust is revoked during the model wait', async () => {
    const run = start();
    (vscode.workspace as { isTrusted: boolean }).isTrusted = false;
    run.reply();

    await run.running;

    expectNoWrite(run.target);
    expect(run.target.text()).toBe('const x = 0;');
    expect(vscode.workspace.openTextDocument).toHaveBeenCalledOnce();
  });

  it('keeps cancellation authoritative when the response arrives afterwards', async () => {
    const run = start();
    progress.cancel();
    run.reply();

    await run.running;

    expectNoWrite(run.target);
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
  });

  it('rechecks the buffer after the user waits on Apply Inline', async () => {
    vi.mocked(Config.autoApplyFixes).mockReturnValue(false);
    const review = deferred<string | undefined>();
    vi.mocked(vscode.window.showInformationMessage).mockReturnValue(review.promise as never);
    const run = start();
    run.reply();
    await vi.waitFor(() => expect(vscode.window.showInformationMessage).toHaveBeenCalledOnce());
    run.target.change('const x = 9;');
    review.resolve(t('applyEdit.applyInline'));

    await run.running;

    expectNoWrite(run.target);
    expect(run.target.text()).toBe('const x = 9;');
    expect(vscode.workspace.openTextDocument).toHaveBeenCalledOnce();
  });

  it('does not apply or preview after cancellation while the review is open', async () => {
    vi.mocked(Config.autoApplyFixes).mockReturnValue(false);
    const review = deferred<string | undefined>();
    vi.mocked(vscode.window.showInformationMessage).mockReturnValue(review.promise as never);
    const run = start();
    run.reply();
    await vi.waitFor(() => expect(vscode.window.showInformationMessage).toHaveBeenCalledOnce());
    progress.cancel();
    review.resolve(t('applyEdit.applyInline'));

    await run.running;

    expectNoWrite(run.target);
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('rejects a target closed while the review is open', async () => {
    vi.mocked(Config.autoApplyFixes).mockReturnValue(false);
    const review = deferred<string | undefined>();
    vi.mocked(vscode.window.showInformationMessage).mockReturnValue(review.promise as never);
    const run = start();
    run.reply();
    await vi.waitFor(() => expect(vscode.window.showInformationMessage).toHaveBeenCalledOnce());
    run.target.close();
    review.resolve(t('applyEdit.applyInline'));

    await run.running;

    expectNoWrite(run.target);
    expect(vscode.workspace.openTextDocument).toHaveBeenCalledOnce();
  });

  it('uses the editor transaction to reject a change before the host commits it', async () => {
    const run = start();
    const transaction = deferred<void>();
    run.target.waitForTransaction(transaction.promise);
    run.reply();
    await vi.waitFor(() => expect(run.target.edit).toHaveBeenCalledOnce());
    run.target.change('const x = 9;');
    transaction.resolve();

    await run.running;

    expect(run.target.text()).toBe('const x = 9;');
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    expect(vscode.workspace.openTextDocument).toHaveBeenCalledOnce();
  });

  describe('retry after a recoverable failure', () => {
    function failThenRetry(target = editorFixture()) {
      const completion = vi
        .spyOn(api, 'chatCompletion')
        .mockRejectedValueOnce(new Error('fetch failed: ECONNRESET'))
        .mockResolvedValue('```typescript\nconst x = 1;\n```');
      let retry: (() => void | PromiseLike<void>) | undefined;
      vi.spyOn(recovery, 'showCloudUtilityErrorActions').mockImplementation(
        async (_error, options) => {
          retry = options.retry;
        },
      );
      (vscode.window as { activeTextEditor: unknown }).activeTextEditor = target.editor;
      const first = runInlineCommand(new ExtensionContext() as never, 'fix');
      return {
        target,
        completion,
        first,
        retry: async () => {
          await first;
          if (retry === undefined) throw new Error('The failure must offer a retry');
          await retry();
        },
      };
    }

    it('retries the file and range the failed command started on, not the active editor', async () => {
      const run = failThenRetry();
      const other = editorFixture('/workspace/b.ts');
      other.change('const secret = 42;');
      (vscode.window as { activeTextEditor: unknown }).activeTextEditor = other.editor;
      other.editor.selection = new vscode.Selection(0, 0, 0, 18);

      await run.retry();

      expect(run.completion).toHaveBeenCalledTimes(2);
      const sent = JSON.stringify(run.completion.mock.calls[1]?.[1]);
      expect(sent).toContain('const x = 0;');
      expect(sent).not.toContain('secret');
      expect(other.edit).not.toHaveBeenCalled();
      expect(other.text()).toBe('const secret = 42;');
      expect(run.target.text()).toBe('const x = 1;');
    });

    it.each(['changed', 'closed'] as const)(
      'refuses to retry and sends nothing when the original file was %s',
      async (change) => {
        const run = failThenRetry();
        await run.first;
        if (change === 'changed') run.target.change('const x = 7;');
        else run.target.close();

        await run.retry();

        expect(run.completion).toHaveBeenCalledOnce();
        expect(run.target.edit).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
          expect.stringContaining('run it again'),
        );
      },
    );
  });

  it('records an accepted edit if cancellation arrives after the host committed it', async () => {
    const run = start();
    const commit = run.target.edit.getMockImplementation();
    if (!commit) throw new Error('The fixture must provide the editor transaction');
    run.target.edit.mockImplementation(async (builder) => {
      const applied = await commit(builder);
      progress.cancel();
      return applied;
    });
    run.reply();

    await run.running;

    expect(run.target.text()).toBe('const x = 1;');
    expect(analytics.trackProductEvent).toHaveBeenCalledWith(
      'code_suggestion_resolved',
      'managed',
      expect.objectContaining({ outcome: 'accepted' }),
    );
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
  });
});

type ImportedModule0 = typeof import('node:fs');
