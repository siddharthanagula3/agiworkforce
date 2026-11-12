import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CODE_REVIEW_DIAGNOSTIC_SOURCE } from '@agiworkforce/ide-runtime';
import { AgiDiagnosticsProvider } from '../providers/diagnosticsProvider';
import { ContextBuilder } from '../data/contextBuilder';

type ChangeListener = (event: vscode.TextDocumentChangeEvent) => void;
type CloseListener = (document: vscode.TextDocument) => void;

const FILE = '/repo/src/foo.ts';

function finding(line: number, message: string) {
  return {
    message,
    severity: 'warning' as const,
    source: CODE_REVIEW_DIAGNOSTIC_SOURCE,
    range: { start: { line, character: 0 }, end: { line, character: 5 } },
  };
}

describe('code review findings follow the document', () => {
  let changeListeners: ChangeListener[];
  let closeListeners: CloseListener[];
  let stored: Map<string, vscode.Diagnostic[]>;

  beforeEach(() => {
    changeListeners = [];
    closeListeners = [];
    stored = new Map();
    vi.mocked(vscode.workspace.onDidChangeTextDocument).mockImplementation(((
      listener: ChangeListener,
    ) => {
      changeListeners.push(listener);
      return new vscode.Disposable(() => undefined);
    }) as never);
    vi.mocked(vscode.workspace.onDidCloseTextDocument).mockImplementation(((
      listener: CloseListener,
    ) => {
      closeListeners.push(listener);
      return new vscode.Disposable(() => undefined);
    }) as never);
    vi.mocked(vscode.languages.createDiagnosticCollection).mockReturnValue({
      set: vi.fn((uri: vscode.Uri, diagnostics: vscode.Diagnostic[]) =>
        stored.set(uri.toString(), diagnostics),
      ),
      get: vi.fn((uri: vscode.Uri) => stored.get(uri.toString())),
      delete: vi.fn((uri: vscode.Uri) => stored.delete(uri.toString())),
      clear: vi.fn(() => stored.clear()),
      dispose: vi.fn(),
    } as unknown as vscode.DiagnosticCollection);
  });

  afterEach(() => {
    vi.mocked(vscode.workspace.onDidChangeTextDocument).mockImplementation(
      () => new vscode.Disposable(() => undefined),
    );
    vi.mocked(vscode.workspace.onDidCloseTextDocument).mockImplementation(
      () => new vscode.Disposable(() => undefined),
    );
  });

  function edit(range: vscode.Range, text: string): void {
    const event = {
      document: { uri: vscode.Uri.file(FILE) },
      contentChanges: [{ range, text, rangeLength: 0, rangeOffset: 0 }],
      reason: undefined,
    } as unknown as vscode.TextDocumentChangeEvent;
    for (const listener of changeListeners) listener(event);
  }

  function lines(): number[] {
    return (stored.get(vscode.Uri.file(FILE).toString()) ?? []).map(
      (diagnostic) => diagnostic.range.start.line,
    );
  }

  it('drops a finding whose lines were edited and moves the ones below it', () => {
    const provider = new AgiDiagnosticsProvider();
    provider.publishDiagnostics(FILE, [finding(2, 'first'), finding(10, 'second')]);

    edit(new vscode.Range(2, 0, 2, 5), 'fixed');
    expect(lines()).toEqual([10]);

    edit(new vscode.Range(0, 0, 0, 0), Array.from({ length: 20 }, () => '\n').join(''));
    expect(lines()).toEqual([30]);
  });

  it('clears the findings when the last one is edited or the file closes', () => {
    const provider = new AgiDiagnosticsProvider();
    provider.publishDiagnostics(FILE, [finding(4, 'only')]);
    edit(new vscode.Range(4, 0, 4, 1), '');
    expect(stored.has(vscode.Uri.file(FILE).toString())).toBe(false);

    provider.publishDiagnostics(FILE, [finding(4, 'again')]);
    for (const listener of closeListeners) {
      listener({ uri: vscode.Uri.file(FILE) } as vscode.TextDocument);
    }
    expect(stored.has(vscode.Uri.file(FILE).toString())).toBe(false);
  });

  it('never presents a review finding to the model as a compiler problem', () => {
    vi.mocked(vscode.languages.getDiagnostics).mockReturnValueOnce([
      Object.assign(new vscode.Diagnostic(new vscode.Range(1, 0, 1, 1), 'AI review opinion', 1), {
        source: CODE_REVIEW_DIAGNOSTIC_SOURCE,
      }),
      Object.assign(new vscode.Diagnostic(new vscode.Range(3, 0, 3, 1), 'Type error', 0), {
        source: 'ts',
      }),
    ] as never);
    const editor = { document: { uri: vscode.Uri.file(FILE) } } as unknown as vscode.TextEditor;

    const entries = new ContextBuilder().getDiagnosticsContext(editor);

    expect(entries.map((entry) => entry.message)).toEqual(['Type error']);
  });
});
