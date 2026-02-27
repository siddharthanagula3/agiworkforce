/**
 * codeActionProvider.ts — Code actions (lightbulb quick-fixes) for AGI Workforce
 *
 * Registers AGI Workforce actions in the VS Code lightbulb/refactor menu:
 * - "Fix with AGI Workforce" on diagnostic errors
 * - "Explain", "Refactor", "Generate Tests" on any selection
 */

import * as vscode from 'vscode';

export const CODE_ACTION_KINDS = [
  vscode.CodeActionKind.QuickFix,
  vscode.CodeActionKind.Refactor,
  vscode.CodeActionKind.Empty,
] as const;

export class AgiCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    _document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const hasSelection =
      range instanceof vscode.Selection
        ? !range.isEmpty
        : range.start.line !== range.end.line || range.start.character !== range.end.character;

    // Quick fix actions on diagnostics
    if (context.diagnostics.length > 0) {
      const fixAction = new vscode.CodeAction(
        'Fix with AGI Workforce',
        vscode.CodeActionKind.QuickFix,
      );
      fixAction.command = {
        command: 'agi-workforce.fix',
        title: 'Fix with AGI Workforce',
      };
      fixAction.diagnostics = [...context.diagnostics];
      fixAction.isPreferred = false;
      actions.push(fixAction);
    }

    // Selection-based actions
    if (hasSelection) {
      const refactorAction = new vscode.CodeAction(
        'Refactor with AGI Workforce',
        vscode.CodeActionKind.Refactor,
      );
      refactorAction.command = {
        command: 'agi-workforce.refactor',
        title: 'Refactor with AGI Workforce',
      };
      actions.push(refactorAction);

      const explainAction = new vscode.CodeAction(
        'Explain with AGI Workforce',
        vscode.CodeActionKind.Empty,
      );
      explainAction.command = {
        command: 'agi-workforce.explain',
        title: 'Explain with AGI Workforce',
      };
      actions.push(explainAction);

      const testAction = new vscode.CodeAction(
        'Generate Tests with AGI Workforce',
        vscode.CodeActionKind.Empty,
      );
      testAction.command = {
        command: 'agi-workforce.generateTests',
        title: 'Generate Tests with AGI Workforce',
      };
      actions.push(testAction);
    }

    return actions;
  }
}
