import {
  copyAsync,
  deleteAsync,
  documentDirectory,
  makeDirectoryAsync,
} from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { nativeFileName } from '@/services/nativeFileName';
import { excludeFromBackup } from '@/src/platform/backupExclusion';
import type { ChatMessage, MessageAttachment } from '@/types/chat';

export const LOCAL_CHAT_ATTACHMENTS_DIR = `${documentDirectory}chat-attachments/`;

const KEPT_COPY_PATH = /^[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\/(?!\.\.?$)[^/]+$/;
const KEPT_COPIES_MARKER = `/${documentDirectory?.split('/').filter(Boolean).pop() ?? ''}/chat-attachments/`;

function conversationDirectory(conversationId: string): string {
  return `${LOCAL_CHAT_ATTACHMENTS_DIR}${conversationId.replace(/[^a-zA-Z0-9_-]/g, '_')}/`;
}

// iOS moves the app container to a new path when the app is updated, so a stored copy is found
// by its place under the documents folder rather than by the absolute path it was saved with.
function keptCopyPath(url: string): string | null {
  if (!documentDirectory || !url.startsWith('file://')) return null;
  let path: string | null = null;
  if (url.startsWith(LOCAL_CHAT_ATTACHMENTS_DIR)) {
    path = url.slice(LOCAL_CHAT_ATTACHMENTS_DIR.length);
  } else {
    const marker = url.indexOf(KEPT_COPIES_MARKER);
    if (marker >= 0) path = url.slice(marker + KEPT_COPIES_MARKER.length);
  }
  return path !== null && KEPT_COPY_PATH.test(path) ? path : null;
}

function keptCopyFolder(url: string): string | null {
  const path = keptCopyPath(url);
  return path === null
    ? null
    : `${LOCAL_CHAT_ATTACHMENTS_DIR}${path.slice(0, path.lastIndexOf('/') + 1)}`;
}

export function resolveLocalChatAttachmentUrl(url: string): string {
  const path = keptCopyPath(url);
  return path === null ? url : `${LOCAL_CHAT_ATTACHMENTS_DIR}${path}`;
}

export function resolveLocalChatAttachment(attachment: MessageAttachment): MessageAttachment {
  const url = resolveLocalChatAttachmentUrl(attachment.url);
  return url === attachment.url ? attachment : { ...attachment, url };
}

async function keepAttachment(
  directory: string,
  attachment: MessageAttachment,
): Promise<MessageAttachment> {
  if (!attachment.url.startsWith('file://') || keptCopyPath(attachment.url) !== null) {
    return attachment;
  }
  const folder = `${directory}${Crypto.randomUUID()}/`;
  try {
    await makeDirectoryAsync(folder, { intermediates: true });
    const url = `${folder}${encodeURIComponent(nativeFileName(attachment.fileName))}`;
    await copyAsync({ from: attachment.url, to: url });
    return { ...attachment, url };
  } catch {
    await deleteAsync(folder, { idempotent: true }).catch(() => undefined);
    return attachment;
  }
}

// The picker hands over files in the cache, which the system may purge, so a Local chat keeps
// its own copy. A copy that fails leaves the cache file in place: the message still sends.
export async function keepLocalChatAttachments(
  conversationId: string,
  attachments: MessageAttachment[],
): Promise<MessageAttachment[]> {
  if (!documentDirectory) return attachments;
  const directory = conversationDirectory(conversationId);
  const kept = await Promise.all(
    attachments.map((attachment) => keepAttachment(directory, attachment)),
  );
  if (kept.some((attachment, index) => attachment !== attachments[index])) {
    await excludeFromBackup([directory]).catch((error: unknown) => {
      console.warn('[localChatAttachments] Could not exclude chat attachments from backup:', error);
    });
  }
  return kept;
}

export async function releaseLocalChatAttachments(
  urls: Iterable<string>,
  stillReferenced: Iterable<string>,
): Promise<void> {
  const inUse = new Set<string>();
  for (const url of stillReferenced) {
    const folder = keptCopyFolder(url);
    if (folder !== null) inUse.add(folder);
  }
  for (const url of urls) {
    const folder = keptCopyFolder(url);
    if (folder === null || inUse.has(folder)) continue;
    inUse.add(folder);
    await deleteAsync(folder, { idempotent: true });
  }
}

function attachmentUrls(messages: readonly ChatMessage[]): string[] {
  return messages.flatMap(
    (message) => message.attachments?.map((attachment) => attachment.url) ?? [],
  );
}

export async function releaseDeletedConversationAttachments(
  removedMessages: readonly ChatMessage[],
  remainingMessages: Readonly<Record<string, readonly ChatMessage[]>>,
): Promise<void> {
  const urls = attachmentUrls(removedMessages);
  if (urls.length === 0) return;
  await releaseLocalChatAttachments(urls, Object.values(remainingMessages).flatMap(attachmentUrls));
}

export async function removeAllLocalChatAttachments(): Promise<void> {
  if (!documentDirectory) return;
  await deleteAsync(LOCAL_CHAT_ATTACHMENTS_DIR, { idempotent: true });
}
