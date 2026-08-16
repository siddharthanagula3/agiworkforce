import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileQuestion, Loader2, RotateCcw } from 'lucide-react';
import { LibraryView, type LibraryTransport } from '@agiworkforce/unified-chat';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@agiworkforce/ui';
import { CLOUD_API_BASE_URL } from '@/api/cloudApi';
import {
  createManagedCloudRequestContext,
  type ManagedCloudRequestContext,
} from '@/services/managedCloudRequestContext';
import { selectHasCloudAccountSession, useAuthStore } from '@/stores/auth';

const MAX_TEXT_PREVIEW_CHARACTERS = 500_000;

type PreviewKind = 'pdf' | 'image' | 'text' | 'unsupported';

type PreviewState =
  | { status: 'idle' | 'loading' | 'unsupported' }
  | { status: 'ready'; kind: Exclude<PreviewKind, 'unsupported'>; content: string }
  | { status: 'error'; error: string };

function absoluteCloudUrl(uri: string): string {
  return uri.startsWith('http://') || uri.startsWith('https://')
    ? uri
    : `${CLOUD_API_BASE_URL}${uri}`;
}

function isManagedCloudUrl(uri: string): boolean {
  try {
    return new URL(uri).origin === new URL(CLOUD_API_BASE_URL).origin;
  } catch {
    return false;
  }
}

async function authenticatedCloudFetch(
  request: ManagedCloudRequestContext,
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const authHeaders = await request.getHeaders();
  for (const [name, value] of Object.entries(authHeaders)) headers.set(name, value);
  return request.fetch(input, {
    ...init,
    credentials: 'include',
    headers: Object.fromEntries(headers.entries()),
  });
}

function previewKindFor(mimeType: string): PreviewKind {
  const normalized = mimeType.toLowerCase().split(';', 1)[0]?.trim() ?? '';
  if (normalized === 'application/pdf') return 'pdf';
  if (normalized === 'image/svg+xml') return 'text';
  if (normalized.startsWith('image/')) return 'image';
  if (
    normalized.startsWith('text/') ||
    normalized === 'application/json' ||
    normalized === 'application/ld+json' ||
    normalized === 'application/xml' ||
    normalized === 'application/yaml' ||
    normalized === 'application/x-yaml'
  ) {
    return 'text';
  }
  return 'unsupported';
}

function truncateTextPreview(text: string): string {
  if (text.length <= MAX_TEXT_PREVIEW_CHARACTERS) return text;
  return `${text.slice(0, MAX_TEXT_PREVIEW_CHARACTERS)}\n\n[Preview truncated. Download the file to view the rest.]`;
}

export interface DesktopLibraryProps {
  onStartChat?: () => void;
  initialQuery?: string;
}

interface AuthenticatedDesktopLibraryProps extends DesktopLibraryProps {
  request: ManagedCloudRequestContext;
}

function AuthenticatedDesktopLibrary({
  request,
  onStartChat,
  initialQuery,
}: AuthenticatedDesktopLibraryProps) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [previewState, setPreviewState] = useState<PreviewState>({ status: 'idle' });

  const fetchAsset = useCallback(
    (uri: string, init: RequestInit = {}) => {
      const absoluteUri = absoluteCloudUrl(uri);
      return isManagedCloudUrl(absoluteUri)
        ? authenticatedCloudFetch(request, absoluteUri, init)
        : request.fetchExternal(absoluteUri, init);
    },
    [request],
  );

  const closePreview = useCallback(() => {
    setPreviewUri(null);
    setPreviewState({ status: 'idle' });
  }, []);

  useEffect(() => {
    if (!previewUri) return;

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setPreviewState({ status: 'loading' });

    void (async () => {
      try {
        const response = await fetchAsset(previewUri, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (controller.signal.aborted) return;

        const kind = previewKindFor(blob.type || response.headers.get('content-type') || '');
        if (kind === 'unsupported') {
          setPreviewState({ status: 'unsupported' });
          return;
        }
        if (kind === 'text') {
          const content = truncateTextPreview(await blob.text());
          if (!controller.signal.aborted) setPreviewState({ status: 'ready', kind, content });
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setPreviewState({ status: 'ready', kind, content: objectUrl });
      } catch (error) {
        if (controller.signal.aborted) return;
        setPreviewState({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fetchAsset, previewAttempt, previewUri]);

  const transport = useMemo<LibraryTransport>(
    () => ({
      isSignedIn: true,
      listPage: (params) =>
        authenticatedCloudFetch(request, `${CLOUD_API_BASE_URL}/api/library?${params.toString()}`),
      fetchAsset,
      deleteItem: (id) =>
        authenticatedCloudFetch(
          request,
          `${CLOUD_API_BASE_URL}/api/media?id=${encodeURIComponent(id)}`,
          { method: 'DELETE' },
        ),
      permanentlyDeleteItem: (id) =>
        authenticatedCloudFetch(
          request,
          `${CLOUD_API_BASE_URL}/api/media?id=${encodeURIComponent(id)}&permanent=true`,
          { method: 'DELETE' },
        ),
      restoreItem: (id) =>
        authenticatedCloudFetch(
          request,
          `${CLOUD_API_BASE_URL}/api/media?id=${encodeURIComponent(id)}`,
          { method: 'POST' },
        ),
      openPreview: (uri) => {
        setPreviewAttempt(0);
        setPreviewUri(uri);
      },
      startChat: onStartChat,
    }),
    [fetchAsset, onStartChat, request],
  );

  return (
    <>
      <LibraryView transport={transport} initialQuery={initialQuery} />
      <Dialog
        open={previewUri !== null}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <DialogContent className="w-[min(96vw,64rem)] max-w-none overflow-hidden p-0">
          <div className="grid max-h-[calc(100vh-2rem)] min-h-[24rem] grid-rows-[auto,1fr,auto]">
            <DialogHeader className="border-b border-[var(--chat-border)] px-6 py-4">
              <DialogTitle className="truncate pr-8">Library file preview</DialogTitle>
              <DialogDescription>
                Safe in-app preview. Active HTML and SVG content is shown as source.
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
                      This file type cannot be previewed safely here. Use the card’s Download action
                      to open it in a compatible application.
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
                  title="Library file preview"
                  src={previewState.content}
                  sandbox=""
                  className="h-[min(70vh,48rem)] w-full rounded-md border border-[var(--chat-border)] bg-white"
                />
              ) : null}

              {previewState.status === 'ready' && previewState.kind === 'image' ? (
                <div className="flex min-h-72 items-center justify-center">
                  <img
                    src={previewState.content}
                    alt="Library file preview"
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
              <Button onClick={closePreview}>Close</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DesktopLibrary({ onStartChat, initialQuery }: DesktopLibraryProps = {}) {
  const isSignedIn = useAuthStore(selectHasCloudAccountSession);
  const accountId = useAuthStore((state) => state.user?.id ?? null);
  const sessionEpoch = useAuthStore((state) => state.cloudSessionEpoch);

  const requestState = useMemo(() => {
    if (!isSignedIn || !accountId) return null;
    return {
      request: createManagedCloudRequestContext('Managed Cloud library'),
      sessionKey: `${accountId}:${sessionEpoch}`,
    };
  }, [accountId, isSignedIn, sessionEpoch]);

  if (!isSignedIn || !requestState) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 py-20 text-center">
        <p className="text-base font-semibold text-[var(--chat-text-primary)]">
          Sign in to see your Library
        </p>
        <p className="mx-auto max-w-md text-sm text-[var(--chat-text-muted)]">
          Files generated in your conversations are stored in AGI Cloud. Local-only sessions keep
          their files on this device and are not cataloged here.
        </p>
      </div>
    );
  }

  return (
    <AuthenticatedDesktopLibrary
      key={requestState.sessionKey}
      request={requestState.request}
      onStartChat={onStartChat}
      initialQuery={initialQuery}
    />
  );
}

export default DesktopLibrary;
