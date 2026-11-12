import { PRODUCT_NAMES } from '@agiworkforce/types';
import * as vscode from 'vscode';
import { Config } from '../platform/config';
import { chatCompletion, type LlmChatMessage } from '../utils/api';
import { applyLlmEdit, showLlmResultInNewTab } from '../platform/applyEdit';
import { trackProductEvent } from '../features/analytics/productAnalytics';
import {
  classifyCloudUtilityFailure,
  showCloudUtilityErrorActions,
} from './cloudUtilityErrorActions';
import { describeOutboundRefusal } from './outboundContentGuard';
import { cloudUtilityModel } from './cloudModelBoundary';
import { runEditorUtility } from '../features/editor-utilities';

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

const LOCAL_CHAT_INSTRUCTIONS: Readonly<Record<InlineCommand, string>> = {
  fix: 'Find and fix the bugs or issues in this code. Make the fix in the file and explain each change.',
  refactor:
    'Refactor this code to improve readability, maintainability, and performance. Make the change in the file and explain each change.',
  tests:
    'Write comprehensive unit tests for this code, covering edge cases, error paths, and happy paths. Put them where this project keeps its tests.',
  docs: 'Add clear, accurate documentation comments (JSDoc, TSDoc or docstrings as appropriate) to this code in the file.',
};

interface InlineCommandTarget {
  readonly editor: vscode.TextEditor;
  readonly range: vscode.Range;
  readonly expectedDocument: Pick<vscode.TextDocument, 'uri' | 'version'>;
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

  await runInlineCommandOnTarget(context, command, {
    editor,
    range: explicitRange,
    expectedDocument: { uri: editor.document.uri, version: editor.document.version },
  });
}

function targetStillCurrent(target: InlineCommandTarget): boolean {
  const { document } = target.editor;
  return (
    !document.isClosed &&
    document.version === target.expectedDocument.version &&
    document.uri.toString() === target.expectedDocument.uri.toString()
  );
}

async function runInlineCommandOnTarget(
  context: vscode.ExtensionContext,
  command: InlineCommand,
  target: InlineCommandTarget,
): Promise<void> {
  const { editor, expectedDocument } = target;
  const explicitRange = target.range;

  const refusal = describeOutboundRefusal(editor.document);
  if (refusal !== null) {
    vscode.window.showWarningMessage(`${PRODUCT_NAMES.code}: ${refusal}`);
    return;
  }

  const selectedText = editor.document.getText(explicitRange);
  const targetSelection = new vscode.Selection(explicitRange.start, explicitRange.end);

  if (selectedText.trim() === '') {
    vscode.window.showWarningMessage(`${PRODUCT_NAMES.code}: Select some code first.`);
    return;
  }

  const lang = editor.document.languageId;
  if (cloudUtilityModel().route === 'local') {
    const path = vscode.workspace.asRelativePath(editor.document.uri);
    await runEditorUtility({
      ok: true,
      prompt:
        `${LOCAL_CHAT_INSTRUCTIONS[command]}\n\n${path}, lines ${explicitRange.start.line + 1}-${explicitRange.end.line + 1}:\n` +
        `\`\`\`${lang}\n${selectedText}\n\`\`\``,
    });
    return;
  }
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

  const prompts: Record<string, string> = {
    fix: `Find and fix any bugs or issues in the following ${lang} code. Provide the corrected code and explain each fix:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
    refactor: `Refactor the following ${lang} code to improve readability, maintainability, and performance. Explain each change:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
    tests: `Generate comprehensive unit tests for the following ${lang} code. Cover edge cases, error paths, and happy paths:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
    docs: `Generate clear, accurate documentation comments (JSDoc/TSDoc/docstrings as appropriate) for the following ${lang} code:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
  };

  const messages: LlmChatMessage[] = [
    {
      role: 'system',
      content:
        `You are ${PRODUCT_NAMES.code}, a model-agnostic AI coding assistant. ` +
        'Be concise and produce production-ready Markdown output.',
    },
    { role: 'user', content: prompts[command] ?? selectedText },
  ];

  const failure = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `${PRODUCT_NAMES.code}: ${commandLabel(command)}…`,
      cancellable: true,
    },
    async (progress, progressToken): Promise<unknown> => {
      const cancelSource = new vscode.CancellationTokenSource();
      const cancellation = progressToken.onCancellationRequested(() => cancelSource.cancel());
      if (progressToken.isCancellationRequested) cancelSource.cancel();

      try {
        if (cancelSource.token.isCancellationRequested) return undefined;
        const refusal = describeOutboundRefusal(editor.document);
        if (refusal !== null) {
          vscode.window.showWarningMessage(`${PRODUCT_NAMES.code}: ${refusal}`);
          return undefined;
        }
        progress.report({ increment: 0 });
        const result = await chatCompletion(context.secrets, messages, cancelSource.token);
        if (cancelSource.token.isCancellationRequested) return undefined;

        progress.report({ increment: 100 });

        if (command === 'tests' || command === 'docs') {
          await showLlmResultInNewTab(result, commandLabel(command));
          return undefined;
        }

        const resolution = await applyLlmEdit(
          editor,
          targetSelection,
          result,
          commandLabel(command),
          {
            autoApply: autoApplyFixes && command === 'fix',
            expectedDocument,
            cancellationToken: cancelSource.token,
          },
        );
        if (resolution) {
          trackProductEvent('code_suggestion_resolved', 'managed', {
            outcome: resolution,
            properties: { kind: command, source: 'inline_command' },
          });
        }
        return undefined;
      } catch (err) {
        return err;
      } finally {
        cancellation.dispose();
        cancelSource.dispose();
      }
    },
  );

  if (failure === undefined) return;
  if (classifyCloudUtilityFailure(failure) === 'cancelled') return;
  await showCloudUtilityErrorActions(failure, {
    title: `${PRODUCT_NAMES.code}: ${commandLabel(command)} failed`,
    retry: async () => {
      if (!targetStillCurrent(target)) {
        vscode.window.showWarningMessage(
          `${PRODUCT_NAMES.code}: The file changed or closed since ${commandLabel(command)} started. Select the code and run it again.`,
        );
        return;
      }
      await runInlineCommandOnTarget(context, command, target);
    },
    secrets: context.secrets,
  });
}
