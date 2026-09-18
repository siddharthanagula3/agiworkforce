import { api, type UploadFileInput, type UploadFileResult } from '@/services/api';
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

export async function uploadWithRetry(
  file: UploadFileInput,
  fileName: string,
  attachmentId: string,
): Promise<UploadFileResult | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    const signal = useUploadLifecycleStore.getState().begin(attachmentId);
    try {
      const result = await api.uploadFile(file, {
        signal,
        onProgress: (sent, total) =>
          useUploadLifecycleStore.getState().reportProgress(attachmentId, sent, total),
      });
      useUploadLifecycleStore.getState().settle(attachmentId, 'done');
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // A cancel and a backgrounded upload both abort the signal; neither is a
      // transient failure, so neither is retried behind the user's back.
      if (signal.aborted || lastError.name === 'AbortError') {
        useUploadLifecycleStore.getState().settle(attachmentId, 'canceled');
        return null;
      }
      if (lastError.message.includes('session expired') || lastError.message.includes('401')) {
        useUploadLifecycleStore.getState().settle(attachmentId, 'failed', lastError.message);
        throw lastError;
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
      lastError?.message ?? `Could not upload "${fileName}". Check your connection and try again.`,
    );
  return null;
}
