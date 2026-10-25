import { PRODUCT_NAMES } from '@agiworkforce/types';
import * as vscode from 'vscode';

export const CODE_ACTION_KINDS = [
  vscode.CodeActionKind.QuickFix,
  vscode.CodeActionKind.Refactor,
  vscode.CodeActionKind.Empty,
] as const;

export class AgiCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const hasSelection =
      range instanceof vscode.Selection
        ? !range.isEmpty
        : range.start.line !== range.end.line || range.start.character !== range.end.character;

    if (context.diagnostics.length > 0) {
      const fixAction = new vscode.CodeAction(
        `Fix with ${PRODUCT_NAMES.code}`,
        vscode.CodeActionKind.QuickFix,
      );
      fixAction.command = {
        command: 'agi-workforce.fix',
        title: `Fix with ${PRODUCT_NAMES.code}`,
        arguments: [diagnosticLines(document, context.diagnostics)],
      };
      fixAction.diagnostics = [...context.diagnostics];
      fixAction.isPreferred = false;
      actions.push(fixAction);
    }

    if (hasSelection) {
      const refactorAction = new vscode.CodeAction(
        `Refactor with ${PRODUCT_NAMES.code}`,
        vscode.CodeActionKind.Refactor,
      );
      refactorAction.command = {
        command: 'agi-workforce.refactor',
        title: `Refactor with ${PRODUCT_NAMES.code}`,
      };
      actions.push(refactorAction);

      const explainAction = new vscode.CodeAction(
        `Explain with ${PRODUCT_NAMES.code}`,
        vscode.CodeActionKind.Empty,
      );
      explainAction.command = {
        command: 'agi-workforce.explain',
        title: `Explain with ${PRODUCT_NAMES.code}`,
      };
      actions.push(explainAction);

      const testAction = new vscode.CodeAction(
        `Generate Tests with ${PRODUCT_NAMES.code}`,
        vscode.CodeActionKind.Empty,
      );
      testAction.command = {
        command: 'agi-workforce.generateTests',
        title: `Generate Tests with ${PRODUCT_NAMES.code}`,
      };
      actions.push(testAction);
    }

    return actions;
  }
}

function diagnosticLines(
  document: vscode.TextDocument,
  diagnostics: readonly vscode.Diagnostic[],
): vscode.Range {
  const startLine = Math.min(...diagnostics.map((diagnostic) => diagnostic.range.start.line));
  const endLine = Math.max(...diagnostics.map((diagnostic) => diagnostic.range.end.line));
  return new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).range.end.character);
}
