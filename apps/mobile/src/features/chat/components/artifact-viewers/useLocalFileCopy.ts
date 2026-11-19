import { useCallback, useEffect, useState } from 'react';
import { getInfoAsync } from 'expo-file-system/legacy';
import { ApiHttpError } from '@/services/apiErrors';
import { downloadGeneratedFile, viewerFileCopy } from '@/services/fileCreation';
import { toUserMessage } from '@/services/userMessage';
import { captureCloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';

export type LocalFileCopy =
  | { status: 'loading' }
  | { status: 'ready'; uri: string }
  | { status: 'failed'; message: string; retryable: boolean };

export const FILE_UNAVAILABLE_MESSAGE = 'This file could not be opened. Check your connection.';

const TOO_LARGE_FOR_THIS_DEVICE_STATUS = 413;

function answersTheSameAgain(error: unknown): boolean {
  return error instanceof ApiHttpError && error.status === TOO_LARGE_FOR_THIS_DEVICE_STATUS;
}

const copies = new Map<string, Promise<string>>();
const viewing = new Map<string, Promise<string>>();

function copyKey(url: string, fileName: string): string {
  const account = captureCloudAccountEpoch();
  const scope = account ? `${account.ownerId}:${account.epoch}` : 'signed-out';
  return [scope, url, fileName].join('\u0000');
}

async function stillOnDevice(uri: string): Promise<boolean> {
  try {
    return (await getInfoAsync(uri)).exists;
  } catch {
    return false;
  }
}

/**
 * One exported copy per file and account for the session, so sharing a file again does not
 * fetch it again. Exports live in the cache, which the system or Clear cache can empty, so a
 * remembered copy is used only while its file is still there.
 */
export async function localFileCopy(url: string, fileName: string): Promise<string> {
  if (url.startsWith('file://')) return url;
  const key = copyKey(url, fileName);
  const existing = copies.get(key);
  if (existing) {
    const uri = await existing.catch(() => null);
    if (uri !== null && (await stillOnDevice(uri))) return uri;
    const current = copies.get(key);
    if (current && current !== existing) return current;
    copies.delete(key);
  }
  const pending = downloadGeneratedFile(url, fileName);
  copies.set(key, pending);
  pending.catch(() => {
    if (copies.get(key) === pending) copies.delete(key);
  });
  return pending;
}

function viewingCopy(url: string, fileName: string): Promise<string> {
  if (url.startsWith('file://')) return Promise.resolve(url);
  const key = copyKey(url, fileName);
  const inFlight = viewing.get(key);
  if (inFlight) return inFlight;
  const pending = viewerFileCopy(url, fileName).finally(() => {
    if (viewing.get(key) === pending) viewing.delete(key);
  });
  viewing.set(key, pending);
  return pending;
}

export function useLocalFileCopy(
  url: string,
  fileName: string,
): {
  copy: LocalFileCopy;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [copy, setCopy] = useState<LocalFileCopy>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    setCopy({ status: 'loading' });
    viewingCopy(url, fileName).then(
      (uri) => {
        if (live) setCopy({ status: 'ready', uri });
      },
      (error: unknown) => {
        if (live) {
          setCopy({
            status: 'failed',
            message: toUserMessage(error, FILE_UNAVAILABLE_MESSAGE),
            retryable: !answersTheSameAgain(error),
          });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [url, fileName, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { copy, retry };
}
