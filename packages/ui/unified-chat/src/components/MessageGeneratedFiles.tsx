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
 * as an inline error line with a Retry action — no silent no-op buttons.
 *
 * Live execution state: while an E2B execution tool (`execute_code` /
 * `write_file` / `create_folder`, surfaced through the message's running
 * `toolCalls`) is still running and no files have arrived yet, an honest
 * pending strip ("Running code…") renders in place of the cards. It never
 * claims a file exists — it is replaced by real cards when
 * `x_generated_files` lands, or disappears when the turn ends without files.
 *
 * Cloud mode only: local runtimes never emit `generated_files` events, so
 * this section never renders for Local chats.
 */

import { useCallback, useMemo, useState } from 'react';
import { Download, Loader2, RotateCcw } from 'lucide-react';
import {
  summarizeGeneratedFileBundle,
  type GeneratedFile,
  type GeneratedFileKind,
} from '@agiworkforce/types';
import { Button } from '@agiworkforce/ui';
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

/**
 * E2B sandbox execution tools that can produce generated files. Mirrors
 * `EXECUTION_TOOLS` in `apps/web/lib/e2b/execution-tools.ts` — the server's
 * tool loop routes exactly these names into the sandbox.
 */
const EXECUTION_TOOL_NAMES: ReadonlySet<string> = new Set([
  'execute_code',
  'write_file',
  'create_folder',
]);

/** Honest per-tool activity labels — none of them claims a file exists yet. */
const EXECUTION_TOOL_LABELS: Readonly<Record<string, string>> = {
  execute_code: 'Running code…',
  write_file: 'Writing file…',
  create_folder: 'Preparing workspace…',
};

/**
 * The message shape this component needs. `toolCalls` + `isStreaming` drive
 * the pending execution strip; the rest drives the file cards.
 */
export type MessageGeneratedFilesMessage = Pick<
  ChatMessage,
  'generatedFiles' | 'createdAt' | 'timestamp' | 'toolCalls' | 'isStreaming'
>;

/**
 * True while the message is still streaming and an E2B execution tool is
 * running (or queued) on it. Hosts/MessageBubble use this to decide whether
 * the generated-files section should render before any file has arrived.
 */
export function hasRunningExecutionTool(message: MessageGeneratedFilesMessage): boolean {
  if (!message.isStreaming) return false;
  return (message.toolCalls ?? []).some(
    (tc) =>
      EXECUTION_TOOL_NAMES.has(tc.name) && (tc.status === 'running' || tc.status === 'pending'),
  );
}

/** Label for the most recent running execution tool ("Running code…" etc). */
function runningExecutionLabel(message: MessageGeneratedFilesMessage): string {
  const running = (message.toolCalls ?? []).filter(
    (tc) =>
      EXECUTION_TOOL_NAMES.has(tc.name) && (tc.status === 'running' || tc.status === 'pending'),
  );
  const latest = running[running.length - 1];
  return (latest && EXECUTION_TOOL_LABELS[latest.name]) || 'Running code…';
}

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
  message: MessageGeneratedFilesMessage;
}

export function MessageGeneratedFiles({ message }: MessageGeneratedFilesProps) {
  const hostBridge = useHostBridge();
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  // File ids with a download currently in flight — retry buttons disable
  // while their file is downloading so a failing path can't be spammed.
  const [inFlightIds, setInFlightIds] = useState<Record<string, true>>({});
  const [downloadingAll, setDownloadingAll] = useState(false);

  const files = useMemo(() => message.generatedFiles ?? [], [message.generatedFiles]);
  const createdAt = useMemo(
    () => message.createdAt ?? message.timestamp ?? new Date().toISOString(),
    [message.createdAt, message.timestamp],
  );
  const executionRunning = hasRunningExecutionTool(message);

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
      setInFlightIds((prev) => ({ ...prev, [entry.id]: true }));
      try {
        const blob = await fetchFileBlob(entry.uri, hostBridge?.fetchCloudFile);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = entry.fileName;
        a.click();
        URL.revokeObjectURL(url);
        // Clear a previous failure only once the retry actually succeeded —
        // keeping the error (and its disabled Retry) visible while in flight.
        setDownloadErrors((prev) => {
          if (!(entry.id in prev)) return prev;
          const next = { ...prev };
          delete next[entry.id];
          return next;
        });
      } catch (err) {
        setDownloadErrors((prev) => ({
          ...prev,
          [entry.id]: err instanceof Error ? err.message : String(err),
        }));
      } finally {
        setInFlightIds((prev) => {
          const next = { ...prev };
          delete next[entry.id];
          return next;
        });
      }
    },
    [hostBridge],
  );

  // "Download all": sequentially re-uses the SAME per-file download path —
  // no bundling backend, no new network routes. Per-file failures surface on
  // their own error lines.
  const handleDownloadAll = useCallback(async () => {
    setDownloadingAll(true);
    try {
      for (const entry of files) {
        await handleDownload(entry);
      }
    } finally {
      setDownloadingAll(false);
    }
  }, [files, handleDownload]);

  if (presentations.length === 0) {
    // Honest pending state: execution is running but no file exists yet.
    if (executionRunning) {
      return (
        <div
          data-testid="generated-files-pending"
          className="mt-2 flex items-center gap-2 rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-3 text-xs text-[var(--chat-text-muted)]"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          <span>{runningExecutionLabel(message)}</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="mt-2 flex flex-col gap-2" data-testid="message-generated-files">
      {presentations.length >= 2 ? (
        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleDownloadAll()}
            disabled={downloadingAll}
            aria-label="Download all generated files"
            className="h-7 gap-1.5 text-xs text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
          >
            {downloadingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden />
            )}
            Download all
          </Button>
        </div>
      ) : null}
      {presentations.map(({ entry, presentation }) => (
        <div key={entry.id} className="flex flex-col gap-1">
          <GeneratedFileCard
            presentation={presentation}
            onDownload={() => void handleDownload(entry)}
          />
          {downloadErrors[entry.id] ? (
            <div className="flex items-center gap-2">
              <span
                role="alert"
                className="text-[11px] text-[var(--chat-error,#f43f5e)]"
                data-testid="generated-file-download-error"
              >
                Download failed: {downloadErrors[entry.id]}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleDownload(entry)}
                disabled={Boolean(inFlightIds[entry.id]) || downloadingAll}
                aria-label={`Retry download of ${entry.fileName}`}
                className="h-6 gap-1 px-2 text-[11px] text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                Retry
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
