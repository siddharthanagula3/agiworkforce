import { PRODUCT_NAMES } from '@agiworkforce/types';
import * as vscode from 'vscode';
import { Config } from '../platform/config';
import { chatCompletion, type LlmChatMessage } from '../utils/api';
import { applyLlmEdit } from '../platform/applyEdit';
import { trackProductEvent } from '../features/analytics/productAnalytics';
import {
  classifyCloudUtilityFailure,
  showCloudUtilityErrorActions,
} from './cloudUtilityErrorActions';
import { describeOutboundRefusal } from './outboundContentGuard';

export type InlineCommand = 'fix' | 'refactor' | 'tests' | 'docs';

export function commandLabel(command: string): string {
  const labels: Record<string, string> = {
    fix: 'Fix Issues',
    refactor: 'Refactor',
    tests: 'Generate Tests',
    docs: 'Generate Docs',
  };
  return labels[command] ?? command;
}

export interface InlineCommandContext {
  before: string;
  after: string;
  problems: readonly string[];
}

export function inlineCommandPrompt(
  command: InlineCommand,
  lang: string,
  selectedText: string,
  context: InlineCommandContext,
): string {
  const fence = (code: string) => `\`\`\`${lang}\n${code}\n\`\`\``;
  if (command === 'tests') {
    return `Generate comprehensive unit tests for the following ${lang} code. Cover edge cases, error paths, and happy paths:\n\n${fence(selectedText)}`;
  }
  const task: Record<Exclude<InlineCommand, 'tests'>, string> = {
    fix: 'Fix the bugs and reported problems in the selected lines.',
    refactor:
      'Refactor the selected lines to improve readability, maintainability, and performance.',
    docs: 'Add clear, accurate documentation comments (JSDoc/TSDoc/docstrings as appropriate) to the selected lines.',
  };
  const sections = [task[command]];
  if (context.problems.length > 0) {
    sections.push(
      `Problems the editor reports in the selection:\n${context.problems.map((problem) => `- ${problem}`).join('\n')}`,
    );
  }
  if (context.before !== '')
    sections.push(`Code just before the selection, unchanged:\n${fence(context.before)}`);
  sections.push(`Selected lines:\n${fence(selectedText)}`);
  if (context.after !== '')
    sections.push(`Code just after the selection, unchanged:\n${fence(context.after)}`);
  sections.push(
    'Your first code block replaces exactly the selected lines in the file, so it must fit between the code before and after it. ' +
      'Do not repeat the surrounding code, keep the original indentation, then briefly explain each change.',
  );
  return sections.join('\n\n');
}

const SURROUNDING_LINES = 30;

function inlineCommandContext(
  document: vscode.TextDocument,
  range: vscode.Range,
): InlineCommandContext {
  const beforeStart = Math.max(0, range.start.line - SURROUNDING_LINES);
  const afterEnd = Math.min(document.lineCount - 1, range.end.line + SURROUNDING_LINES);
  const before =
    range.start.line > 0
      ? document.getText(new vscode.Range(beforeStart, 0, range.start.line, 0)).replace(/\n$/u, '')
      : '';
  const after =
    range.end.line < document.lineCount - 1
      ? document.getText(
          new vscode.Range(range.end.line + 1, 0, afterEnd, document.lineAt(afterEnd).text.length),
        )
      : '';
  const problems = vscode.languages
    .getDiagnostics(document.uri)
    .filter((diagnostic) => diagnostic.range.intersection(range) !== undefined)
    .map((diagnostic) => `line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`);
  return { before, after, problems };
}

export async function runInlineCommand(
  context: vscode.ExtensionContext,
  command: InlineCommand,
  targetRange?: vscode.Range,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    vscode.window.showWarningMessage(`${PRODUCT_NAMES.code}: No active editor. Open a file first.`);
    return;
  }

  const selection = editor.selection;
  const explicitRange = targetRange ?? (selection.isEmpty ? undefined : selection);

  if (explicitRange === undefined) {
    vscode.window.showWarningMessage(`${PRODUCT_NAMES.code}: Select some code first.`);
    return;
  }

  const refusal = describeOutboundRefusal(editor.document);
  if (refusal !== null) {
    vscode.window.showWarningMessage(`${PRODUCT_NAMES.code}: ${refusal}`);
    return;
  }

  const selectedText = editor.document.getText(explicitRange);

  if (selectedText.trim() === '') {
    vscode.window.showWarningMessage(`${PRODUCT_NAMES.code}: Select some code first.`);
    return;
  }

  const lang = editor.document.languageId;
  const planModeEnabled = Config.planModeActive();
  const autoApplyFixes = Config.autoApplyFixes();

  if (planModeEnabled) {
    const choice = await vscode.window.showInformationMessage(
      `${PRODUCT_NAMES.code} plan mode is enabled. Proceed with ${commandLabel(command)}?`,
      'Proceed',
      'Cancel',
    );
    if (choice !== 'Proceed') {
      return;
    }
  }

  const messages: LlmChatMessage[] = [
    {
      role: 'system',
      content:
        `You are ${PRODUCT_NAMES.code}, a model-agnostic AI coding assistant. ` +
        'Be concise and produce production-ready Markdown output.',
    },
    {
      role: 'user',
      content: inlineCommandPrompt(
        command,
        lang,
        selectedText,
        inlineCommandContext(editor.document, explicitRange),
      ),
    },
  ];

  const outcome = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `${PRODUCT_NAMES.code}: ${commandLabel(command)}…`,
      cancellable: true,
    },
    async (progress, progressToken): Promise<{ result: string } | { failure: unknown }> => {
      const cancelSource = new vscode.CancellationTokenSource();
      progressToken.onCancellationRequested(() => cancelSource.cancel());
      try {
        progress.report({ increment: 0 });
        const result = await chatCompletion(context.secrets, messages, cancelSource.token);
        progress.report({ increment: 100 });
        return { result };
      } catch (failure) {
        return { failure };
      } finally {
        cancelSource.dispose();
      }
    },
  );

  if ('result' in outcome) {
    const resolution = await applyLlmEdit(
      editor,
      new vscode.Selection(explicitRange.start, explicitRange.end),
      outcome.result,
      commandLabel(command),
      { autoApply: autoApplyFixes && command === 'fix' },
    );
    if (resolution) {
      trackProductEvent('code_suggestion_resolved', 'managed', {
        outcome: resolution,
        properties: { kind: command, source: 'inline_command' },
      });
    }
    return;
  }
  if (classifyCloudUtilityFailure(outcome.failure) === 'cancelled') return;
  await showCloudUtilityErrorActions(outcome.failure, {
    title: `${PRODUCT_NAMES.code}: ${commandLabel(command)} failed`,
    retry: () => runInlineCommand(context, command, targetRange),
    secrets: context.secrets,
  });
}
