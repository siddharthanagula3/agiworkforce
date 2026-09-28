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

export interface SessionActivityHost {
  reveal: () => void;
  respond: (requestId: string, decision: 'once' | 'deny') => void;
}

const ALLOW_ONCE = 'Allow once';
const DENY = 'Deny';

export function alertSessionActivity(
  message: ExtToWebviewMessage,
  host: SessionActivityHost,
): void {
  const event = activityEvent(message);
  if (event === null || vscode.window.state.focused) return;
  const { title, body } = codeSessionActivityNotice(event, 'A coding session');
  if (message.type === 'approvalRequested') {
    const { requestId, summary } = message.payload;
    void vscode.window
      .showWarningMessage(`AGI Workforce: ${title}. ${summary}`, ALLOW_ONCE, DENY, OPEN_CHAT)
      .then((choice) => {
        if (choice === ALLOW_ONCE) host.respond(requestId, 'once');
        else if (choice === DENY) host.respond(requestId, 'deny');
        else if (choice === OPEN_CHAT) host.reveal();
      });
    return;
  }
  const text = `AGI Workforce: ${title}. ${body}`;
  const shown =
    event === 'failed'
      ? vscode.window.showWarningMessage(text, OPEN_CHAT)
      : vscode.window.showInformationMessage(text, OPEN_CHAT);
  void shown.then((choice) => {
    if (choice === OPEN_CHAT) host.reveal();
  });
}
