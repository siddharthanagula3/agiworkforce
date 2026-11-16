import { useCallback, useEffect, useState } from 'react';
import { downloadGeneratedFile, viewerFileCopy } from '@/services/fileCreation';
import { toUserMessage } from '@/services/userMessage';
import { captureCloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';

export type LocalFileCopy =
  { status: 'loading' } | { status: 'ready'; uri: string } | { status: 'failed'; message: string };

export const FILE_UNAVAILABLE_MESSAGE = 'This file could not be opened. Check your connection.';

const copies = new Map<string, Promise<string>>();
const viewing = new Map<string, Promise<string>>();

function copyKey(url: string, fileName: string): string {
  const account = captureCloudAccountEpoch();
  const scope = account ? `${account.ownerId}:${account.epoch}` : 'signed-out';
  return [scope, url, fileName].join('\u0000');
}

/** One exported copy per file and account for the session, so sharing a file again does not fetch it again. */
export function localFileCopy(url: string, fileName: string): Promise<string> {
  if (url.startsWith('file://')) return Promise.resolve(url);
  const key = copyKey(url, fileName);
  const existing = copies.get(key);
  if (existing) return existing;
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
          setCopy({ status: 'failed', message: toUserMessage(error, FILE_UNAVAILABLE_MESSAGE) });
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
