/**
 * runInlineCommand.ts — Shared handler for the inline command commands
 * (`@agi /explain`, `/fix`, `/refactor`, `/tests`, `/docs`).
 *
 * Extracted from `extension.ts` (110 LOC) per A1 decomposition.
 */

import * as vscode from 'vscode';
import { Config } from '../utils/config';
import { chatCompletion, type LlmChatMessage } from '../utils/api';
import { applyLlmEdit } from '../utils/applyEdit';
import * as telemetry from '../services/telemetry';

export type InlineCommand = 'explain' | 'fix' | 'refactor' | 'tests' | 'docs';

export function commandLabel(command: string): string {
  const labels: Record<string, string> = {
    explain: 'Explain Code',
    fix: 'Fix Issues',
    refactor: 'Refactor',
    tests: 'Generate Tests',
    docs: 'Generate Docs',
  };
  return labels[command] ?? command;
}

export async function runInlineCommand(
  context: vscode.ExtensionContext,
  command: InlineCommand,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    vscode.window.showWarningMessage('AGI Workforce: No active editor. Open a file first.');
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection.isEmpty ? undefined : selection);

  if (selectedText.trim() === '') {
    vscode.window.showWarningMessage('AGI Workforce: Select some code first.');
    return;
  }

  const lang = editor.document.languageId;
  const planModeEnabled = Config.agentPlanMode();
  // EXTV-1 (audit 2026-05-03): autoApplyFixes is a workspace-level
  // setting. An untrusted workspace (cloned repo) could enable it via
  // .vscode/settings.json and have LLM-generated code auto-applied
  // with no diff preview. Force `false` whenever the workspace is not
  // explicitly trusted by the user — preserves the diff-preview path.
  // NOTE: read raw via getConfiguration directly so the trust gate stays at
  // this site (not abstracted into Config); makes the trust check obvious.
  const rawAutoApplyFixes =
    vscode.workspace.getConfiguration('agiWorkforce').get<boolean>('autoApplyFixes') ?? false;
  const autoApplyFixes = vscode.workspace.isTrusted ? rawAutoApplyFixes : false;
  if (rawAutoApplyFixes && !vscode.workspace.isTrusted) {
    vscode.window.showInformationMessage(
      'AGI Workforce: autoApplyFixes is disabled in this untrusted workspace. Trust the workspace to enable.',
    );
  }

  if (planModeEnabled && command !== 'explain') {
    const choice = await vscode.window.showInformationMessage(
      `AGI Workforce plan mode is enabled. Proceed with ${commandLabel(command)}?`,
      'Proceed',
      'Cancel',
    );
    if (choice !== 'Proceed') {
      return;
    }
  }

  const prompts: Record<string, string> = {
    explain: `Explain the following ${lang} code clearly and concisely:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
    fix: `Find and fix any bugs or issues in the following ${lang} code. Provide the corrected code and explain each fix:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
    refactor: `Refactor the following ${lang} code to improve readability, maintainability, and performance. Explain each change:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
    tests: `Generate comprehensive unit tests for the following ${lang} code. Cover edge cases, error paths, and happy paths:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
    docs: `Generate clear, accurate documentation comments (JSDoc/TSDoc/docstrings as appropriate) for the following ${lang} code:\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
  };

  const messages: LlmChatMessage[] = [
    {
      role: 'system',
      content:
        'You are AGI Workforce, a model-agnostic AI coding assistant. ' +
        'Be concise and produce production-ready Markdown output.',
    },
    { role: 'user', content: prompts[command] ?? selectedText },
  ];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `AGI Workforce: ${commandLabel(command)}…`,
      cancellable: true,
    },
    async (progress, progressToken) => {
      const cancelSource = new vscode.CancellationTokenSource();
      progressToken.onCancellationRequested(() => cancelSource.cancel());

      try {
        progress.report({ increment: 0 });
        telemetry.logEvent(telemetry.TelemetryEvents.INLINE_COMMAND_EXECUTED, {
          command,
          language: lang,
        });
        const result = await chatCompletion(context.secrets, messages, cancelSource.token);
        cancelSource.dispose();

        progress.report({ increment: 100 });

        await applyLlmEdit(
          editor,
          selection.isEmpty ? new vscode.Selection(0, 0, 0, 0) : selection,
          result,
          commandLabel(command),
          { autoApply: autoApplyFixes && command === 'fix' },
        );
      } catch (err) {
        cancelSource.dispose();

        if (err instanceof Error && err.message.includes('CANCELLED')) {
          return;
        }

        const message = err instanceof Error ? err.message : String(err);
        telemetry.logError(err instanceof Error ? err : message, { command });

        vscode.window
          .showErrorMessage(`AGI Workforce error: ${message}`, 'Set API Key')
          .then((choice) => {
            if (choice === 'Set API Key') {
              vscode.commands.executeCommand('agi-workforce.setApiKey');
            }
          });
      }
    },
  );
}
