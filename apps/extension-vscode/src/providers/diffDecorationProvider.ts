/**
 * diffDecorationProvider.ts — Inline diff decorations with accept/reject CodeLens
 */

import * as vscode from 'vscode';

export interface DiffSession {
  readonly id: string;
  readonly uri: vscode.Uri;
  readonly range: vscode.Range;
  readonly originalText: string;
  readonly newText: string;
  readonly decorations: vscode.DecorationOptions[];
}

interface DiffLine {
  kind: 'added' | 'removed' | 'modified';
  editorLine: number;
}

function diffLines(originalText: string, newText: string): DiffLine[] {
  const origLines = originalText.split('\n');
  const newLines = newText.split('\n');
  const results: DiffLine[] = [];
  const maxLen = Math.max(origLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    const orig = origLines[i];
    const next = newLines[i];
    if (orig === undefined) results.push({ kind: 'added', editorLine: i });
    else if (next === undefined) results.push({ kind: 'removed', editorLine: i });
    else if (orig !== next) results.push({ kind: 'modified', editorLine: i });
  }
  return results;
}

export class DiffCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  private _sessions: ReadonlyMap<string, DiffSession> = new Map();

  refresh(sessions: ReadonlyMap<string, DiffSession>): void {
    this._sessions = sessions;
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    for (const session of this._sessions.values()) {
      if (session.uri.toString() !== document.uri.toString()) continue;
      const r = new vscode.Range(session.range.start.line, 0, session.range.start.line, 0);
      lenses.push(
        new vscode.CodeLens(r, {
          title: '$(check) Accept',
          tooltip: 'Apply this suggestion',
          command: 'agi-workforce.acceptDiff',
          arguments: [session.id],
        }),
        new vscode.CodeLens(r, {
          title: '$(close) Reject',
          tooltip: 'Dismiss this suggestion',
          command: 'agi-workforce.rejectDiff',
          arguments: [session.id],
        }),
        new vscode.CodeLens(r, {
          title: '$(check-all) Accept All',
          tooltip: 'Apply all suggestions in this file',
          command: 'agi-workforce.acceptAllDiffs',
          arguments: [document.uri],
        }),
      );
    }
    return lenses;
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}

export class DiffDecorationProvider implements vscode.Disposable {
  private readonly _addedDecoration: vscode.TextEditorDecorationType;
  private readonly _removedDecoration: vscode.TextEditorDecorationType;
  private readonly _modifiedDecoration: vscode.TextEditorDecorationType;
  private readonly _activeDiffs = new Map<string, DiffSession>();
  private _nextId = 0;
  readonly codeLensProvider: DiffCodeLensProvider;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor() {
    this._addedDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(76,175,80,0.08)',
      borderColor: 'rgba(76,175,80,0)',
      overviewRulerColor: '#4caf50',
      overviewRulerLane: vscode.OverviewRulerLane.Full,
      before: { contentText: ' ', backgroundColor: '#4caf50', width: '2px', margin: '0 4px 0 0' },
    });

    this._removedDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(244,67,54,0.08)',
      overviewRulerColor: '#f44336',
      overviewRulerLane: vscode.OverviewRulerLane.Full,
      textDecoration: 'line-through rgba(244,67,54,0.5)',
      before: { contentText: ' ', backgroundColor: '#f44336', width: '2px', margin: '0 4px 0 0' },
    });

    this._modifiedDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(255,152,0,0.06)',
      overviewRulerColor: '#ff9800',
      overviewRulerLane: vscode.OverviewRulerLane.Full,
      before: { contentText: ' ', backgroundColor: '#ff9800', width: '2px', margin: '0 4px 0 0' },
    });

    this.codeLensProvider = new DiffCodeLensProvider();
    this._disposables.push(this.codeLensProvider);

    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (e !== undefined) this._applyDecorationsToEditor(e);
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => this._clearSessionsForUri(doc.uri)),
    );
  }

  showDiff(
    editor: vscode.TextEditor,
    originalText: string,
    newText: string,
    range: vscode.Range,
  ): DiffSession {
    const id = `diff-${++this._nextId}`;
    const diffResult = diffLines(originalText, newText);
    const addedOpts: vscode.DecorationOptions[] = [];
    const removedOpts: vscode.DecorationOptions[] = [];
    const modifiedOpts: vscode.DecorationOptions[] = [];
    const lastLine = Math.max(0, editor.document.lineCount - 1);

    for (const diff of diffResult) {
      const line = Math.min(diff.editorLine, lastLine);
      const docLine = editor.document.lineAt(line);
      const opt: vscode.DecorationOptions = {
        range: new vscode.Range(line, 0, line, docLine.text.length),
      };
      if (diff.kind === 'added') addedOpts.push(opt);
      else if (diff.kind === 'removed') removedOpts.push(opt);
      else modifiedOpts.push(opt);
    }

    const session: DiffSession = {
      id,
      uri: editor.document.uri,
      range,
      originalText,
      newText,
      decorations: [...addedOpts, ...removedOpts, ...modifiedOpts],
    };

    this._activeDiffs.set(id, session);
    editor.setDecorations(this._addedDecoration, addedOpts);
    editor.setDecorations(this._removedDecoration, removedOpts);
    editor.setDecorations(this._modifiedDecoration, modifiedOpts);
    this.codeLensProvider.refresh(this._activeDiffs);
    void vscode.commands.executeCommand('setContext', 'agi-workforce.hasDiff', true);
    return session;
  }

  async acceptDiff(sessionId: string): Promise<boolean> {
    const session = this._activeDiffs.get(sessionId);
    if (session === undefined) return false;

    const wsEdit = new vscode.WorkspaceEdit();
    wsEdit.replace(session.uri, session.range, session.newText);
    const applied = await vscode.workspace.applyEdit(wsEdit);

    if (applied) {
      this._removeSession(sessionId);
    } else {
      vscode.window.showWarningMessage(
        'AGI Workforce: Could not apply diff — document may have changed.',
      );
    }
    return applied;
  }

  rejectDiff(sessionId: string): void {
    this._removeSession(sessionId);
  }

  async acceptAll(uri: vscode.Uri): Promise<void> {
    const sessions = this._sessionsForUri(uri);
    sessions.sort((a, b) => b.range.start.line - a.range.start.line);
    for (const session of sessions) {
      await this.acceptDiff(session.id);
    }
  }

  rejectAll(uri: vscode.Uri): void {
    for (const session of this._sessionsForUri(uri)) {
      this._removeSession(session.id);
    }
  }

  get sessionCount(): number {
    return this._activeDiffs.size;
  }

  private _sessionsForUri(uri: vscode.Uri): DiffSession[] {
    const uriStr = uri.toString();
    return [...this._activeDiffs.values()].filter((s) => s.uri.toString() === uriStr);
  }

  private _removeSession(sessionId: string): void {
    this._activeDiffs.delete(sessionId);
    for (const editor of vscode.window.visibleTextEditors) {
      this._applyDecorationsToEditor(editor);
    }
    this.codeLensProvider.refresh(this._activeDiffs);
    if (this._activeDiffs.size === 0) {
      void vscode.commands.executeCommand('setContext', 'agi-workforce.hasDiff', false);
    }
  }

  private _clearSessionsForUri(uri: vscode.Uri): void {
    const uriStr = uri.toString();
    for (const [id, session] of this._activeDiffs) {
      if (session.uri.toString() === uriStr) this._activeDiffs.delete(id);
    }
    this.codeLensProvider.refresh(this._activeDiffs);
  }

  private _applyDecorationsToEditor(editor: vscode.TextEditor): void {
    const addedOpts: vscode.DecorationOptions[] = [];
    const removedOpts: vscode.DecorationOptions[] = [];
    const modifiedOpts: vscode.DecorationOptions[] = [];
    const lastLine = Math.max(0, editor.document.lineCount - 1);

    for (const session of this._activeDiffs.values()) {
      if (session.uri.toString() !== editor.document.uri.toString()) continue;
      for (const diff of diffLines(session.originalText, session.newText)) {
        const line = Math.min(diff.editorLine, lastLine);
        const docLine = editor.document.lineAt(line);
        const opt: vscode.DecorationOptions = {
          range: new vscode.Range(line, 0, line, docLine.text.length),
        };
        if (diff.kind === 'added') addedOpts.push(opt);
        else if (diff.kind === 'removed') removedOpts.push(opt);
        else modifiedOpts.push(opt);
      }
    }

    editor.setDecorations(this._addedDecoration, addedOpts);
    editor.setDecorations(this._removedDecoration, removedOpts);
    editor.setDecorations(this._modifiedDecoration, modifiedOpts);
  }

  dispose(): void {
    this._addedDecoration.dispose();
    this._removedDecoration.dispose();
    this._modifiedDecoration.dispose();
    for (const d of this._disposables) d.dispose();
    this._activeDiffs.clear();
  }
}
