import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { AgiCodeActionProvider, CODE_ACTION_KINDS } from '../providers/codeActionProvider';
import { PRODUCT_NAMES } from '@agiworkforce/types';

const token = { isCancellationRequested: false } as vscode.CancellationToken;

const document = {
  uri: vscode.Uri.file('/workspace/src/app.ts'),
  languageId: 'typescript',
  lineAt: (line: number) => ({ range: new vscode.Range(line, 0, line, 40) }),
} as unknown as vscode.TextDocument;

function diagnostic(
  message: string,
  range: vscode.Range = new vscode.Range(0, 2, 0, 5),
): vscode.Diagnostic {
  return {
    message,
    range,
    severity: vscode.DiagnosticSeverity.Error,
  } as unknown as vscode.Diagnostic;
}

function actionsFor(
  range: vscode.Range | vscode.Selection,
  diagnostics: vscode.Diagnostic[] = [],
): vscode.CodeAction[] {
  return new AgiCodeActionProvider().provideCodeActions(
    document,
    range,
    { diagnostics, only: undefined, triggerKind: 1 } as unknown as vscode.CodeActionContext,
    token,
  );
}

const CARET = new vscode.Range(0, 0, 0, 0);
const SPAN = new vscode.Range(0, 0, 0, 10);
const MULTILINE = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(3, 5));
const EMPTY_SELECTION = new vscode.Selection(new vscode.Position(2, 4), new vscode.Position(2, 4));

describe('AgiCodeActionProvider', () => {
  it('offers a quick fix when the range carries diagnostics', () => {
    const actions = actionsFor(CARET, [diagnostic('error TS2304')]);

    expect(actions).toHaveLength(1);
    expect(actions[0]!.title).toBe(`Fix with ${PRODUCT_NAMES.code}`);
    expect(actions[0]!.command?.command).toBe('agi-workforce.fix');
    expect(actions[0]!.kind).toBe(vscode.CodeActionKind.QuickFix);
  });

  it('hands the quick fix the lines of the diagnostics it was offered for, so a bare caret is enough', () => {
    const actions = actionsFor(CARET, [
      diagnostic('first', new vscode.Range(4, 6, 4, 9)),
      diagnostic('second', new vscode.Range(6, 1, 7, 3)),
    ]);

    const [target] = actions[0]!.command?.arguments ?? [];
    expect(target).toMatchObject({
      start: { line: 4, character: 0 },
      end: { line: 7, character: 40 },
    });
  });

  it('attaches the reported diagnostics to the quick fix without claiming preference', () => {
    const reported = [diagnostic('unused variable')];
    const actions = actionsFor(CARET, reported);

    expect(actions[0]!.diagnostics).toEqual(reported);
    expect(actions[0]!.isPreferred).toBe(false);
  });

  it('snapshots the diagnostics instead of aliasing the context array', () => {
    const reported = [diagnostic('unused variable')];
    const actions = actionsFor(CARET, reported);

    reported.push(diagnostic('added later'));

    expect(actions[0]!.diagnostics).toHaveLength(1);
  });

  it('offers the selection actions, in menu order, when text is selected', () => {
    const actions = actionsFor(MULTILINE);

    expect(actions.map((action) => action.title)).toEqual([
      `Refactor with ${PRODUCT_NAMES.code}`,
      `Explain with ${PRODUCT_NAMES.code}`,
      `Generate Tests with ${PRODUCT_NAMES.code}`,
    ]);
    expect(actions.map((action) => action.command?.command)).toEqual([
      'agi-workforce.refactor',
      'agi-workforce.explain',
      'agi-workforce.generateTests',
    ]);
  });

  it('files the selection actions under refactor and general kinds', () => {
    const [refactor, explain, tests] = actionsFor(MULTILINE);

    expect(refactor!.kind).toBe(vscode.CodeActionKind.Refactor);
    expect(explain!.kind).toBe(vscode.CodeActionKind.Empty);
    expect(tests!.kind).toBe(vscode.CodeActionKind.Empty);
  });

  it('lists the quick fix ahead of the selection actions when both apply', () => {
    const actions = actionsFor(MULTILINE, [diagnostic('unused variable')]);

    expect(actions.map((action) => action.title)).toEqual([
      `Fix with ${PRODUCT_NAMES.code}`,
      `Refactor with ${PRODUCT_NAMES.code}`,
      `Explain with ${PRODUCT_NAMES.code}`,
      `Generate Tests with ${PRODUCT_NAMES.code}`,
    ]);
  });

  it('offers nothing for a bare caret with no diagnostics', () => {
    expect(actionsFor(CARET)).toHaveLength(0);
  });

  it('offers nothing for an empty selection', () => {
    expect(actionsFor(EMPTY_SELECTION)).toHaveLength(0);
  });

  it('treats a non-empty Range as a selection', () => {
    expect(actionsFor(SPAN)).toHaveLength(3);
  });

  it('treats a range spanning lines as a selection even at the same character', () => {
    expect(actionsFor(new vscode.Range(2, 0, 4, 0))).toHaveLength(3);
  });

  it('only emits kinds it declared to VS Code as providedCodeActionKinds', () => {
    const emitted = [
      ...actionsFor(MULTILINE, [diagnostic('unused variable')]),
      ...actionsFor(CARET, [diagnostic('unused variable')]),
    ];

    expect(emitted.length).toBeGreaterThan(0);
    for (const action of emitted) {
      expect(CODE_ACTION_KINDS).toContain(action.kind);
    }
  });
});
