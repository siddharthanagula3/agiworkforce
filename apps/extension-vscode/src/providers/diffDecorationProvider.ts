import { PRODUCT_NAMES } from '@agiworkforce/types';
import * as vscode from 'vscode';

const PROPOSAL_SCHEME = 'agi-diff-proposal';
const STALE_DIFF_MESSAGE = `${PRODUCT_NAMES.code}: this file changed since the edit was proposed, so nothing was applied. Ask again to get a fresh edit.`;

export interface DiffSession {
  readonly id: string;
  readonly uri: vscode.Uri;
  readonly range: vscode.Range;
  readonly originalText: string;
  /// The document version at propose time. An insertion has no original text to
  /// compare, so its only evidence that the insertion point still means what it
  /// meant is that nothing has changed at all.
  readonly documentVersion?: number;
  readonly newText: string;
  readonly decorations: vscode.DecorationOptions[];
  readonly filePath?: string;
  readonly batchId?: string;
  readonly confidence?: 'high' | 'medium' | 'low';
}

function comparePositions(a: vscode.Position, b: vscode.Position): number {
  return a.line !== b.line ? a.line - b.line : a.character - b.character;
}

function rangesConflict(a: vscode.Range, b: vscode.Range): boolean {
  const reachesOther =
    comparePositions(a.start, b.end) <= 0 && comparePositions(b.start, a.end) <= 0;
  if (!reachesOther) return false;
  if (a.isEmpty || b.isEmpty) return true;
  return comparePositions(a.start, b.end) < 0 && comparePositions(b.start, a.end) < 0;
}

function isStaleIn(session: DiffSession, document: vscode.TextDocument): boolean {
  if (session.range.isEmpty) {
    const version = (document as { version?: number }).version;
    return (
      version !== undefined &&
      session.documentVersion !== undefined &&
      version !== session.documentVersion
    );
  }
  return document.getText(session.range) !== session.originalText;
}

interface BulkAcceptOutcome {
  stale: number;
  conflicting: number;
  failed: number;
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

function proposalUri(session: Pick<DiffSession, 'id' | 'uri'>): vscode.Uri {
  return session.uri.with({ scheme: PROPOSAL_SCHEME, query: session.id });
}

function sessionDecorations(
  session: Pick<DiffSession, 'range'>,
  document: Pick<vscode.TextDocument, 'lineCount' | 'lineAt'>,
): {
  replaced: vscode.DecorationOptions[];
  insertions: vscode.DecorationOptions[];
  all: vscode.DecorationOptions[];
} {
  const lastLine = Math.max(0, document.lineCount - 1);
  const firstLine = Math.min(session.range.start.line, lastLine);
  if (session.range.isEmpty) {
    const insertions = [
      {
        range: new vscode.Range(firstLine, 0, firstLine, 0),
        hoverMessage: new vscode.MarkdownString(
          'Proposed code is inserted here. The diff beside this editor shows it.',
        ),
      },
    ];
    return { replaced: [], insertions, all: insertions };
  }
  const endsAtLineStart =
    session.range.end.character === 0 && session.range.end.line > session.range.start.line;
  const finalLine = Math.min(session.range.end.line - (endsAtLineStart ? 1 : 0), lastLine);
  const replaced: vscode.DecorationOptions[] = [];
  for (let line = firstLine; line <= finalLine; line += 1) {
    replaced.push({
      range: new vscode.Range(line, 0, line, document.lineAt(line).text.length),
      hoverMessage: new vscode.MarkdownString(
        'Replaced by the proposed code. The diff beside this editor shows the new text.',
      ),
    });
  }
  return { replaced, insertions: [], all: replaced };
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

      const summary = computeDiffSummary(session.originalText, session.newText);
      const fileName = session.filePath ?? vscode.workspace.asRelativePath(session.uri);
      const summaryParts: string[] = [];
      if (summary.added > 0) summaryParts.push(`+${summary.added}`);
      if (summary.removed > 0) summaryParts.push(`-${summary.removed}`);
      if (summary.modified > 0) summaryParts.push(`~${summary.modified}`);
      const summaryText = summaryParts.join(', ');

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
        new vscode.CodeLens(r, {
          title: `$(diff) Changes: ${summaryText} in ${fileName}${confidenceText}`,
          tooltip: `${summary.added} added, ${summary.removed} removed, ${summary.modified} modified lines`,
          command: '',
        }),
        new vscode.CodeLens(r, {
          title: '$(check) Accept',
          tooltip: 'Apply this suggestion (Ctrl+Shift+A)',
          command: 'agi-workforce.acceptDiff',
          arguments: [session.id],
        }),
        new vscode.CodeLens(r, {
          title: '$(close) Reject',
          tooltip: 'Dismiss this suggestion (Ctrl+Shift+R)',
          command: 'agi-workforce.rejectDiff',
          arguments: [session.id],
        }),
        new vscode.CodeLens(r, {
          title: '$(check-all) Accept All in File',
          tooltip: 'Apply all suggestions in this file',
          command: 'agi-workforce.acceptAllDiffs',
          arguments: [document.uri],
        }),
        new vscode.CodeLens(r, {
          title: '$(close-all) Reject All in File',
          tooltip: 'Dismiss all suggestions in this file',
          command: 'agi-workforce.rejectAllDiffs',
          arguments: [document.uri],
        }),
      );

      if (session.batchId !== undefined) {
        batchIds.add(session.batchId);
      }
    }

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
  private readonly _replacedDecoration: vscode.TextEditorDecorationType;
  private readonly _insertionGutter: vscode.TextEditorDecorationType;
  private readonly _activeDiffs = new Map<string, DiffSession>();
  private _rejectedStash: DiffSession[] = [];
  private _nextId = 0;
  readonly codeLensProvider: DiffCodeLensProvider;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor() {
    this._replacedDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.modifiedForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Full,
      before: { contentText: ' ', backgroundColor: '#f59e0b', width: '2px', margin: '0 4px 0 0' },
    });

    this._insertionGutter = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      before: {
        contentText: '+',
        color: '#22c55e',
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
        this._syncCursorContext();
      }),
      vscode.window.onDidChangeTextEditorSelection(() => this._syncCursorContext()),
      vscode.workspace.onDidCloseTextDocument((doc) => this._clearSessionsForUri(doc.uri)),
      vscode.workspace.registerTextDocumentContentProvider(PROPOSAL_SCHEME, {
        provideTextDocumentContent: (uri) => this._proposedDocumentText(uri),
      }),
    );
  }

  private _diffUnderCursor = false;

  private _syncCursorContext(): void {
    const underCursor = this.currentSession() !== undefined;
    if (underCursor === this._diffUnderCursor) return;
    this._diffUnderCursor = underCursor;
    void vscode.commands.executeCommand('setContext', 'agi-workforce.diffUnderCursor', underCursor);
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
    const documentVersion = (editor.document as { version?: number }).version;
    const session: DiffSession = {
      id,
      uri: editor.document.uri,
      range,
      originalText,
      newText,
      ...(documentVersion === undefined ? {} : { documentVersion }),
      decorations: sessionDecorations({ range }, editor.document).all,
      ...(options?.filePath !== undefined ? { filePath: options.filePath } : {}),
      ...(options?.batchId !== undefined ? { batchId: options.batchId } : {}),
      ...(options?.confidence !== undefined ? { confidence: options.confidence } : {}),
    };

    this._activeDiffs.set(id, session);
    this._applyDecorationsToEditor(editor);
    this.codeLensProvider.refresh(this._activeDiffs);
    void vscode.commands.executeCommand('setContext', 'agi-workforce.hasDiff', true);
    this._syncCursorContext();
    void vscode.commands.executeCommand(
      'vscode.diff',
      session.uri,
      proposalUri(session),
      `${session.filePath ?? vscode.workspace.asRelativePath(session.uri)}: proposed change`,
      { preview: true, preserveFocus: true, viewColumn: vscode.ViewColumn.Beside },
    );
    return session;
  }

  private async _proposedDocumentText(uri: vscode.Uri): Promise<string> {
    const session = this._activeDiffs.get(uri.query);
    if (session === undefined) return '';
    const document = await vscode.workspace.openTextDocument(session.uri);
    const text = document.getText();
    return (
      text.slice(0, document.offsetAt(session.range.start)) +
      session.newText +
      text.slice(document.offsetAt(session.range.end))
    );
  }

  private async _closeProposalTabs(sessions: readonly DiffSession[]): Promise<void> {
    const proposals = new Set(sessions.map((session) => proposalUri(session).toString()));
    const tabs = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .filter(
        (tab) =>
          tab.input instanceof vscode.TabInputTextDiff &&
          proposals.has(tab.input.modified.toString()),
      );
    if (tabs.length > 0) await vscode.window.tabGroups.close(tabs);
  }

  /// Whether the text this edit was written against is still the text on screen.
  ///
  /// `applyEdit` answers a different question: it succeeds whenever the range is
  /// structurally valid, so a human edit made between propose and Accept was
  /// replaced without a word. Comparing against the captured original also
  /// catches an edit earlier in the file, which shifts the range onto lines the
  /// agent never saw.
  private async _isStale(session: DiffSession): Promise<boolean> {
    try {
      const document = await vscode.workspace.openTextDocument(session.uri);
      return isStaleIn(session, document);
    } catch {
      return true;
    }
  }

  async acceptDiff(sessionId: string, options?: { quiet?: boolean }): Promise<boolean> {
    const session = this._activeDiffs.get(sessionId);
    if (session === undefined) return false;

    if (await this._isStale(session)) {
      if (options?.quiet !== true) {
        vscode.window.showWarningMessage(STALE_DIFF_MESSAGE);
      }
      return false;
    }

    const wsEdit = new vscode.WorkspaceEdit();
    wsEdit.replace(session.uri, session.range, session.newText);
    const applied = await vscode.workspace.applyEdit(wsEdit);

    if (applied) {
      this._removeSession(sessionId);
    } else {
      vscode.window.showWarningMessage(
        `${PRODUCT_NAMES.code}: Could not apply diff, document may have changed.`,
      );
    }
    return applied;
  }

  rejectDiff(sessionId: string): void {
    const session = this._activeDiffs.get(sessionId);
    if (session === undefined) return;
    this._stashRejected([session]);
    this._removeSession(sessionId);
  }

  async acceptAll(uri: vscode.Uri): Promise<void> {
    await this._acceptSessions(this.sessionsForUri(uri));
  }

  rejectAll(uri: vscode.Uri): void {
    this._rejectSessions(this.sessionsForUri(uri));
  }

  async acceptBatch(batchId: string): Promise<void> {
    await this._acceptSessions(this.sessionsForBatch(batchId));
  }

  rejectBatch(batchId: string): void {
    this._rejectSessions(this.sessionsForBatch(batchId));
  }

  sessionsForBatch(batchId: string): DiffSession[] {
    return [...this._activeDiffs.values()].filter((s) => s.batchId === batchId);
  }

  sessionsForUri(uri: vscode.Uri): DiffSession[] {
    const uriStr = uri.toString();
    return [...this._activeDiffs.values()].filter((s) => s.uri.toString() === uriStr);
  }

  allSessions(): DiffSession[] {
    return [...this._activeDiffs.values()];
  }

  get restorableCount(): number {
    return this._rejectedStash.length;
  }

  restoreRejected(): DiffSession[] {
    const restored = this._rejectedStash.filter((session) => !this._activeDiffs.has(session.id));
    this._rejectedStash = [];
    if (restored.length === 0) return [];
    for (const session of restored) {
      this._activeDiffs.set(session.id, session);
    }
    for (const editor of vscode.window.visibleTextEditors) {
      this._applyDecorationsToEditor(editor);
    }
    this.codeLensProvider.refresh(this._activeDiffs);
    void vscode.commands.executeCommand('setContext', 'agi-workforce.hasDiff', true);
    this._syncCursorContext();
    return restored;
  }

  currentSession(): DiffSession | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) return undefined;
    const sessions = this.sessionsForUri(editor.document.uri);
    if (sessions.length === 0) return undefined;

    const cursorLine = editor.selection.active.line;
    return sessions.find(
      (session) =>
        session.range.start.line <= cursorLine &&
        cursorLine <= Math.max(session.range.start.line, session.range.end.line),
    );
  }

  async acceptCurrentDiff(): Promise<boolean> {
    const closest = this.currentSession();
    if (closest === undefined) return false;
    return this.acceptDiff(closest.id);
  }

  rejectCurrentDiff(): boolean {
    const closest = this.currentSession();
    if (closest === undefined) return false;
    this.rejectDiff(closest.id);
    return true;
  }

  async acceptAllGlobal(): Promise<void> {
    await this._acceptSessions(this.allSessions());
  }

  rejectAllGlobal(): void {
    this._rejectSessions(this.allSessions());
  }

  get sessionCount(): number {
    return this._activeDiffs.size;
  }

  getSession(sessionId: string): DiffSession | undefined {
    return this._activeDiffs.get(sessionId);
  }

  private async _acceptSessions(sessions: readonly DiffSession[]): Promise<void> {
    const byUri = new Map<string, DiffSession[]>();
    for (const session of sessions) {
      const key = session.uri.toString();
      const existing = byUri.get(key) ?? [];
      existing.push(session);
      byUri.set(key, existing);
    }
    const total: BulkAcceptOutcome = { stale: 0, conflicting: 0, failed: 0 };
    for (const uriSessions of byUri.values()) {
      const outcome = await this._acceptDocumentSessions(uriSessions);
      total.stale += outcome.stale;
      total.conflicting += outcome.conflicting;
      total.failed += outcome.failed;
    }
    if (total.stale > 0) {
      vscode.window.showWarningMessage(
        total.stale === 1
          ? STALE_DIFF_MESSAGE
          : `${PRODUCT_NAMES.code}: ${total.stale} edits were not applied because those files changed since they were proposed. Ask again to get fresh edits.`,
      );
    }
    if (total.conflicting > 0) {
      vscode.window.showWarningMessage(
        `${PRODUCT_NAMES.code}: ${total.conflicting} ${total.conflicting === 1 ? 'edit was' : 'edits were'} not applied because ${total.conflicting === 1 ? 'it overlaps' : 'they overlap'} another edit in the same place. Accept ${total.conflicting === 1 ? 'it' : 'them'} one at a time.`,
      );
    }
    if (total.failed > 0) {
      vscode.window.showWarningMessage(
        `${PRODUCT_NAMES.code}: ${total.failed} ${total.failed === 1 ? 'edit' : 'edits'} could not be applied and ${total.failed === 1 ? 'is' : 'are'} still waiting for review.`,
      );
    }
  }

  private async _acceptDocumentSessions(
    uriSessions: readonly DiffSession[],
  ): Promise<BulkAcceptOutcome> {
    const outcome: BulkAcceptOutcome = { stale: 0, conflicting: 0, failed: 0 };
    const ordered = [...uriSessions].sort((a, b) => comparePositions(b.range.start, a.range.start));
    let document: vscode.TextDocument;
    try {
      document = await vscode.workspace.openTextDocument(ordered[0]!.uri);
    } catch {
      outcome.stale = ordered.length;
      return outcome;
    }

    const wsEdit = new vscode.WorkspaceEdit();
    const accepted: DiffSession[] = [];
    for (const session of ordered) {
      if (!this._activeDiffs.has(session.id)) continue;
      if (isStaleIn(session, document)) {
        outcome.stale += 1;
      } else if (accepted.some((other) => rangesConflict(other.range, session.range))) {
        outcome.conflicting += 1;
      } else {
        wsEdit.replace(session.uri, session.range, session.newText);
        accepted.push(session);
      }
    }
    if (accepted.length === 0) return outcome;

    if (await vscode.workspace.applyEdit(wsEdit)) {
      for (const session of accepted) this._removeSession(session.id);
    } else {
      outcome.failed = accepted.length;
    }
    return outcome;
  }

  private _rejectSessions(sessions: readonly DiffSession[]): void {
    if (sessions.length === 0) return;
    this._stashRejected(sessions);
    for (const session of sessions) {
      this._removeSession(session.id);
    }
  }

  private _stashRejected(sessions: readonly DiffSession[]): void {
    this._rejectedStash = [...sessions];
  }

  private _removeSession(sessionId: string): void {
    const session = this._activeDiffs.get(sessionId);
    this._activeDiffs.delete(sessionId);
    if (session !== undefined) void this._closeProposalTabs([session]).catch(() => undefined);
    for (const editor of vscode.window.visibleTextEditors) {
      this._applyDecorationsToEditor(editor);
    }
    this.codeLensProvider.refresh(this._activeDiffs);
    if (this._activeDiffs.size === 0) {
      void vscode.commands.executeCommand('setContext', 'agi-workforce.hasDiff', false);
    }
    this._syncCursorContext();
  }

  private _clearSessionsForUri(uri: vscode.Uri): void {
    const uriStr = uri.toString();
    const cleared: DiffSession[] = [];
    for (const [id, session] of this._activeDiffs) {
      if (session.uri.toString() !== uriStr) continue;
      this._activeDiffs.delete(id);
      cleared.push(session);
    }
    if (cleared.length > 0) void this._closeProposalTabs(cleared).catch(() => undefined);
    this._rejectedStash = this._rejectedStash.filter(
      (session) => session.uri.toString() !== uriStr,
    );
    this.codeLensProvider.refresh(this._activeDiffs);
    if (this._activeDiffs.size === 0) {
      void vscode.commands.executeCommand('setContext', 'agi-workforce.hasDiff', false);
    }
    this._syncCursorContext();
  }

  private _applyDecorationsToEditor(editor: vscode.TextEditor): void {
    const replaced: vscode.DecorationOptions[] = [];
    const insertions: vscode.DecorationOptions[] = [];
    for (const session of this._activeDiffs.values()) {
      if (session.uri.toString() !== editor.document.uri.toString()) continue;
      const decorations = sessionDecorations(session, editor.document);
      replaced.push(...decorations.replaced);
      insertions.push(...decorations.insertions);
    }
    editor.setDecorations(this._replacedDecoration, replaced);
    editor.setDecorations(this._insertionGutter, insertions);
  }

  dispose(): void {
    this._replacedDecoration.dispose();
    this._insertionGutter.dispose();
    for (const d of this._disposables) d.dispose();
    this._activeDiffs.clear();
    this._rejectedStash = [];
  }
}
