import { PRODUCT_NAMES } from '@agiworkforce/types';
import * as vscode from 'vscode';
import { Config } from '../../platform/config';

export class AgiHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.Hover | undefined {
    if (!Config.hoverEnabled()) {
      return undefined;
    }

    const wordRange = document.getWordRangeAtPosition(position);
    if (wordRange === undefined) {
      return undefined;
    }

    const md = new vscode.MarkdownString(
      `**${PRODUCT_NAMES.code}**, ` +
        '[$(info) Explain](command:agi-workforce.explain "Explain this code") · ' +
        '[$(wrench) Fix](command:agi-workforce.fix "Fix issues in selection") · ' +
        '[$(beaker) Tests](command:agi-workforce.generateTests "Generate tests")',
    );
    md.isTrusted = true;
    md.supportThemeIcons = true;

    return new vscode.Hover(md, wordRange);
  }
}
