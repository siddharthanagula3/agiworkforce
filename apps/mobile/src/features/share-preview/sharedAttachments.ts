import { cacheDirectory } from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { stageComposerAttachments } from '@/src/features/chat/composerHandoff';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';

export interface SharedFile {
  uri: string;
  fileName: string;
  mimeType: string;
  byteSize?: number;
}

export const ANDROID_SHARE_INBOX_DIRECTORY = 'shared-inbox/';
export const IOS_SHARE_INBOX_DIRECTORY = 'AGISharedInbox/';
export const IOS_INTENT_FILES_DIRECTORY = 'AGIIntentFiles/';

const ENCODED_PATH_CONTROL = /%(?:2e|2f|5c|00)/i;

function decodedLocalPath(uri: string): string | null {
  if (!uri.startsWith('file:///') || /[?#\\\0]/.test(uri)) return null;
  let path: string;
  try {
    path = decodeURIComponent(uri.slice('file://'.length));
  } catch {
    return null;
  }
  if (path.includes('\0') || path.includes('\\') || ENCODED_PATH_CONTROL.test(path)) return null;
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  return path;
}

export function isInsideShareInbox(uri: string, inboxDirectory: string): boolean {
  if (!cacheDirectory) return false;
  const root = decodedLocalPath(`${cacheDirectory}${inboxDirectory}`);
  const path = decodedLocalPath(uri);
  if (!root || !path || !root.endsWith('/')) return false;
  return path.startsWith(root) && path.length > root.length && !path.endsWith('/');
}

/**
 * Only the iOS App Intents stage an image or recording for an intent link, and
 * always as a copy in their own folder. Any app or web page can open the link,
 * so a file named anywhere else is dropped before a screen shows or sends it.
 */
export function stagedIntentFileUri(uri: string | undefined): string | undefined {
  if (!uri || Platform.OS !== 'ios') return undefined;
  return isInsideShareInbox(uri, IOS_INTENT_FILES_DIRECTORY) ? uri : undefined;
}

export function normalizeSharedFile(raw: unknown, inboxDirectory: string): SharedFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const file = raw as Record<string, unknown>;
  const uri = typeof file.uri === 'string' ? file.uri.trim() : '';
  const fileName = typeof file.fileName === 'string' ? file.fileName.trim() : '';
  const mimeType = typeof file.mimeType === 'string' ? file.mimeType.trim() : '';
  if (!fileName || !isInsideShareInbox(uri, inboxDirectory)) return null;
  const byteSize =
    typeof file.byteSize === 'number' && file.byteSize > 0 ? file.byteSize : undefined;
  return {
    uri,
    fileName,
    mimeType: mimeType || 'application/octet-stream',
    ...(byteSize ? { byteSize } : {}),
  };
}

/**
 * The Android share rewrite carries the files it copied out of the content
 * provider as a JSON array on the deep link, because the read grant on the
 * original content:// URI does not survive the rewrite. Any app or web page can
 * open that link too, so only copies inside the rewrite's own inbox are taken.
 */
export function parseSharedFilesParam(raw: string | undefined | null): SharedFile[] {
  if (!raw || Platform.OS !== 'android') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry) => normalizeSharedFile(entry, ANDROID_SHARE_INBOX_DIRECTORY))
    .filter((file): file is SharedFile => file !== null);
}

export function sharedFilesToAttachments(files: SharedFile[]): Attachment[] {
  return files.map((file) => ({
    id: `share-${uuidv7()}`,
    uri: file.uri,
    mimeType: file.mimeType,
    fileName: file.fileName,
    ...(file.byteSize ? { fileSize: file.byteSize } : {}),
  }));
}

export function stageSharedFileAttachments(files: SharedFile[]): string | null {
  const attachments = sharedFilesToAttachments(files);
  if (attachments.length === 0) return null;
  const key = `share:${uuidv7()}`;
  stageComposerAttachments(key, attachments);
  return key;
}
