import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { invoke } from '../../lib/tauri-mock';
import { getCloudMessages } from '../../services/cloudChat';
import type { PrivacyMode } from '@agiworkforce/types';
import { selectPrivacyMode, useAppModeStore } from '../../stores/appModeStore';
import { resolveDesktopChatOwnerId, useChatStore, uuidToDbId } from '../../stores/chat/chatStore';

export type ConversationExportFormat = 'markdown' | 'pdf';

const MARKDOWN_FILTER = { name: 'Markdown', extensions: ['md'] };

/** PDF is rendered by the native runtime from SQLite, so only stored Local chats offer it. */
export function conversationExportFormats(
  privacyMode: PrivacyMode,
  incognito: boolean,
): ConversationExportFormat[] {
  return privacyMode === 'local' && !incognito ? ['markdown', 'pdf'] : ['markdown'];
}

export function exportFileStem(title: string): string {
  const printable = Array.from(title, (char) => (char < ' ' ? ' ' : char)).join('');
  const stem = printable
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  return stem || 'Conversation';
}

const ROLE_LABELS: Record<string, string> = {
  user: 'User',
  assistant: 'Assistant',
  system: 'System',
};

/** The same layout the native `conversation_export` writes, for chats SQLite does not hold. */
export function conversationMarkdown(
  title: string,
  messages: ReadonlyArray<{ role: string; content: string }>,
): string {
  let output = `# ${title}\n\n`;
  for (const message of messages) {
    output += `## ${ROLE_LABELS[message.role] ?? message.role}\n\n${message.content}\n\n---\n\n`;
  }
  return output;
}

async function managedMarkdown(conversationId: string, title: string): Promise<string> {
  const messages = await getCloudMessages(conversationId);
  if (messages.length === 0) throw new Error('This chat has no messages to export yet.');
  return conversationMarkdown(title, messages);
}

/**
 * Saves a conversation where the user picks. Local chats are read from SQLite
 * by the native runtime; Managed Cloud chats are read from the account.
 * Returns whether a file was written.
 */
export async function exportConversation(
  conversationId: string,
  format: ConversationExportFormat,
): Promise<boolean> {
  const conversation = useChatStore
    .getState()
    .conversations.find((candidate) => candidate.id === conversationId);
  const title = conversation?.title.trim() || 'Conversation';
  const privacyMode = selectPrivacyMode(useAppModeStore.getState());
  const dbId = uuidToDbId(conversationId);

  try {
    if (conversation?.incognito) {
      throw new Error('Temporary chats are not saved, so there is nothing to export.');
    }
    if (privacyMode === 'local' && dbId === undefined) {
      throw new Error('Send a message first. This chat has not been saved yet.');
    }
    if (!conversationExportFormats(privacyMode, false).includes(format)) {
      throw new Error('PDF export is available for Local chats.');
    }

    const userId = resolveDesktopChatOwnerId();
    let path: string | null;
    if (format === 'pdf') {
      path = await invoke<string | null>('conversation_export_pdf', {
        conversationId: String(dbId),
        userId,
      });
      if (!path) return false;
    } else {
      path = await save({
        defaultPath: `${exportFileStem(title)}.md`,
        filters: [MARKDOWN_FILTER],
      });
      if (!path) return false;
      const markdown =
        privacyMode === 'local'
          ? await invoke<string>('conversation_export', {
              conversationId: String(dbId),
              format: 'markdown',
              userId,
            })
          : await managedMarkdown(conversationId, title);
      await writeTextFile(path, markdown);
    }
    toast.success('Chat exported', { description: path });
    return true;
  } catch (error) {
    console.error('[conversationExport] Export failed:', error);
    toast.error('Could not export this chat', {
      description: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
