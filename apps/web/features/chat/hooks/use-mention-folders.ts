'use client';

import { useEffect, useMemo, useState } from 'react';
import type { WorkspaceRoot } from '@agiworkforce/local-runtime-contract';
import { resolveChatAttachmentMimeType } from '@/lib/chat-attachment-policy';
import {
  listWorkspaceFiles,
  listWorkspaceRoots,
  readWorkspaceFile,
} from '@/features/desktop-host/lib/runtime-client';

const MENTION_FOLDER_LIMIT = 5;
const ROOT_SEGMENT = '';

export interface FolderMentionRead {
  files: File[];
  leftOut: number;
  unreadable: number;
}

export function useMentionFolders(enabled: boolean, query: string): WorkspaceRoot[] {
  const [roots, setRoots] = useState<WorkspaceRoot[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    listWorkspaceRoots()
      .then((next) => {
        if (!cancelled) setRoots(next);
      })
      .catch(() => {
        if (!cancelled) setRoots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return useMemo(() => {
    if (!enabled) return [];
    const needle = query.trim().toLowerCase();
    return roots
      .filter((root) => !needle || root.name.toLowerCase().includes(needle))
      .slice(0, MENTION_FOLDER_LIMIT);
  }, [enabled, query, roots]);
}

export async function readFolderForMention(
  root: WorkspaceRoot,
  limit: number,
): Promise<FolderMentionRead> {
  const entries = await listWorkspaceFiles(root.id, ROOT_SEGMENT);
  const attachable = entries.flatMap((entry) => {
    if (entry.kind !== 'file') return [];
    const mimeType = resolveChatAttachmentMimeType(entry.name, ROOT_SEGMENT);
    return mimeType ? [{ entry, mimeType }] : [];
  });
  const chosen = attachable.slice(0, Math.max(0, limit));
  const reads = await Promise.allSettled(
    chosen.map(({ entry, mimeType }) => readWorkspaceFile(root.id, entry, mimeType)),
  );
  const files = reads.flatMap((read) => (read.status === 'fulfilled' ? [read.value] : []));
  return {
    files,
    leftOut: attachable.length - chosen.length,
    unreadable: chosen.length - files.length,
  };
}
