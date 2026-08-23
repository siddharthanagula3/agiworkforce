import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, FileQuestion, Loader2, RotateCcw } from 'lucide-react';
import {
  PRIVACY_MODES,
  PROVIDER_MODES,
  detectProviderFromModelId,
  getProviderSurface,
  providerModeToPrivacyMode,
  providerSurfaceToProviderMode,
  summarizeGeneratedFileBundle,
  type GeneratedFile,
  type GeneratedFileKind,
  type PrivacyMode,
  type ProviderMode,
} from '@agiworkforce/types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@agiworkforce/ui';
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

const MAX_TEXT_PREVIEW_CHARACTERS = 500_000;

type PreviewKind = 'pdf' | 'image' | 'text' | 'unsupported';

type PreviewState =
  | { status: 'idle' | 'loading' | 'unsupported' }
  | { status: 'ready'; kind: Exclude<PreviewKind, 'unsupported'>; content: string }
  | { status: 'error'; error: string };

function previewKindFor(entry: GeneratedFileEntry): PreviewKind {
  const mimeType = entry.mimeType.toLowerCase().split(';', 1)[0]?.trim() ?? '';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/svg+xml') return 'text';
  if (mimeType.startsWith('image/')) return 'image';
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/ld+json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/yaml' ||
    mimeType === 'application/x-yaml'
  ) {
    return 'text';
  }
  return 'unsupported';
}

function truncateTextPreview(text: string): string {
  if (text.length <= MAX_TEXT_PREVIEW_CHARACTERS) return text;
  return `${text.slice(0, MAX_TEXT_PREVIEW_CHARACTERS)}\n\n[Preview truncated. Download the file to view the rest.]`;
}

const EXECUTION_TOOL_NAMES: ReadonlySet<string> = new Set([
  'execute_code',
  'write_file',
  'create_folder',
]);

const EXECUTION_TOOL_LABELS: Readonly<Record<string, string>> = {
  execute_code: 'Running code…',
  write_file: 'Writing file…',
  create_folder: 'Preparing workspace…',
};

export type MessageGeneratedFilesMessage = Pick<
  ChatMessage,
  'generatedFiles' | 'createdAt' | 'timestamp' | 'toolCalls' | 'isStreaming' | 'metadata' | 'model'
>;

export interface GeneratedFileTrustBoundary {
  privacyMode: PrivacyMode;
  providerMode: ProviderMode;
}

const PROVIDER_MODE_BY_PRIVACY_MODE = {
  local: 'Local',
  byok: 'DirectByok',
  managed: 'ManagedGateway',
} as const satisfies Record<PrivacyMode, ProviderMode>;

const PRIVACY_MODE_PRECEDENCE = [
  'local',
  'byok',
  'managed',
] as const satisfies readonly PrivacyMode[];

function privacyModeForProvider(provider: string | null | undefined): PrivacyMode | undefined {
  if (!provider) return undefined;
  const providerMode = providerSurfaceToProviderMode(getProviderSurface(provider));
  return providerMode ? providerModeToPrivacyMode(providerMode) : undefined;
}

function privacyModeForModel(model: string | null | undefined): PrivacyMode | undefined {
  if (!model) return undefined;
  // A model id the catalog does not carry still names its provider in the
  // prefix (`ollama/…`, `open_router/…`), which for an unlabeled local or BYOK
  // turn is the only boundary signal there is.
  return privacyModeForProvider(detectProviderFromModelId(model) ?? model.split('/')[0]);
}

export interface GeneratedFileOriginSignals {
  privacyMode?: unknown;
  providerMode?: unknown;
  provider?: string | null;
  model?: string | null;
}

/**
 * SECURITY-FIX F3 (CWE-863): every generated-file descriptor used to claim
 * `managed`/`ManagedGateway`, so a file produced on a Local or BYOK turn showed
 * a "Managed" privacy chip — the label a user reads to know where the bytes
 * went. Only a cross-boundary handoff writes `privacyMode`, so an ordinary
 * Local or BYOK turn carries none and has to be classified from the labels and
 * the provider/model it does carry. The most restrictive observed signal wins,
 * so an unlabeled turn served by a local model can never read as managed, and
 * the returned pair stays internally consistent so a stale providerMode cannot
 * contradict the privacy mode.
 */
export function generatedFileTrustBoundary(
  signals: GeneratedFileOriginSignals,
): GeneratedFileTrustBoundary {
  const providerMode = (PROVIDER_MODES as readonly string[]).includes(
    signals.providerMode as string,
  )
    ? (signals.providerMode as ProviderMode)
    : undefined;

  const observed: readonly (PrivacyMode | undefined)[] = [
    (PRIVACY_MODES as readonly string[]).includes(signals.privacyMode as string)
      ? (signals.privacyMode as PrivacyMode)
      : undefined,
    providerMode ? providerModeToPrivacyMode(providerMode) : undefined,
    privacyModeForProvider(signals.provider),
    privacyModeForModel(signals.model),
  ];
  const privacyMode = PRIVACY_MODE_PRECEDENCE.find((mode) => observed.includes(mode)) ?? 'managed';

  return {
    privacyMode,
    providerMode:
      providerMode && providerModeToPrivacyMode(providerMode) === privacyMode
        ? providerMode
        : PROVIDER_MODE_BY_PRIVACY_MODE[privacyMode],
  };
}

export function messageTrustBoundary(
  metadata: ChatMessage['metadata'],
  model?: string,
): GeneratedFileTrustBoundary {
  const metadataModel = metadata?.['model'];
  return generatedFileTrustBoundary({
    privacyMode: metadata?.['privacyMode'],
    providerMode: metadata?.['providerMode'],
    model: model ?? (typeof metadataModel === 'string' ? metadataModel : null),
  });
}

export function hasRunningExecutionTool(message: MessageGeneratedFilesMessage): boolean {
  if (!message.isStreaming) return false;
  return (message.toolCalls ?? []).some(
    (tc) =>
      EXECUTION_TOOL_NAMES.has(tc.name) && (tc.status === 'running' || tc.status === 'pending'),
  );
}

function runningExecutionLabel(message: MessageGeneratedFilesMessage): string {
  const running = (message.toolCalls ?? []).filter(
    (tc) =>
      EXECUTION_TOOL_NAMES.has(tc.name) && (tc.status === 'running' || tc.status === 'pending'),
  );
  const latest = running[running.length - 1];
  return (latest && EXECUTION_TOOL_LABELS[latest.name]) || 'Running code…';
}

export function generatedFileFromEntry(
  entry: GeneratedFileEntry,
  createdAt: string,
  trustBoundary: GeneratedFileTrustBoundary = messageTrustBoundary(undefined),
): GeneratedFile {
  const kind: GeneratedFileKind = GENERATED_FILE_KINDS.has(entry.kind)
    ? (entry.kind as GeneratedFileKind)
    : 'other';
  return {
    id: entry.id,
    computeSessionId: '',
    ownerUserId: '',
    sourceSurface: 'web',
    privacyMode: trustBoundary.privacyMode,
    providerMode: trustBoundary.providerMode,
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
  const [inFlightIds, setInFlightIds] = useState<Record<string, true>>({});
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<GeneratedFileEntry | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [previewState, setPreviewState] = useState<PreviewState>({ status: 'idle' });

  const files = useMemo(() => message.generatedFiles ?? [], [message.generatedFiles]);
  const createdAt = useMemo(
    () => message.createdAt ?? message.timestamp ?? new Date().toISOString(),
    [message.createdAt, message.timestamp],
  );
  const executionRunning = hasRunningExecutionTool(message);
  const trustBoundary = useMemo(
    () => messageTrustBoundary(message.metadata, message.model),
    [message.metadata, message.model],
  );

  const presentations = useMemo(
    () =>
      files.map((entry) => {
        const presentation = summarizeGeneratedFileBundle({
          generatedFile: generatedFileFromEntry(entry, createdAt, trustBoundary),
          fallbackStatus: 'completed',
        });
        return {
          entry,
          presentation: { ...presentation, canPreview: entry.previewable === true },
        };
      }),
    [files, createdAt, trustBoundary],
  );

  const closePreview = useCallback(() => {
    setPreviewEntry(null);
    setPreviewState({ status: 'idle' });
  }, []);

  const openPreview = useCallback((entry: GeneratedFileEntry) => {
    setPreviewEntry(entry);
    setPreviewAttempt(0);
    setPreviewState(
      previewKindFor(entry) === 'unsupported' ? { status: 'unsupported' } : { status: 'loading' },
    );
  }, []);

  useEffect(() => {
    if (!previewEntry) return;

    const kind = previewKindFor(previewEntry);
    if (kind === 'unsupported') {
      setPreviewState({ status: 'unsupported' });
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setPreviewState({ status: 'loading' });

    void (async () => {
      try {
        const blob = await fetchFileBlob(previewEntry.uri, hostBridge?.fetchCloudFile);
        if (cancelled) return;

        const actualMimeType = blob.type.toLowerCase().split(';', 1)[0]?.trim() ?? '';
        if (kind === 'pdf' && actualMimeType !== 'application/pdf') {
          throw new Error('The downloaded file was not a valid PDF response.');
        }
        if (kind === 'image' && !actualMimeType.startsWith('image/')) {
          throw new Error('The downloaded file was not a valid image response.');
        }

        if (kind === 'text') {
          const text = truncateTextPreview(await blob.text());
          if (!cancelled) setPreviewState({ status: 'ready', kind, content: text });
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setPreviewState({ status: 'ready', kind, content: objectUrl });
      } catch (error) {
        if (!cancelled) {
          setPreviewState({
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hostBridge?.fetchCloudFile, previewAttempt, previewEntry]);

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
            onPreview={entry.previewable === true ? () => openPreview(entry) : undefined}
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

      <Dialog
        open={previewEntry !== null}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <DialogContent className="w-[min(96vw,64rem)] max-w-none overflow-hidden p-0">
          <div className="grid max-h-[calc(100vh-2rem)] min-h-[24rem] grid-rows-[auto,1fr,auto]">
            <DialogHeader className="border-b border-[var(--chat-border)] px-6 py-4">
              <DialogTitle className="truncate pr-8">
                {previewEntry?.fileName ?? 'Generated file preview'}
              </DialogTitle>
              <DialogDescription>
                Safe preview of a generated file. Active HTML and SVG content is shown as source.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 overflow-auto bg-[var(--chat-surface-overlay)] p-4">
              {previewState.status === 'loading' ? (
                <div className="flex h-full min-h-72 items-center justify-center gap-2 text-sm text-[var(--chat-text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading preview…
                </div>
              ) : null}

              {previewState.status === 'unsupported' ? (
                <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-center">
                  <FileQuestion className="h-10 w-10 text-[var(--chat-text-muted)]" aria-hidden />
                  <div>
                    <h3 className="text-base font-medium text-[var(--chat-text-primary)]">
                      Preview unavailable
                    </h3>
                    <p className="mt-1 max-w-md text-sm text-[var(--chat-text-muted)]">
                      This file type cannot be previewed safely here. Download it to open it in a
                      compatible application.
                    </p>
                  </div>
                </div>
              ) : null}

              {previewState.status === 'error' ? (
                <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-center">
                  <AlertTriangle className="h-10 w-10 text-rose-400" aria-hidden />
                  <div>
                    <h3 className="text-base font-medium text-[var(--chat-text-primary)]">
                      Preview couldn’t load
                    </h3>
                    <p role="alert" className="mt-1 max-w-md text-sm text-rose-300">
                      {previewState.error}
                    </p>
                  </div>
                </div>
              ) : null}

              {previewState.status === 'ready' && previewState.kind === 'pdf' ? (
                <iframe
                  title={`Preview ${previewEntry?.fileName ?? 'generated file'}`}
                  src={previewState.content}
                  sandbox=""
                  className="h-[min(70vh,48rem)] w-full rounded-md border border-[var(--chat-border)] bg-white"
                />
              ) : null}

              {previewState.status === 'ready' && previewState.kind === 'image' ? (
                <div className="flex min-h-72 items-center justify-center">
                  <img
                    src={previewState.content}
                    alt={`Preview of ${previewEntry?.fileName ?? 'generated file'}`}
                    className="max-h-[70vh] max-w-full rounded-md object-contain"
                  />
                </div>
              ) : null}

              {previewState.status === 'ready' && previewState.kind === 'text' ? (
                <pre className="min-h-72 whitespace-pre-wrap break-words rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-4 font-mono text-xs text-[var(--chat-text-primary)]">
                  {previewState.content}
                </pre>
              ) : null}
            </div>

            <DialogFooter className="border-t border-[var(--chat-border)] px-6 py-3">
              {previewState.status === 'error' ? (
                <Button
                  variant="outline"
                  onClick={() => setPreviewAttempt((attempt) => attempt + 1)}
                  aria-label="Retry preview"
                  className="gap-2"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Retry
                </Button>
              ) : null}
              {previewEntry ? (
                <Button
                  variant="outline"
                  onClick={() => void handleDownload(previewEntry)}
                  aria-label={`Download ${previewEntry.fileName}`}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  Download
                </Button>
              ) : null}
              <Button onClick={closePreview}>Close</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
