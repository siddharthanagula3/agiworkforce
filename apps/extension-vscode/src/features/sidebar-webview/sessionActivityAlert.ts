import * as vscode from 'vscode';
import {
  codeSessionActivityNotice,
  type LocalCodeSessionActivityEvent,
} from '@agiworkforce/cloud-contracts';
import type { ExtToWebviewMessage } from './ChatStateManager';

const OPEN_CHAT = 'Open chat';

function activityEvent(message: ExtToWebviewMessage): LocalCodeSessionActivityEvent | null {
  if (message.type === 'approvalRequested') return 'approval_required';
  if (message.type === 'done') return message.payload?.stopped ? null : 'completed';
  if (message.type === 'error') return 'failed';
  return null;
}

export function alertSessionActivity(message: ExtToWebviewMessage, reveal: () => void): void {
  const event = activityEvent(message);
  if (event === null || vscode.window.state.focused) return;
  const { title, body } = codeSessionActivityNotice(event, 'A coding session');
  const text = `AGI Workforce: ${title}. ${body}`;
  const shown =
    event === 'failed'
      ? vscode.window.showWarningMessage(text, OPEN_CHAT)
      : vscode.window.showInformationMessage(text, OPEN_CHAT);
  void shown.then((choice) => {
    if (choice === OPEN_CHAT) reveal();
  });
}
