/**
 * diffDecorationProvider.ts — Inline diff decorations with accept/reject CodeLens
 *
 * Wave 3 enhancements:
 * - Line-level gutter decorations showing + (added) and - (removed) clearly
 * - Summary header above each diff: "Changes: +X lines, -Y lines in filename"
 * - Keyboard shortcuts for accept (Ctrl+Shift+A) and reject (Ctrl+Shift+R)
 * - Accept All / Reject All commands for multi-file patch batches
 * - Compatibility with patch:path format from Wave 2
 */

import * as vscode from 'vscode';

export interface DiffSession {
  readonly id: string;
  readonly uri: vscode.Uri;
  readonly range: vscode.Range;
  readonly originalText: string;
  readonly newText: string;
  readonly decorations: vscode.DecorationOptions[];
  /** File path (relative) associated with this diff, for display purposes. */
  readonly filePath?: string;
  /** Patch batch ID this diff belongs to, if any. */
  readonly batchId?: string;
  /** Confidence level from patch engine. */
  readonly confidence?: 'high' | 'medium' | 'low';
}

interface DiffLine {
  kind: 'added' | 'removed' | 'modified';
  editorLine: number;
}

interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
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

function computeDiffSummary(originalText: string, newText: string): DiffSummary {
  const diffs = diffLines(originalText, newText);
  return {
    added: diffs.filter((d) => d.kind === 'added').length,
    removed: diffs.filter((d) => d.kind === 'removed').length,
    modified: diffs.filter((d) => d.kind === 'modified').length,
  };
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
    const batchIds = new Set<string>();

    for (const session of this._sessions.values()) {
      if (session.uri.toString() !== document.uri.toString()) continue;

      const r = new vscode.Range(session.range.start.line, 0, session.range.start.line, 0);

      // Summary header showing change counts
      const summary = computeDiffSummary(session.originalText, session.newText);
      const fileName = session.filePath ?? vscode.workspace.asRelativePath(session.uri);
      const summaryParts: string[] = [];
      if (summary.added > 0) summaryParts.push(`+${summary.added}`);
      if (summary.removed > 0) summaryParts.push(`-${summary.removed}`);
      if (summary.modified > 0) summaryParts.push(`~${summary.modified}`);
      const summaryText = summaryParts.join(', ');

      // Confidence indicator
      const confidenceLabel =
        session.confidence === 'high'
          ? '$(pass-filled)'
          : session.confidence === 'medium'
            ? '$(warning)'
            : session.confidence === 'low'
              ? '$(error)'
              : '';
      const confidenceText = confidenceLabel !== '' ? ` ${confidenceLabel}` : '';

      lenses.push(
        // Summary header
        new vscode.CodeLens(r, {
          title: `$(diff) Changes: ${summaryText} in ${fileName}${confidenceText}`,
          tooltip: `${summary.added} added, ${summary.removed} removed, ${summary.modified} modified lines`,
          command: '',
        }),
        // Accept single diff (Ctrl+Shift+A)
        new vscode.CodeLens(r, {
          title: '$(check) Accept',
          tooltip: 'Apply this suggestion (Ctrl+Shift+A)',
          command: 'agi-workforce.acceptDiff',
          arguments: [session.id],
        }),
        // Reject single diff (Ctrl+Shift+R)
        new vscode.CodeLens(r, {
          title: '$(close) Reject',
          tooltip: 'Dismiss this suggestion (Ctrl+Shift+R)',
          command: 'agi-workforce.rejectDiff',
          arguments: [session.id],
        }),
        // Accept all in this file
        new vscode.CodeLens(r, {
          title: '$(check-all) Accept All in File',
          tooltip: 'Apply all suggestions in this file',
          command: 'agi-workforce.acceptAllDiffs',
          arguments: [document.uri],
        }),
        // Reject all in this file
        new vscode.CodeLens(r, {
          title: '$(close-all) Reject All in File',
          tooltip: 'Dismiss all suggestions in this file',
          command: 'agi-workforce.rejectAllDiffs',
          arguments: [document.uri],
        }),
      );

      // Track batch IDs for batch-level actions
      if (session.batchId !== undefined) {
        batchIds.add(session.batchId);
      }
    }

    // Add batch-level Accept All / Reject All if there are multiple batch sessions
    for (const batchId of batchIds) {
      const batchSessions = [...this._sessions.values()].filter(
        (s) => s.batchId === batchId && s.uri.toString() === document.uri.toString(),
      );
      if (batchSessions.length > 1) {
        const firstSession = batchSessions[0]!;
        const r = new vscode.Range(
          firstSession.range.start.line,
          0,
          firstSession.range.start.line,
          0,
        );
        lenses.push(
          new vscode.CodeLens(r, {
            title: `$(checklist) Accept Entire Batch (${batchSessions.length} changes)`,
            tooltip: `Apply all ${batchSessions.length} patches in batch ${batchId}`,
            command: 'agi-workforce.acceptBatch',
            arguments: [batchId],
          }),
          new vscode.CodeLens(r, {
            title: `$(trash) Reject Entire Batch`,
            tooltip: `Dismiss all patches in batch ${batchId}`,
            command: 'agi-workforce.rejectBatch',
            arguments: [batchId],
          }),
        );
      }
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
  private readonly _addedGutter: vscode.TextEditorDecorationType;
  private readonly _removedGutter: vscode.TextEditorDecorationType;
  private readonly _activeDiffs = new Map<string, DiffSession>();
  private _nextId = 0;
  readonly codeLensProvider: DiffCodeLensProvider;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor() {
    // v3 palette: success=#22c55e (dark), danger=#ef4444 (dark), warning=#f59e0b (dark)
    this._addedDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Full,
      before: { contentText: ' ', backgroundColor: '#22c55e', width: '2px', margin: '0 4px 0 0' },
    });

    this._removedDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.deletedForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Full,
      textDecoration: 'line-through rgba(239, 68, 68, 0.5)',
      before: { contentText: ' ', backgroundColor: '#ef4444', width: '2px', margin: '0 4px 0 0' },
    });

    this._modifiedDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('diffEditor.unchangedRegionBackground'),
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.modifiedForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Full,
      before: { contentText: ' ', backgroundColor: '#f59e0b', width: '2px', margin: '0 4px 0 0' },
    });

    // Gutter decorations with clear + / - indicators (v3 success/danger palette)
    this._addedGutter = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      before: {
        contentText: '+',
        color: '#22c55e',
        fontWeight: 'bold',
        width: '1ch',
        margin: '0 2px 0 0',
      },
    });

    this._removedGutter = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      before: {
        contentText: '-',
        color: '#ef4444',
        fontWeight: 'bold',
        width: '1ch',
        margin: '0 2px 0 0',
      },
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
    options?: {
      filePath?: string;
      batchId?: string;
      confidence?: 'high' | 'medium' | 'low';
    },
  ): DiffSession {
    const id = `diff-${++this._nextId}`;
    const diffResult = diffLines(originalText, newText);
    const addedOpts: vscode.DecorationOptions[] = [];
    const removedOpts: vscode.DecorationOptions[] = [];
    const modifiedOpts: vscode.DecorationOptions[] = [];
    const addedGutterOpts: vscode.DecorationOptions[] = [];
    const removedGutterOpts: vscode.DecorationOptions[] = [];
    const lastLine = Math.max(0, editor.document.lineCount - 1);

    for (const diff of diffResult) {
      const line = Math.min(diff.editorLine, lastLine);
      const docLine = editor.document.lineAt(line);
      const opt: vscode.DecorationOptions = {
        range: new vscode.Range(line, 0, line, docLine.text.length),
      };
      if (diff.kind === 'added') {
        addedOpts.push(opt);
        addedGutterOpts.push({
          range: new vscode.Range(line, 0, line, 0),
          hoverMessage: new vscode.MarkdownString('**+** Line added'),
        });
      } else if (diff.kind === 'removed') {
        removedOpts.push(opt);
        removedGutterOpts.push({
          range: new vscode.Range(line, 0, line, 0),
          hoverMessage: new vscode.MarkdownString('**-** Line removed'),
        });
      } else {
        modifiedOpts.push(opt);
      }
    }

    const sessionBase: Omit<DiffSession, 'filePath' | 'batchId' | 'confidence'> = {
      id,
      uri: editor.document.uri,
      range,
      originalText,
      newText,
      decorations: [...addedOpts, ...removedOpts, ...modifiedOpts],
    };
    const session: DiffSession = {
      ...sessionBase,
      ...(options?.filePath !== undefined ? { filePath: options.filePath } : {}),
      ...(options?.batchId !== undefined ? { batchId: options.batchId } : {}),
      ...(options?.confidence !== undefined ? { confidence: options.confidence } : {}),
    };

    this._activeDiffs.set(id, session);
    editor.setDecorations(this._addedDecoration, addedOpts);
    editor.setDecorations(this._removedDecoration, removedOpts);
    editor.setDecorations(this._modifiedDecoration, modifiedOpts);
    editor.setDecorations(this._addedGutter, addedGutterOpts);
    editor.setDecorations(this._removedGutter, removedGutterOpts);
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

  /** Accept all diffs belonging to a specific batch across all files. */
  async acceptBatch(batchId: string): Promise<void> {
    const batchSessions = [...this._activeDiffs.values()].filter((s) => s.batchId === batchId);
    // Group by URI, process each file bottom-to-top
    const byUri = new Map<string, DiffSession[]>();
    for (const s of batchSessions) {
      const key = s.uri.toString();
      const existing = byUri.get(key) ?? [];
      existing.push(s);
      byUri.set(key, existing);
    }
    for (const sessions of byUri.values()) {
      sessions.sort((a, b) => b.range.start.line - a.range.start.line);
      for (const session of sessions) {
        await this.acceptDiff(session.id);
      }
    }
  }

  /** Reject all diffs belonging to a specific batch across all files. */
  rejectBatch(batchId: string): void {
    const batchSessions = [...this._activeDiffs.values()].filter((s) => s.batchId === batchId);
    for (const session of batchSessions) {
      this._removeSession(session.id);
    }
  }

  /** Accept the first active diff in the currently focused editor (for keyboard shortcut). */
  async acceptCurrentDiff(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) return;
    const sessions = this._sessionsForUri(editor.document.uri);
    if (sessions.length === 0) return;

    // Find the diff closest to the cursor position
    const cursorLine = editor.selection.active.line;
    let closest: DiffSession | undefined;
    let minDist = Infinity;
    for (const s of sessions) {
      const dist = Math.abs(s.range.start.line - cursorLine);
      if (dist < minDist) {
        minDist = dist;
        closest = s;
      }
    }
    if (closest !== undefined) {
      await this.acceptDiff(closest.id);
    }
  }

  /** Reject the first active diff in the currently focused editor (for keyboard shortcut). */
  rejectCurrentDiff(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) return;
    const sessions = this._sessionsForUri(editor.document.uri);
    if (sessions.length === 0) return;

    const cursorLine = editor.selection.active.line;
    let closest: DiffSession | undefined;
    let minDist = Infinity;
    for (const s of sessions) {
      const dist = Math.abs(s.range.start.line - cursorLine);
      if (dist < minDist) {
        minDist = dist;
        closest = s;
      }
    }
    if (closest !== undefined) {
      this.rejectDiff(closest.id);
    }
  }

  /** Accept all diffs across all open files. */
  async acceptAllGlobal(): Promise<void> {
    const allUris = new Set([...this._activeDiffs.values()].map((s) => s.uri.toString()));
    for (const uriStr of allUris) {
      const uri = [...this._activeDiffs.values()].find((s) => s.uri.toString() === uriStr)?.uri;
      if (uri !== undefined) {
        await this.acceptAll(uri);
      }
    }
  }

  /** Reject all diffs across all open files. */
  rejectAllGlobal(): void {
    const sessionIds = [...this._activeDiffs.keys()];
    for (const id of sessionIds) {
      this._removeSession(id);
    }
  }

  get sessionCount(): number {
    return this._activeDiffs.size;
  }

  getSession(sessionId: string): DiffSession | undefined {
    return this._activeDiffs.get(sessionId);
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
    const addedGutterOpts: vscode.DecorationOptions[] = [];
    const removedGutterOpts: vscode.DecorationOptions[] = [];
    const lastLine = Math.max(0, editor.document.lineCount - 1);

    for (const session of this._activeDiffs.values()) {
      if (session.uri.toString() !== editor.document.uri.toString()) continue;
      for (const diff of diffLines(session.originalText, session.newText)) {
        const line = Math.min(diff.editorLine, lastLine);
        const docLine = editor.document.lineAt(line);
        const opt: vscode.DecorationOptions = {
          range: new vscode.Range(line, 0, line, docLine.text.length),
        };
        if (diff.kind === 'added') {
          addedOpts.push(opt);
          addedGutterOpts.push({
            range: new vscode.Range(line, 0, line, 0),
            hoverMessage: new vscode.MarkdownString('**+** Line added'),
          });
        } else if (diff.kind === 'removed') {
          removedOpts.push(opt);
          removedGutterOpts.push({
            range: new vscode.Range(line, 0, line, 0),
            hoverMessage: new vscode.MarkdownString('**-** Line removed'),
          });
        } else {
          modifiedOpts.push(opt);
        }
      }
    }

    editor.setDecorations(this._addedDecoration, addedOpts);
    editor.setDecorations(this._removedDecoration, removedOpts);
    editor.setDecorations(this._modifiedDecoration, modifiedOpts);
    editor.setDecorations(this._addedGutter, addedGutterOpts);
    editor.setDecorations(this._removedGutter, removedGutterOpts);
  }

  dispose(): void {
    this._addedDecoration.dispose();
    this._removedDecoration.dispose();
    this._modifiedDecoration.dispose();
    this._addedGutter.dispose();
    this._removedGutter.dispose();
    for (const d of this._disposables) d.dispose();
    this._activeDiffs.clear();
  }
}
