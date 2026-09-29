import * as vscode from 'vscode';
import {
  cloudCodeSessionPagePath,
  type ThreadReadResponse,
  type ThreadSummary,
} from '@agiworkforce/types';
import { t } from '../../l10n';
import { getCloudWebOrigin } from '../../utils/api';

const CLOUD_THREAD_PREFIX = 'cloud:';

export function isCloudThread(thread: Pick<ThreadSummary, 'location'>): boolean {
  return thread.location === 'cloud';
}

export function cloudSessionUrl(threadId: string): string | undefined {
  if (!threadId.startsWith(CLOUD_THREAD_PREFIX)) return undefined;
  const sessionId = threadId.slice(CLOUD_THREAD_PREFIX.length);
  return sessionId ? `${getCloudWebOrigin()}${cloudCodeSessionPagePath(sessionId)}` : undefined;
}

export function cloudTranscript(response: ThreadReadResponse): string {
  const turns = response.messages.map(
    (message) => `**${message.role === 'user' ? 'You' : 'AGI'}**\n\n${message.text}`,
  );
  return [`# ${response.thread.title}`, ...turns].join('\n\n');
}

export async function showCloudSession(response: ThreadReadResponse): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: cloudTranscript(response),
  });
  await vscode.window.showTextDocument(document, { preview: true });
  const url = cloudSessionUrl(response.thread.id);
  const open = t('chatNotice.openOnWeb');
  const choice = await vscode.window.showInformationMessage(
    `AGI Workforce: ${t('chatNotice.cloudSessionReadOnly')}`,
    ...(url ? [open] : []),
  );
  if (choice === open && url) await vscode.env.openExternal(vscode.Uri.parse(url));
}
