import * as vscode from 'vscode';
import {
  buildCodeReviewPrompt,
  parseCodeReview,
  type CodeDiagnostic,
  type CodeDiagnosticSeverity,
  type CodeDiagnosticsSession,
  type CodeEditorSession,
  type CodeRange,
  type CodeSelection,
} from '@agiworkforce/ide-runtime';
import { describeOutboundRefusal } from '../core/outboundContentGuard';
import { chatCompletion, type LlmChatMessage } from '../utils/api';

export function toCodeSelection(editor: vscode.TextEditor): CodeSelection {
  const selection = editor.selection;
  return {
    document: {
      path: editor.document.uri.fsPath,
      languageId: editor.document.languageId,
      text: editor.document.getText(),
    },
    range: toCodeRange(selection),
    isEmpty: selection.isEmpty,
    text: editor.document.getText(selection.isEmpty ? undefined : selection),
  };
}

function toCodeRange(range: vscode.Range): CodeRange {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}

function toVscodeSeverity(severity: CodeDiagnosticSeverity): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    case 'hint':
      return vscode.DiagnosticSeverity.Hint;
    case 'info':
      return vscode.DiagnosticSeverity.Information;
  }
}

export class AgiDiagnosticsProvider
  implements vscode.Disposable, CodeEditorSession, CodeDiagnosticsSession
{
  readonly ide = 'vscode' as const;
  private readonly _diagnosticCollection: vscode.DiagnosticCollection;
  /**
   * The URI each reviewed path came in as. An untitled or virtual buffer has no
   * file: URI, so recovering one from the path would name a document that is not open.
   */
  private readonly _reviewedUris = new Map<string, vscode.Uri>();

  constructor() {
    this._diagnosticCollection = vscode.languages.createDiagnosticCollection('agiWorkforce');
  }

  get collection(): vscode.DiagnosticCollection {
    return this._diagnosticCollection;
  }

  activeSelection(): CodeSelection | null {
    const editor = vscode.window.activeTextEditor;
    return editor === undefined ? null : toCodeSelection(editor);
  }

  publishDiagnostics(path: string, diagnostics: readonly CodeDiagnostic[]): void {
    const uri = this._uriForPath(path);
    this._diagnosticCollection.delete(uri);
    if (diagnostics.length === 0) return;
    this._diagnosticCollection.set(
      uri,
      diagnostics.map((diagnostic) => {
        const range = new vscode.Range(
          diagnostic.range.start.line,
          diagnostic.range.start.character,
          diagnostic.range.end.line,
          diagnostic.range.end.character,
        );
        const mapped = new vscode.Diagnostic(
          range,
          diagnostic.message,
          toVscodeSeverity(diagnostic.severity),
        );
        mapped.source = diagnostic.source;
        return mapped;
      }),
    );
  }

  clearDiagnostics(path?: string): void {
    if (path !== undefined) {
      this._diagnosticCollection.delete(this._uriForPath(path));
      this._reviewedUris.delete(path);
    } else {
      this._diagnosticCollection.clear();
      this._reviewedUris.clear();
    }
  }

  private _uriForPath(path: string): vscode.Uri {
    return this._reviewedUris.get(path) ?? vscode.Uri.file(path);
  }

  async reviewCode(
    editor: vscode.TextEditor,
    secrets: vscode.SecretStorage,
    cancellationToken: vscode.CancellationToken,
  ): Promise<ReviewResult> {
    const refusal = describeOutboundRefusal(editor.document);
    if (refusal !== null) {
      return { diagnosticCount: 0, summary: refusal };
    }

    const selection = toCodeSelection(editor);
    if (selection.text.trim() === '') {
      return { diagnosticCount: 0, summary: 'No code to review.' };
    }

    const prompt = buildCodeReviewPrompt(selection);
    const messages: LlmChatMessage[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ];

    const response = await chatCompletion(secrets, messages, cancellationToken);
    const { diagnostics, summary } = parseCodeReview(response, selection);

    this._reviewedUris.set(selection.document.path, editor.document.uri);
    this.publishDiagnostics(selection.document.path, diagnostics);

    return { diagnosticCount: diagnostics.length, summary };
  }

  clear(uri?: vscode.Uri): void {
    if (uri !== undefined) {
      this._diagnosticCollection.delete(uri);
      this._reviewedUris.delete(uri.fsPath);
    } else {
      this.clearDiagnostics();
    }
  }

  dispose(): void {
    this._diagnosticCollection.dispose();
  }
}

export interface ReviewResult {
  diagnosticCount: number;
  summary: string;
}
