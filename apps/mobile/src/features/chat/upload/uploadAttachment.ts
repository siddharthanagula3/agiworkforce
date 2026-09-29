import { api, type UploadFileInput, type UploadFileResult } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { useUploadLifecycleStore } from './uploadLifecycle';

const MAX_UPLOAD_RETRIES = 2;

function backoffMs(attempt: number): number {
  return 1000 * Math.pow(2, attempt);
}

export function unsentAttachmentMessage(fileNames: string[]): string {
  const named = fileNames.map((name) => `“${name}”`).join(', ');
  return fileNames.length === 1
    ? `${named} did not finish uploading, so nothing was sent. Tap Retry on the file, or remove it and send again.`
    : `${named} did not finish uploading, so nothing was sent. Tap Retry on each file, or remove them and send again.`;
}

export interface UploadChatContext {
  conversationId?: string;
  temporary?: boolean;
}

function isRefusal(error: Error): boolean {
  return (
    error instanceof ApiHttpError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

export async function uploadWithRetry(
  file: UploadFileInput,
  fileName: string,
  attachmentId: string,
  context: UploadChatContext = {},
): Promise<UploadFileResult | null> {
  let lastError: Error | null = null;
  const accountEpoch = captureCloudAccountEpoch();
  if (!isCloudAccountEpochCurrent(accountEpoch)) return null;

  for (let attempt = 0; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    if (!isCloudAccountEpochCurrent(accountEpoch)) return null;
    const signal = useUploadLifecycleStore.getState().begin(attachmentId);
    try {
      const result = await api.uploadFile(file, {
        signal,
        ...(context.conversationId ? { conversationId: context.conversationId } : {}),
        ...(context.temporary ? { temporary: true } : {}),
        onProgress: (sent, total) =>
          useUploadLifecycleStore.getState().reportProgress(attachmentId, sent, total),
      });
      if (!isCloudAccountEpochCurrent(accountEpoch)) return null;
      useUploadLifecycleStore.getState().settle(attachmentId, 'done');
      return result;
    } catch (err) {
      if (!isCloudAccountEpochCurrent(accountEpoch)) return null;
      lastError = err instanceof Error ? err : new Error(String(err));
      // A cancel and a backgrounded upload both abort the signal; neither is a
      // transient failure, so neither is retried behind the user's back.
      if (signal.aborted || lastError.name === 'AbortError') {
        useUploadLifecycleStore.getState().settle(attachmentId, 'canceled');
        return null;
      }
      if (lastError.message.includes('session expired') || lastError.message.includes('401')) {
        useUploadLifecycleStore
          .getState()
          .settle(attachmentId, 'failed', 'Your session expired. Sign in again to upload files.');
        throw lastError;
      }
      if (isRefusal(lastError)) {
        useUploadLifecycleStore.getState().settle(attachmentId, 'failed', lastError.message);
        return null;
      }
      if (attempt < MAX_UPLOAD_RETRIES) {
        await new Promise<void>((resolve) => setTimeout(resolve, backoffMs(attempt)));
      }
    }
  }

  useUploadLifecycleStore
    .getState()
    .settle(
      attachmentId,
      'failed',
      `Could not upload "${fileName}". Check your connection and try again.`,
    );
  return null;
}
