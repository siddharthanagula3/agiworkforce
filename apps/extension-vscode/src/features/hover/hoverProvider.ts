import * as vscode from 'vscode';

export class AgiHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.Hover | undefined {
    const config = vscode.workspace.getConfiguration('agiWorkforce');
    if (config.get<boolean>('hoverEnabled') !== true) {
      return undefined;
    }

    const wordRange = document.getWordRangeAtPosition(position);
    if (wordRange === undefined) {
      return undefined;
    }

    const md = new vscode.MarkdownString(
      '**AGI Workforce**, ' +
        '[$(info) Explain](command:agi-workforce.explain "Explain this code") · ' +
        '[$(wrench) Fix](command:agi-workforce.fix "Fix issues in selection") · ' +
        '[$(beaker) Tests](command:agi-workforce.generateTests "Generate tests")',
    );
    md.isTrusted = true;
    md.supportThemeIcons = true;

    return new vscode.Hover(md, wordRange);
  }
}
