import * as path from 'path';
import * as vscode from 'vscode';
import type { DeveloperSessionHandoffLink } from '@agiworkforce/types';
import { HANDOFF_MAX_AGE_MS } from '../../integrations/developerSessionHandoff';

export const CONTINUE_DEVELOPER_SESSION_COMMAND = 'agi-workforce.continueCliSession';

const PENDING_DEVELOPER_SESSION_KEY = 'agi.pendingDeveloperSessionHandoff';
const OPEN_FOLDER = 'Open folder';

interface PendingDeveloperSession extends DeveloperSessionHandoffLink {
  requestedAt: number;
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const resolved = path.resolve(value);
    return process.platform === 'linux' ? resolved : resolved.toLowerCase();
  };
  return normalize(left) === normalize(right);
}

function folderIsOpen(cwd: string): boolean {
  return (vscode.workspace.workspaceFolders ?? []).some((folder) =>
    samePath(folder.uri.fsPath, cwd),
  );
}

export async function openDeveloperSessionLink(
  link: DeveloperSessionHandoffLink,
  state: vscode.Memento,
): Promise<void> {
  if (folderIsOpen(link.cwd)) {
    await vscode.commands.executeCommand(CONTINUE_DEVELOPER_SESSION_COMMAND, link.threadId);
    return;
  }
  const choice = await vscode.window.showInformationMessage(
    `AGI Workforce: this session works in ${link.cwd}, which is not open in this window.`,
    OPEN_FOLDER,
  );
  if (choice !== OPEN_FOLDER) return;
  const pending: PendingDeveloperSession = { ...link, requestedAt: Date.now() };
  await state.update(PENDING_DEVELOPER_SESSION_KEY, pending);
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(link.cwd), {
    forceNewWindow: true,
  });
}

export async function resumePendingDeveloperSession(state: vscode.Memento): Promise<void> {
  const pending = state.get<PendingDeveloperSession>(PENDING_DEVELOPER_SESSION_KEY);
  if (pending === undefined) return;
  if (Date.now() - pending.requestedAt > HANDOFF_MAX_AGE_MS) {
    await state.update(PENDING_DEVELOPER_SESSION_KEY, undefined);
    return;
  }
  if (!folderIsOpen(pending.cwd)) return;
  await state.update(PENDING_DEVELOPER_SESSION_KEY, undefined);
  await vscode.commands.executeCommand(CONTINUE_DEVELOPER_SESSION_COMMAND, pending.threadId);
}
