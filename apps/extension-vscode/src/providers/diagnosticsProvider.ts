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
import type { DeveloperReasoningEffort } from '@agiworkforce/local-runtime-contract';
import { describeOutboundRefusal } from '../core/outboundContentGuard';
import { cloudUtilityModel, LocalModelSelectedError } from '../core/cloudModelBoundary';
import { chatCompletion, type LlmChatMessage } from '../utils/api';
import { reviewDepthInstruction } from './reviewEffort';

const STALE_REVIEW_REASON =
  'The file changed while the review ran, so its findings no longer line up. Run Code Review again.';

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
  private readonly _reviewGenerations = new Map<string, number>();
  private readonly _disposables: vscode.Disposable[] = [];

  constructor() {
    this._diagnosticCollection = vscode.languages.createDiagnosticCollection('agiWorkforce');
    this._disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length > 0)
          this._followEdit(event.document.uri, event.contentChanges);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => this._forgetFindings(document.uri)),
    );
  }

  private _followEdit(
    uri: vscode.Uri,
    changes: readonly vscode.TextDocumentContentChangeEvent[],
  ): void {
    const findings = this._diagnosticCollection.get(uri);
    if (findings === undefined || findings.length === 0) return;
    const [change] = changes;
    if (changes.length !== 1 || change === undefined) {
      this._forgetFindings(uri);
      return;
    }
    const lineDelta =
      change.text.split('\n').length - 1 - (change.range.end.line - change.range.start.line);
    const kept: vscode.Diagnostic[] = [];
    for (const finding of findings) {
      if (finding.range.end.line < change.range.start.line) {
        kept.push(finding);
      } else if (finding.range.start.line > change.range.end.line) {
        const moved = new vscode.Diagnostic(
          new vscode.Range(
            finding.range.start.line + lineDelta,
            finding.range.start.character,
            finding.range.end.line + lineDelta,
            finding.range.end.character,
          ),
          finding.message,
          finding.severity,
        );
        moved.source = finding.source;
        kept.push(moved);
      }
    }
    if (kept.length === 0) this._forgetFindings(uri);
    else this._diagnosticCollection.set(uri, kept);
  }

  private _forgetFindings(uri: vscode.Uri): void {
    if (this._diagnosticCollection.get(uri) === undefined) return;
    this._diagnosticCollection.delete(uri);
    for (const [path, reviewed] of this._reviewedUris) {
      if (reviewed.toString() === uri.toString()) this._reviewedUris.delete(path);
    }
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
    effort: DeveloperReasoningEffort,
  ): Promise<ReviewResult> {
    const selected = cloudUtilityModel();
    if (selected.route === 'local')
      throw new LocalModelSelectedError(selected.model, 'Code Review');
    const refusal = describeOutboundRefusal(editor.document);
    if (refusal !== null) {
      return { status: 'not-reviewed', reason: refusal };
    }

    const selection = toCodeSelection(editor);
    if (selection.text.trim() === '') {
      return { status: 'not-reviewed', reason: 'No code to review.' };
    }

    const reviewedDocument = editor.document;
    const reviewedVersion = reviewedDocument.version;
    const reviewKey = reviewedDocument.uri.toString();
    const generation = (this._reviewGenerations.get(reviewKey) ?? 0) + 1;
    this._reviewGenerations.set(reviewKey, generation);

    const prompt = buildCodeReviewPrompt(selection);
    const depth = reviewDepthInstruction(effort);
    const messages: LlmChatMessage[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: depth === '' ? prompt.user : `${prompt.user}\n\n${depth}` },
    ];

    const response = await chatCompletion(secrets, messages, cancellationToken);
    if (
      reviewedDocument.isClosed ||
      reviewedDocument.version !== reviewedVersion ||
      this._reviewGenerations.get(reviewKey) !== generation
    ) {
      return { status: 'not-reviewed', reason: STALE_REVIEW_REASON };
    }

    const { diagnostics, summary } = parseCodeReview(response, selection);

    this._reviewedUris.set(selection.document.path, editor.document.uri);
    this.publishDiagnostics(selection.document.path, diagnostics);

    return { status: 'completed', diagnosticCount: diagnostics.length, summary };
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
    for (const disposable of this._disposables) disposable.dispose();
    this._diagnosticCollection.dispose();
  }
}

export type ReviewResult =
  | { status: 'completed'; diagnosticCount: number; summary: string }
  | { status: 'not-reviewed'; reason: string };
