import { api, type UploadFileInput, type UploadFileResult } from '@/services/api';
import {
  ApiHttpError,
  CloudCredentialUnavailableError,
  UPLOAD_ACCOUNT_UNCONFIRMED_MESSAGE,
} from '@/services/apiErrors';
import { ensureCloudSendConsent } from '@/services/llmGate';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { useUploadLifecycleStore } from './uploadLifecycle';

const MAX_UPLOAD_RETRIES = 2;

function backoffMs(attempt: number): number {
  return 1000 * Math.pow(2, attempt);
}

function waitForBackoff(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
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
  let signal = useUploadLifecycleStore.getState().begin(attachmentId);
  try {
    await ensureCloudSendConsent();
  } catch (error) {
    if (signal.aborted) return null;
    const message = error instanceof Error ? error.message : String(error);
    useUploadLifecycleStore.getState().settle(attachmentId, 'failed', message);
    return null;
  }
  if (signal.aborted) return null;

  for (let attempt = 0; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    if (!isCloudAccountEpochCurrent(accountEpoch)) return null;
    if (attempt > 0) signal = useUploadLifecycleStore.getState().begin(attachmentId);
    try {
      const result = await api.uploadFile(file, {
        signal,
        ...(context.conversationId ? { conversationId: context.conversationId } : {}),
        ...(context.temporary ? { temporary: true } : {}),
        onProgress: (sent, total) =>
          useUploadLifecycleStore.getState().reportProgress(attachmentId, sent, total),
      });
      if (!isCloudAccountEpochCurrent(accountEpoch) || signal.aborted) return null;
      useUploadLifecycleStore.getState().settle(attachmentId, 'done');
      return result;
    } catch (err) {
      if (!isCloudAccountEpochCurrent(accountEpoch)) return null;
      lastError = err instanceof Error ? err : new Error(String(err));
      // Whatever aborted the signal (cancel, remove, a newer attempt) already
      // owns the lifecycle entry, so settling here would overwrite its state.
      if (signal.aborted) return null;
      if (lastError.name === 'AbortError') {
        useUploadLifecycleStore.getState().settle(attachmentId, 'canceled');
        return null;
      }
      if (lastError instanceof CloudCredentialUnavailableError) {
        useUploadLifecycleStore
          .getState()
          .settle(attachmentId, 'failed', UPLOAD_ACCOUNT_UNCONFIRMED_MESSAGE);
        throw lastError;
      }
      if (isRefusal(lastError)) {
        useUploadLifecycleStore.getState().settle(attachmentId, 'failed', lastError.message);
        return null;
      }
      if (attempt < MAX_UPLOAD_RETRIES) {
        await waitForBackoff(backoffMs(attempt), signal);
        if (signal.aborted) return null;
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
