/**
 * MessageGeneratedFiles — renders a message's `generatedFiles` (files the
 * model created in the managed-cloud E2B sandbox, delivered via the
 * `x_generated_files` SSE delta) as shared `GeneratedFileCard`s with a
 * working Download action.
 *
 * Auth: the bytes live behind the authenticated `/api/files/{id}` route.
 * Hosts that need explicit auth (desktop Tauri → Bearer JWT) provide
 * `ChatHostBridge.fetchCloudFile`; without it we fall back to a same-origin
 * fetch where session cookies apply (embedded web build). Failures surface
 * as an inline error line — no silent no-op buttons.
 *
 * Cloud mode only: local runtimes never emit `generated_files` events, so
 * this section never renders for Local chats.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  summarizeGeneratedFileBundle,
  type GeneratedFile,
  type GeneratedFileKind,
} from '@agiworkforce/types';
import type { ChatMessage, GeneratedFileEntry } from '../lib/types';
import { useHostBridge } from '../lib/hostBridge';
import { GeneratedFileCard } from './GeneratedFileCard';

const GENERATED_FILE_KINDS: ReadonlySet<string> = new Set([
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'csv',
  'json',
  'markdown',
  'html',
  'image',
  'archive',
  'other',
]);

/** Map one UI entry onto the suite-contract `GeneratedFile` the shared
 *  presentation helper consumes (mirrors mobile's chatExecutionStore map). */
export function generatedFileFromEntry(
  entry: GeneratedFileEntry,
  createdAt: string,
): GeneratedFile {
  const kind: GeneratedFileKind = GENERATED_FILE_KINDS.has(entry.kind)
    ? (entry.kind as GeneratedFileKind)
    : 'other';
  return {
    id: entry.id,
    // Sandbox sessions are server-internal; the presentation layer treats
    // these as absent and falls back to file-level labels.
    computeSessionId: '',
    ownerUserId: '',
    sourceSurface: 'web',
    privacyMode: 'managed',
    providerMode: 'ManagedGateway',
    kind,
    fileName: entry.fileName,
    mimeType: entry.mimeType,
    uri: entry.uri,
    byteCount: entry.byteCount,
    checksumSha256: entry.checksumSha256 ?? '',
    previewDerivatives: [],
    createdAt,
  };
}

async function fetchFileBlob(
  uri: string,
  fetchCloudFile?: (uri: string) => Promise<Blob>,
): Promise<Blob> {
  if (fetchCloudFile) return fetchCloudFile(uri);
  const res = await fetch(uri, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

export interface MessageGeneratedFilesProps {
  message: Pick<ChatMessage, 'generatedFiles' | 'createdAt' | 'timestamp'>;
}

export function MessageGeneratedFiles({ message }: MessageGeneratedFilesProps) {
  const hostBridge = useHostBridge();
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});

  const files = message.generatedFiles ?? [];
  const createdAt = message.createdAt ?? message.timestamp ?? new Date().toISOString();

  const presentations = useMemo(
    () =>
      files.map((entry) => ({
        entry,
        presentation: summarizeGeneratedFileBundle({
          generatedFile: generatedFileFromEntry(entry, createdAt),
          // Files only arrive on the wire after the server persisted them.
          fallbackStatus: 'completed',
        }),
      })),
    [files, createdAt],
  );

  const handleDownload = useCallback(
    async (entry: GeneratedFileEntry) => {
      setDownloadErrors((prev) => {
        if (!(entry.id in prev)) return prev;
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });
      try {
        const blob = await fetchFileBlob(entry.uri, hostBridge?.fetchCloudFile);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = entry.fileName;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        setDownloadErrors((prev) => ({
          ...prev,
          [entry.id]: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [hostBridge],
  );

  if (presentations.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-2" data-testid="message-generated-files">
      {presentations.map(({ entry, presentation }) => (
        <div key={entry.id} className="flex flex-col gap-1">
          <GeneratedFileCard
            presentation={presentation}
            onDownload={() => void handleDownload(entry)}
          />
          {downloadErrors[entry.id] ? (
            <span
              role="alert"
              className="text-[11px] text-[var(--chat-error,#f43f5e)]"
              data-testid="generated-file-download-error"
            >
              Download failed: {downloadErrors[entry.id]}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
