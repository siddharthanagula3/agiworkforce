/**
 * runInlineCommand.ts — Shared handler for the inline command commands
 * (`@agi /explain`, `/fix`, `/refactor`, `/tests`, `/docs`).
 *
 * Extracted from `extension.ts` (110 LOC) per A1 decomposition.
 */

import * as vscode from 'vscode';
import { Config } from '../platform/config';
import { chatCompletion, type LlmChatMessage } from '../utils/api';
import { applyLlmEdit } from '../platform/applyEdit';
import * as telemetry from './telemetry';

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

/**
 * Whether a failure is one that setting an API key would fix.
 *
 * Deliberately narrow: anything unrecognised is treated as *not* a credential
 * problem, because offering the key dialog for an unrelated failure is the
 * defect being fixed. A missed auth case costs one extra click through
 * settings; a false positive sends the user to change working credentials.
 */
export function isCredentialFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('api key') ||
    normalized.includes('apikey') ||
    normalized.includes('unauthorized') ||
    normalized.includes('unauthenticated') ||
    normalized.includes('authentication') ||
    normalized.includes('invalid_api_key') ||
    normalized.includes('401') ||
    normalized.includes('403')
  );
}

export async function runInlineCommand(
  context: vscode.ExtensionContext,
  command: InlineCommand,
  /**
   * Explicit target range, supplied by callers that already know what the user
   * pointed at — a CodeLens above a function, for example.
   *
   * Without it this fell back to `editor.selection`, and an empty selection
   * makes `getText(undefined)` return the *entire document*. So the
   * "Select some code first" guard below never fired for a lens click, and
   * asking about one function silently sent the whole file to the model.
   */
  targetRange?: vscode.Range,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    vscode.window.showWarningMessage('AGI Workforce: No active editor. Open a file first.');
    return;
  }

  const selection = editor.selection;
  const explicitRange = targetRange ?? (selection.isEmpty ? undefined : selection);

  if (explicitRange === undefined) {
    vscode.window.showWarningMessage('AGI Workforce: Select some code first.');
    return;
  }

  const selectedText = editor.document.getText(explicitRange);

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

        // Apply against the range the prompt was built from. This previously
        // collapsed to Selection(0,0,0,0) whenever the selection was empty,
        // which now matters: a CodeLens supplies a range without selecting
        // anything, so the result would have been applied at the top of the
        // file instead of at the declaration it describes.
        await applyLlmEdit(
          editor,
          new vscode.Selection(explicitRange.start, explicitRange.end),
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

        // Every failure used to offer a single "Set API Key" button, so a
        // network drop or a rate limit told the user to fix their credentials —
        // the action contradicted the message it sat next to. Offer the key
        // dialog only for failures a key can actually resolve.
        if (isCredentialFailure(message)) {
          void vscode.window
            .showErrorMessage(`AGI Workforce error: ${message}`, 'Set API Key')
            .then((choice) => {
              if (choice === 'Set API Key') {
                void vscode.commands.executeCommand('agi-workforce.setApiKey');
              }
            });
          return;
        }

        void vscode.window
          .showErrorMessage(`AGI Workforce error: ${message}`, 'Retry')
          .then((choice) => {
            if (choice === 'Retry') {
              void runInlineCommand(context, command, targetRange);
            }
          });
      }
    },
  );
}
