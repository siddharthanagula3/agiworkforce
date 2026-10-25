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
  /**
   * The lines the user asked about, 1-based, when the selection was widened
   * to the function around them so a fix can change what the problem needs.
   */
  widenedFrom?: { startLine: number; endLine: number };
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
  if (context.widenedFrom !== undefined) {
    const { startLine, endLine } = context.widenedFrom;
    const lines = startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`;
    sections.push(
      `The problem is on ${lines}. The selected lines are the whole function around it, so change any of them a correct fix needs, not only ${lines}.`,
    );
  }
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
  asked: vscode.Range = range,
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
    .filter((diagnostic) => diagnostic.range.intersection(asked) !== undefined)
    .map((diagnostic) => `line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`);
  const widened = asked.start.line !== range.start.line || asked.end.line !== range.end.line;
  return {
    before,
    after,
    problems,
    ...(widened
      ? { widenedFrom: { startLine: asked.start.line + 1, endLine: asked.end.line + 1 } }
      : {}),
  };
}

const FIX_SCOPE_KINDS: ReadonlySet<vscode.SymbolKind> = new Set([
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Method,
  vscode.SymbolKind.Constructor,
  vscode.SymbolKind.Variable,
  vscode.SymbolKind.Constant,
  vscode.SymbolKind.Property,
  vscode.SymbolKind.Field,
]);
const MAX_FIX_SCOPE_LINES = 200;

type OutlineSymbol = vscode.DocumentSymbol | vscode.SymbolInformation;

function symbolRange(symbol: OutlineSymbol): vscode.Range {
  return 'location' in symbol ? symbol.location.range : symbol.range;
}

function symbolChildren(symbol: OutlineSymbol): readonly OutlineSymbol[] {
  return 'children' in symbol ? symbol.children : [];
}

function before(a: vscode.Position, b: vscode.Position): boolean {
  return a.line < b.line || (a.line === b.line && a.character <= b.character);
}

function encloses(outer: vscode.Range, inner: vscode.Range): boolean {
  return before(outer.start, inner.start) && before(inner.end, outer.end);
}

/**
 * The innermost function or method around `asked`, from the editor's own
 * outline. A fix confined to the diagnostic's lines could only patch those
 * lines, so an accepted fix that needed a change one line up was wrong.
 */
export function enclosingFixScope(
  symbols: readonly OutlineSymbol[],
  asked: vscode.Range,
): vscode.Range | undefined {
  let innermost: vscode.Range | undefined;
  const visit = (list: readonly OutlineSymbol[]): void => {
    for (const symbol of list) {
      const range = symbolRange(symbol);
      if (!encloses(range, asked)) continue;
      const callable =
        FIX_SCOPE_KINDS.has(symbol.kind) &&
        range.end.line > range.start.line &&
        range.end.line - range.start.line < MAX_FIX_SCOPE_LINES;
      if (callable) innermost = range;
      visit(symbolChildren(symbol));
    }
  };
  visit(symbols);
  return innermost;
}

async function fixRange(document: vscode.TextDocument, asked: vscode.Range): Promise<vscode.Range> {
  const symbols = await vscode.commands
    .executeCommand<OutlineSymbol[] | undefined>(
      'vscode.executeDocumentSymbolProvider',
      document.uri,
    )
    .then(
      (found) => found ?? [],
      () => [],
    );
  const scope = enclosingFixScope(symbols, asked);
  if (scope === undefined) return asked;
  return new vscode.Range(
    scope.start.line,
    0,
    scope.end.line,
    document.lineAt(scope.end.line).range.end.character,
  );
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
  const askedRange = targetRange ?? (selection.isEmpty ? undefined : selection);

  if (askedRange === undefined) {
    vscode.window.showWarningMessage(`${PRODUCT_NAMES.code}: Select some code first.`);
    return;
  }

  const refusal = describeOutboundRefusal(editor.document);
  if (refusal !== null) {
    vscode.window.showWarningMessage(`${PRODUCT_NAMES.code}: ${refusal}`);
    return;
  }

  if (editor.document.getText(askedRange).trim() === '') {
    vscode.window.showWarningMessage(`${PRODUCT_NAMES.code}: Select some code first.`);
    return;
  }

  const explicitRange =
    command === 'fix' ? await fixRange(editor.document, askedRange) : askedRange;
  const selectedText = editor.document.getText(explicitRange);
  const lang = editor.document.languageId;
  // An inline command is the user's own request on code they picked, and its
  // result is a diff they review, so plan mode does not stop it with a
  // notification that can land unseen. It only keeps a fix from applying
  // itself without that review.
  const autoApplyFixes = Config.autoApplyFixes() && !Config.planModeActive();

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
        inlineCommandContext(editor.document, explicitRange, askedRange),
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
