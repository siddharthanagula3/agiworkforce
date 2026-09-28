import * as vscode from 'vscode';
import { getCloudWebOrigin } from '../utils/api';
import { getExtensionVersion } from '../platform/version';

const LAST_SEEN_VERSION_KEY = 'agi.lastSeenExtensionVersion';
const WHATS_NEW = 'What’s new';

export async function announceExtensionUpdate(state: vscode.Memento): Promise<void> {
  const current = getExtensionVersion();
  const previous = state.get<string>(LAST_SEEN_VERSION_KEY);
  await state.update(LAST_SEEN_VERSION_KEY, current);
  if (previous === undefined || previous === current) return;
  const choice = await vscode.window.showInformationMessage(
    `AGI Workforce was updated to ${current}.`,
    WHATS_NEW,
  );
  if (choice === WHATS_NEW) {
    await vscode.env.openExternal(
      vscode.Uri.parse(`${getCloudWebOrigin()}/release-notes?from=vscode-extension`),
    );
  }
}

const NATIVE_CHAT_NOTICE_KEY = 'agi.nativeChatUnavailableNoticeShown';
const OPEN_CHAT = 'Open chat';

export async function announceMissingNativeChat(state: vscode.Memento): Promise<void> {
  if (state.get<boolean>(NATIVE_CHAT_NOTICE_KEY) === true) return;
  await state.update(NATIVE_CHAT_NOTICE_KEY, true);
  const choice = await vscode.window.showInformationMessage(
    `AGI Workforce: ${vscode.env.appName} ${vscode.version} has no native Chat view, so @agi is not available here. Chat runs in the AGI Workforce sidebar instead.`,
    OPEN_CHAT,
  );
  if (choice === OPEN_CHAT) await vscode.commands.executeCommand('agi-workforce.sidebar.focus');
}
