import { sha256 } from '@noble/hashes/sha256';
import {
  EncodingType,
  FileSystemUploadType,
  cacheDirectory,
  createUploadTask,
  deleteAsync,
  readAsStringAsync,
  writeAsStringAsync,
  type UploadTask,
} from 'expo-file-system/legacy';
import {
  RESUMABLE_UPLOAD_PART_BYTES,
  createManagedCloudResumableUploadClient,
  isResumableUploadUnavailable,
  type ManagedCloudChatAttachment,
  type ResumableUploadPart,
  type ResumableUploadSessionStore,
} from '@agiworkforce/cloud-contracts';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';

export interface PartedChatUploadInput {
  uri: string;
  fileName: string;
  mimeType: string;
  byteCount: number;
  baseUrl: string;
  fetchImpl: typeof globalThis.fetch;
  getHeaders: () => Promise<Record<string, string>>;
  assertCurrent: () => void;
  trackTask: (task: UploadTask) => () => void;
  signal: AbortSignal;
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  conversationId?: string;
  temporary?: boolean;
}

const openSessions = new Map<string, string>();

/**
 * Held for the life of the app process, so a retry after a failed part
 * resumes from the parts storage already holds instead of starting over.
 */
export const partedChatUploadSessions: ResumableUploadSessionStore = {
  read: (fingerprint) => openSessions.get(fingerprint) ?? null,
  write: (fingerprint, value) => {
    openSessions.set(fingerprint, value);
  },
  remove: (fingerprint) => {
    openSessions.delete(fingerprint);
  },
};

function abortError(): Error {
  const error = new Error('The attachment upload was cancelled.');
  error.name = 'AbortError';
  return error;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function readRange(uri: string, start: number, end: number): Promise<string> {
  return readAsStringAsync(uri, {
    encoding: EncodingType.Base64,
    position: start,
    length: end - start,
  });
}

export async function sha256HexOfFile(
  uri: string,
  byteCount: number,
  assertCurrent: () => void,
  signal: AbortSignal,
): Promise<string> {
  const hasher = sha256.create();
  for (let start = 0; start < byteCount; start += RESUMABLE_UPLOAD_PART_BYTES) {
    if (signal.aborted) throw abortError();
    const chunk = await readRange(
      uri,
      start,
      Math.min(start + RESUMABLE_UPLOAD_PART_BYTES, byteCount),
    );
    assertCurrent();
    hasher.update(base64ToBytes(chunk));
  }
  return Array.from(hasher.digest())
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sendPartFromFile(
  input: PartedChatUploadInput,
  part: ResumableUploadPart,
  onSent: (sentBytes: number) => void,
): Promise<number> {
  if (part.signal?.aborted) throw abortError();
  if (!cacheDirectory) throw new Error(`"${input.fileName}" could not be prepared on this device.`);
  const bytes = await readRange(input.uri, part.start, part.end);
  input.assertCurrent();
  const partUri = `${cacheDirectory}chat-upload-part-${uuidv7()}.bin`;
  await writeAsStringAsync(partUri, bytes, { encoding: EncodingType.Base64 });
  try {
    if (part.signal?.aborted) throw abortError();
    const task = createUploadTask(
      part.url,
      partUri,
      {
        httpMethod: part.method,
        uploadType: FileSystemUploadType.BINARY_CONTENT,
        headers: part.headers,
      },
      (progress) => onSent(progress.totalBytesSent),
    );
    const untrack = input.trackTask(task);
    const cancel = () => {
      void task.cancelAsync().catch(() => undefined);
    };
    part.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const result = await task.uploadAsync();
      if (part.signal?.aborted) throw abortError();
      input.assertCurrent();
      if (!result) throw new Error(`Part ${part.partNumber} of "${input.fileName}" was not sent.`);
      return result.status;
    } finally {
      part.signal?.removeEventListener('abort', cancel);
      untrack();
    }
  } finally {
    await deleteAsync(partUri, { idempotent: true }).catch(() => undefined);
  }
}

/**
 * Uploads a chat attachment in parts straight from the file on disk, one part
 * in memory at a time. Resolves to null when the server cannot take parted
 * uploads, so the caller sends the file in one request instead.
 */
export async function uploadChatAttachmentInParts(
  input: PartedChatUploadInput,
): Promise<ManagedCloudChatAttachment | null> {
  const { byteCount, signal } = input;
  const checksumSha256 = await sha256HexOfFile(input.uri, byteCount, input.assertCurrent, signal);
  let storedBytes = 0;
  const report = (inFlightBytes: number) =>
    input.onProgress?.(Math.min(storedBytes + inFlightBytes, byteCount), byteCount);
  const client = createManagedCloudResumableUploadClient({
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    assertCurrent: input.assertCurrent,
    getHeaders: input.getHeaders,
    sessions: partedChatUploadSessions,
    sendPart: (part) => sendPartFromFile(input, part, report),
  });
  try {
    const completed = await client.upload({
      file: { size: byteCount },
      request: {
        kind: 'chat-attachment',
        fileName: input.fileName,
        mimeType: input.mimeType,
        byteCount,
        checksumSha256,
      },
      completion: {
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.temporary ? { temporary: true } : {}),
      },
      signal,
      onStored: (bytes) => {
        storedBytes = bytes;
        report(0);
      },
    });
    if (completed.kind !== 'chat-attachment') {
      throw new Error(`Could not verify "${input.fileName}".`);
    }
    return completed.attachment;
  } catch (error) {
    if (isResumableUploadUnavailable(error)) return null;
    throw error;
  }
}
