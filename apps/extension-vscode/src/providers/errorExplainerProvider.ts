import * as vscode from 'vscode';
import { logEvent, TelemetryEvents } from '../core/telemetry';
import {
  buildAskAboutCodePrompt,
  buildExplainErrorPrompt,
  runEditorUtility,
} from '../features/editor-utilities';

export function activateErrorExplainer(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.explainError', explainErrorCommand),
    vscode.commands.registerCommand('agi-workforce.askAboutCode', askAboutCodeCommand),
  );
}

async function explainErrorCommand(): Promise<void> {
  const built = buildExplainErrorPrompt();
  if (built.ok) {
    logEvent(TelemetryEvents.INLINE_COMMAND_EXECUTED, {
      command: 'explainError',
      language: vscode.window.activeTextEditor?.document.languageId ?? 'none',
    });
  }
  await runEditorUtility(built);
}

async function askAboutCodeCommand(): Promise<void> {
  const question = await vscode.window.showInputBox({
    title: 'AGI Workforce, Ask About Code',
    prompt: 'Ask anything about your code…',
    placeHolder: 'e.g. "Why does this function return undefined?"',
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() === '' ? 'Please enter a question.' : undefined),
  });
  if (question === undefined || question.trim() === '') return;

  const built = buildAskAboutCodePrompt(question);
  if (built.ok) {
    logEvent(TelemetryEvents.INLINE_COMMAND_EXECUTED, {
      command: 'askAboutCode',
      language: vscode.window.activeTextEditor?.document.languageId ?? 'none',
    });
  }
  await runEditorUtility(built);
}
