import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  buildAskAboutCodePrompt,
  buildExplainErrorPrompt,
  buildExplainSelectionPrompt,
  buildExplainTerminalPrompt,
  runEditorUtility,
  setEditorUtilityChat,
} from '../features/editor-utilities';

function setEditor(editor: unknown): void {
  Object.defineProperty(vscode.window, 'activeTextEditor', {
    configurable: true,
    writable: true,
    value: editor,
  });
}

function editorWith(options: {
  selection: { startLine: number; endLine: number; empty: boolean };
  text: string;
  visible?: { startLine: number; endLine: number };
}): unknown {
  const { selection, text } = options;
  return {
    selection: {
      isEmpty: selection.empty,
      start: { line: selection.startLine, character: 0 },
      end: { line: selection.endLine, character: 0 },
      active: { line: selection.endLine, character: 0 },
    },
    visibleRanges:
      options.visible === undefined
        ? []
        : [
            {
              start: { line: options.visible.startLine, character: 0 },
              end: { line: options.visible.endLine, character: 0 },
            },
          ],
    document: {
      uri: vscode.Uri.file('/workspace/src/app.ts'),
      languageId: 'typescript',
      lineCount: 40,
      getText: () => text,
      lineAt: () => ({ text: '' }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setEditorUtilityChat(undefined);
  setEditor(undefined);
  vi.mocked(vscode.workspace.asRelativePath).mockImplementation((value: unknown) =>
    String((value as { fsPath?: string }).fsPath ?? value).replace('/workspace/', ''),
  );
});

describe('explain selection', () => {
  it('refuses without an editor and without a selection', () => {
    expect(buildExplainSelectionPrompt()).toEqual({
      ok: false,
      message: 'No active editor. Open a file first.',
    });

    setEditor(editorWith({ selection: { startLine: 0, endLine: 0, empty: true }, text: '' }));
    expect(buildExplainSelectionPrompt()).toEqual({
      ok: false,
      message: 'Select some code first.',
    });
  });

  it('names the file, the language and the line span', () => {
    setEditor(
      editorWith({
        selection: { startLine: 0, endLine: 2, empty: false },
        text: 'export const add = (a, b) => a + b;',
      }),
    );

    const built = buildExplainSelectionPrompt();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.prompt).toContain('src/app.ts, lines 1-3');
    expect(built.prompt).toContain('```typescript\nexport const add = (a, b) => a + b;\n```');
  });
});

describe('explain error', () => {
  it('refuses when no diagnostic covers the cursor', () => {
    setEditor(editorWith({ selection: { startLine: 4, endLine: 4, empty: true }, text: 'x' }));
    vi.mocked(vscode.languages.getDiagnostics).mockReturnValue([] as never);

    expect(buildExplainErrorPrompt()).toEqual({ ok: false, message: 'No errors on this line.' });
  });

  it('lists the covering diagnostics with their severity and source', () => {
    setEditor(editorWith({ selection: { startLine: 4, endLine: 4, empty: true }, text: 'x' }));
    vi.mocked(vscode.languages.getDiagnostics).mockReturnValue([
      {
        severity: vscode.DiagnosticSeverity.Error,
        message: 'b is not defined',
        source: 'ts',
        code: 2304,
        range: { start: { line: 4 }, end: { line: 4 } },
      },
    ] as never);

    const built = buildExplainErrorPrompt();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.prompt).toContain('1. Error [ts] (2304): b is not defined');
    expect(built.prompt).toContain('src/app.ts');
  });
});

describe('ask about code', () => {
  it('refuses an empty question', () => {
    expect(buildAskAboutCodePrompt('   ')).toEqual({ ok: false, message: 'Ask a question first.' });
  });

  it('asks the bare question when no file is open', () => {
    expect(buildAskAboutCodePrompt('Why is this slow?')).toEqual({
      ok: true,
      prompt: 'Why is this slow?',
    });
  });

  it('labels visible code when nothing is selected and selected code when it is', () => {
    setEditor(
      editorWith({
        selection: { startLine: 0, endLine: 0, empty: true },
        text: 'const a = 1;',
        visible: { startLine: 0, endLine: 9 },
      }),
    );
    const visible = buildAskAboutCodePrompt('What runs first?');
    expect(visible.ok && visible.prompt).toContain('Visible code lines 1-10');

    setEditor(
      editorWith({ selection: { startLine: 2, endLine: 5, empty: false }, text: 'const a = 1;' }),
    );
    const selected = buildAskAboutCodePrompt('What runs first?');
    expect(selected.ok && selected.prompt).toContain('Selected code lines 3-6');
  });
});

describe('explain terminal output', () => {
  it('refuses an empty transcript and fences a real one', () => {
    expect(buildExplainTerminalPrompt('  ')).toEqual({
      ok: false,
      message: 'No terminal output to explain.',
    });

    const built = buildExplainTerminalPrompt('$ pnpm test\n1 failing\n[exit code 1]');
    expect(built.ok && built.prompt).toContain('```\n$ pnpm test\n1 failing\n[exit code 1]\n```');
  });
});

describe('routing', () => {
  it('sends the prompt to the chat view instead of a cloud completion', async () => {
    const asked: string[] = [];
    setEditorUtilityChat((prompt) => {
      asked.push(prompt);
    });

    await runEditorUtility({ ok: true, prompt: 'Explain this' });

    expect(asked).toEqual(['Explain this']);
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('states the refusal and asks nothing when the prompt could not be built', async () => {
    const asked: string[] = [];
    setEditorUtilityChat((prompt) => {
      asked.push(prompt);
    });

    await runEditorUtility({ ok: false, message: 'Select some code first.' });

    expect(asked).toEqual([]);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'AGI Workforce: Select some code first.',
    );
  });

  it('never falls back to a cloud route when no chat view is registered', async () => {
    await runEditorUtility({ ok: true, prompt: 'Explain this' });

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'AGI Workforce: The chat view is not available in this window. Reload the window and try again.',
    );
  });
});

describe('what never leaves the machine', () => {
  const selection = { startLine: 0, endLine: 2, empty: false };

  function editorOn(path: string): unknown {
    const editor = editorWith({ selection, text: 'const token = 1;' }) as {
      document: { uri: unknown };
    };
    editor.document.uri = vscode.Uri.file(path);
    return editor;
  }

  it('refuses to send a credential file even from a trusted workspace', () => {
    vscode.workspace.isTrusted = true;
    setEditor(editorOn('/workspace/.env'));

    const built = buildExplainSelectionPrompt();

    expect(built.ok).toBe(false);
    expect(built.ok === false && built.message).toMatch(/credential-file policy/);
  });

  it('refuses to send ordinary source from an untrusted workspace', () => {
    vscode.workspace.isTrusted = false;
    setEditor(editorOn('/workspace/src/app.ts'));

    const built = buildExplainSelectionPrompt();

    expect(built.ok).toBe(false);
    expect(built.ok === false && built.message).toMatch(/not trusted/);
  });

  it('refuses terminal output from an untrusted workspace', () => {
    vscode.workspace.isTrusted = false;

    const built = buildExplainTerminalPrompt('npm ERR! code E401');

    expect(built.ok).toBe(false);
  });

  it('asks the question without the file when the file is a credential file', () => {
    vscode.workspace.isTrusted = true;
    setEditor(editorOn('/workspace/.env.local'));

    const built = buildAskAboutCodePrompt('what is wrong here?');

    expect(built.ok).toBe(true);
    expect(built.ok === true && built.prompt).toBe('what is wrong here?');
  });

  it('still sends ordinary source from a trusted workspace', () => {
    vscode.workspace.isTrusted = true;
    setEditor(editorOn('/workspace/src/app.ts'));

    const built = buildExplainSelectionPrompt();

    expect(built.ok).toBe(true);
  });
});
