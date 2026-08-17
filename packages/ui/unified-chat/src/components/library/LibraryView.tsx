/**
 * LibraryView — the Library surface body: browse the user's cataloged files
 * (`media_assets` via `GET /api/library`) with origin/kind filter chips, a
 * filename/prompt search box, a card grid, and offset "Show more" paging.
 *
 * Parity of concept with mobile's LibraryScreen (grid + filter chips + honest
 * empty state) and ChatGPT's Library; presentation reuses the shared
 * `GeneratedFileCard` from `@agiworkforce/unified-chat` — no forked card.
 *
 * Host-agnostic: every network call and the preview gesture arrive through the
 * injected {@link LibraryTransport}, so web can use same-origin cookies + CSRF
 * while desktop uses its bearer-token cloudFetch. Neither copy of this view
 * exists — that duplication is what the shared package prevents.
 *
 * Downloads and image previews go through the host's authed route. Failures
 * surface as an inline error with Retry; empty states never fake content.
 *
 * Origin-conversation links are intentionally absent: `media_assets.metadata`
 * carries no conversation id today (verified against every writer), so there
 * is nothing truthful to link to.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Loader2, RotateCcw, Search, Trash2 } from 'lucide-react';
import {
  LibraryListResponseSchema,
  LIBRARY_DEFAULT_PAGE_SIZE,
  type LibraryItem,
} from '@agiworkforce/cloud-contracts';
import {
  summarizeGeneratedFileBundle,
  type ArtifactType,
  type GeneratedFile,
  type GeneratedFileKind,
  type SourceSurface,
} from '@agiworkforce/types';
import { GeneratedFileCard } from '../GeneratedFileCard';
import { ArtifactRenderer } from '../ArtifactRenderer';
import { Button } from '@agiworkforce/ui';

type OriginFilter = 'all' | 'generated' | 'uploaded';
type KindFilter = 'all' | 'image' | 'video' | 'file';

const ORIGIN_FILTERS: Array<{ id: OriginFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'generated', label: 'Generated' },
  { id: 'uploaded', label: 'Uploaded' },
];

const KIND_FILTERS: Array<{ id: KindFilter; label: string }> = [
  { id: 'all', label: 'All types' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'file', label: 'Files' },
];

export function iconKindFor(fileName: string, mimeType: string): GeneratedFileKind {
  const mime = mimeType.toLowerCase();
  const ext = fileName.includes('.')
    ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
    : '';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'pptx' || ext === 'ppt') return 'pptx';
  if (ext === 'csv' || mime === 'text/csv') return 'csv';
  if (ext === 'json' || mime === 'application/json') return 'json';
  if (ext === 'md' || ext === 'markdown' || mime === 'text/markdown') return 'markdown';
  if (ext === 'html' || ext === 'htm' || mime === 'text/html') return 'html';
  if (['zip', 'tar', 'gz', 'tgz', '7z', 'rar'].includes(ext)) return 'archive';
  return 'other';
}

const ARTIFACT_TYPE_BY_EXTENSION: Readonly<Record<string, ArtifactType>> = {
  html: 'html',
  htm: 'html',
  svg: 'svg',
  md: 'markdown',
  markdown: 'markdown',
  mmd: 'mermaid',
  mermaid: 'mermaid',
  json: 'json',
};

/**
 * The artifact class a Library row renders as. `media_assets.metadata.surface`
 * (written by the server's `classifyGeneratedFile`) already decided that this
 * row IS an artifact; this only picks which renderer inside that family.
 */
export function artifactTypeForLibraryItem(item: LibraryItem): ArtifactType {
  const mime = item.mime_type.toLowerCase();
  if (mime.startsWith('image/svg')) return 'svg';
  if (mime === 'text/html') return 'html';
  if (mime === 'text/markdown') return 'markdown';
  if (mime === 'application/json') return 'json';
  const ext = item.file_name.includes('.')
    ? item.file_name.slice(item.file_name.lastIndexOf('.') + 1).toLowerCase()
    : '';
  return ARTIFACT_TYPE_BY_EXTENSION[ext] ?? 'code';
}

/**
 * An artifact is rendered inline, so its bytes cross into the DOM rather than
 * going straight to disk. Refuse anything that would make the tab unresponsive
 * and keep the download path, which streams, as the honest way out.
 */
const MAX_INLINE_ARTIFACT_BYTES = 512 * 1024;

type ArtifactSource =
  | { status: 'loading' }
  | { status: 'ready'; content: string }
  | { status: 'error'; message: string };

const KNOWN_SURFACES: ReadonlySet<string> = new Set([
  'web',
  'desktop',
  'mobile',
  'cli',
  'vscode',
  'chrome',
]);

export function generatedFileFromLibraryItem(item: LibraryItem): GeneratedFile {
  const sourceSurface: SourceSurface =
    item.source_surface && KNOWN_SURFACES.has(item.source_surface)
      ? (item.source_surface as SourceSurface)
      : 'web';
  return {
    id: item.id,
    computeSessionId: '',
    ownerUserId: '',
    sourceSurface,
    privacyMode: 'managed',
    providerMode: 'ManagedGateway',
    kind: iconKindFor(item.file_name, item.mime_type),
    fileName: item.file_name,
    mimeType: item.mime_type,
    uri: item.uri,
    byteCount: item.byte_count ?? 0,
    checksumSha256: '',
    previewDerivatives: [],
    createdAt: item.created_at,
  };
}

export interface LibraryTransport {
  isAuthReady?: boolean;
  isSignedIn: boolean;
  listPage(params: URLSearchParams): Promise<Response>;
  fetchAsset(uri: string): Promise<Response>;
  deleteItem(id: string): Promise<Response>;
  permanentlyDeleteItem(id: string): Promise<Response>;
  restoreItem(id: string): Promise<Response>;
  openPreview(uri: string): void;
  inlinePreviewUri?: (uri: string) => string;
  startChat?: () => void;
}

interface PageState {
  items: LibraryItem[];
  hasMore: boolean;
  nextOffset: number | null;
}

async function requireSuccessfulMutation(response: Response): Promise<void> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as { success?: unknown };
  if (body.success !== true) throw new Error('The file is no longer available');
}

export interface LibraryViewProps {
  transport: LibraryTransport;
  initialQuery?: string;
}

export function LibraryView({ transport, initialQuery = '' }: LibraryViewProps) {
  const { isSignedIn } = transport;
  const isAuthReady = transport.isAuthReady !== false;
  const [origin, setOrigin] = useState<OriginFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery.trim());
  const [page, setPage] = useState<PageState>({ items: [], hasMore: false, nextOffset: null });
  const [loading, setLoading] = useState(false);
  const [hasResolvedPage, setHasResolvedPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const [mutationErrors, setMutationErrors] = useState<Record<string, string>>({});
  const [unavailableIds, setUnavailableIds] = useState<ReadonlySet<string>>(() => new Set());
  const [viewDeleted, setViewDeleted] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [confirmingPermanentDeleteId, setConfirmingPermanentDeleteId] = useState<string | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [permanentlyDeletingId, setPermanentlyDeletingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [openArtifactIds, setOpenArtifactIds] = useState<ReadonlySet<string>>(() => new Set());
  const [artifactSources, setArtifactSources] = useState<Record<string, ArtifactSource>>({});
  const requestSeq = useRef(0);

  useEffect(() => {
    setSearchInput(initialQuery);
    setQuery(initialQuery.trim());
  }, [initialQuery]);

  useEffect(() => {
    const handle = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const buildParams = useCallback(
    (offset: number) => {
      const params = new URLSearchParams();
      params.set('limit', String(LIBRARY_DEFAULT_PAGE_SIZE));
      if (offset > 0) params.set('offset', String(offset));
      if (origin !== 'all') params.set('origin', origin);
      if (kind !== 'all') params.set('kind', kind);
      if (query) params.set('q', query);
      if (viewDeleted) params.set('deleted', 'true');
      return params;
    },
    [origin, kind, query, viewDeleted],
  );

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      const seq = ++requestSeq.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setHasResolvedPage(false);
      }
      setError(null);
      try {
        const res = await transport.listPage(buildParams(offset));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = LibraryListResponseSchema.safeParse(await res.json());
        if (!parsed.success) throw new Error('Unexpected response shape');
        if (seq !== requestSeq.current) return;
        setPage((prev) => ({
          items: append ? [...prev.items, ...parsed.data.items] : parsed.data.items,
          hasMore: parsed.data.has_more,
          nextOffset: parsed.data.next_offset,
        }));
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setLoadingMore(false);
          if (!append) setHasResolvedPage(true);
        }
      }
    },
    [buildParams, transport],
  );

  useEffect(() => {
    if (!isAuthReady) return;
    if (!isSignedIn) {
      requestSeq.current += 1;
      setPage({ items: [], hasMore: false, nextOffset: null });
      setError(null);
      setLoading(false);
      setLoadingMore(false);
      setHasResolvedPage(false);
      return;
    }
    void loadPage(0, false);
  }, [isAuthReady, isSignedIn, loadPage]);

  const handleDownload = useCallback(
    async (item: LibraryItem) => {
      try {
        const res = await transport.fetchAsset(item.uri);
        if (!res.ok) {
          if (res.status === 404 || res.status === 410) {
            setUnavailableIds((current) => new Set(current).add(item.id));
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.file_name;
        a.click();
        URL.revokeObjectURL(url);
        setDownloadErrors((prev) => {
          if (!(item.id in prev)) return prev;
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      } catch (err) {
        setDownloadErrors((prev) => ({
          ...prev,
          [item.id]: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [transport],
  );

  const handleThumbnailError = useCallback(
    async (item: LibraryItem) => {
      try {
        const response = await transport.fetchAsset(item.uri);
        if (response.status === 404 || response.status === 410) {
          setUnavailableIds((current) => new Set(current).add(item.id));
        }
      } catch {
        // A transient transport error is not proof that durable bytes are
        // gone. The card already falls back to its kind icon for this mount.
      }
    },
    [transport],
  );

  const handleRestore = useCallback(
    async (id: string) => {
      setRestoringId(id);
      setMutationErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      try {
        const res = await transport.restoreItem(id);
        await requireSuccessfulMutation(res);
        setPage((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== id) }));
      } catch (err) {
        setMutationErrors((prev) => ({
          ...prev,
          [id]: err instanceof Error ? err.message : String(err),
        }));
      } finally {
        setRestoringId(null);
      }
    },
    [transport],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      setMutationErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      try {
        const res = await transport.deleteItem(id);
        await requireSuccessfulMutation(res);
        setPage((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== id) }));
        setConfirmingDeleteId(null);
      } catch (err) {
        setMutationErrors((prev) => ({
          ...prev,
          [id]: err instanceof Error ? err.message : String(err),
        }));
      } finally {
        setDeletingId(null);
      }
    },
    [transport],
  );

  const handlePermanentDelete = useCallback(
    async (id: string) => {
      setPermanentlyDeletingId(id);
      setMutationErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      try {
        const res = await transport.permanentlyDeleteItem(id);
        await requireSuccessfulMutation(res);
        setPage((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== id) }));
        setConfirmingPermanentDeleteId(null);
      } catch (err) {
        setMutationErrors((prev) => ({
          ...prev,
          [id]: err instanceof Error ? err.message : String(err),
        }));
      } finally {
        setPermanentlyDeletingId(null);
      }
    },
    [transport],
  );

  const handlePreview = useCallback(
    (item: LibraryItem) => {
      transport.openPreview(item.uri);
    },
    [transport],
  );

  const loadArtifactSource = useCallback(
    async (item: LibraryItem) => {
      setArtifactSources((prev) => ({ ...prev, [item.id]: { status: 'loading' } }));
      try {
        const res = await transport.fetchAsset(item.uri);
        if (!res.ok) {
          if (res.status === 404 || res.status === 410) {
            setUnavailableIds((current) => new Set(current).add(item.id));
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const content = await res.text();
        if (content.length > MAX_INLINE_ARTIFACT_BYTES) {
          setArtifactSources((prev) => ({
            ...prev,
            [item.id]: {
              status: 'error',
              message: 'This file is too large to preview here — download it instead.',
            },
          }));
          return;
        }
        setArtifactSources((prev) => ({ ...prev, [item.id]: { status: 'ready', content } }));
      } catch (err) {
        setArtifactSources((prev) => ({
          ...prev,
          [item.id]: { status: 'error', message: err instanceof Error ? err.message : String(err) },
        }));
      }
    },
    [transport],
  );

  const toggleArtifact = useCallback(
    (item: LibraryItem) => {
      const wasOpen = openArtifactIds.has(item.id);
      setOpenArtifactIds((current) => {
        const next = new Set(current);
        if (wasOpen) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      if (!wasOpen && artifactSources[item.id]?.status !== 'ready') {
        void loadArtifactSource(item);
      }
    },
    [openArtifactIds, artifactSources, loadArtifactSource],
  );

  const cards = useMemo(
    () =>
      page.items.map((item) => {
        const isUnavailable = unavailableIds.has(item.id);
        return {
          item,
          isUnavailable,
          isArtifact: item.surface === 'artifact',
          presentation: summarizeGeneratedFileBundle({
            generatedFile: generatedFileFromLibraryItem(item),
            fallbackStatus: isUnavailable ? 'failed' : 'completed',
          }),
        };
      }),
    [page.items, unavailableIds],
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6" data-testid="library-view">
      <header className="flex flex-col gap-1">
        <h1 className="font-[var(--chat-font-serif)] text-[28px] font-medium text-[var(--chat-text-primary)]">
          Library
        </h1>
        <p className="text-sm text-[var(--chat-text-muted)]">
          Files generated in your conversations, in one place.
        </p>
      </header>

      {/* Search + filter chips */}
      <div className="flex flex-col gap-3">
        <label className="relative block max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--chat-text-muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by file name or prompt"
            aria-label="Search library files"
            className="w-full rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] py-2 pl-9 pr-3 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Origin filters">
          {ORIGIN_FILTERS.map((f) => (
            <FilterChip
              key={f.id}
              label={f.label}
              active={origin === f.id}
              onClick={() => setOrigin(f.id)}
            />
          ))}
          <span className="mx-1 h-4 w-px bg-[var(--chat-border)]" aria-hidden />
          {KIND_FILTERS.map((f) => (
            <FilterChip
              key={f.id}
              label={f.label}
              active={kind === f.id}
              onClick={() => setKind(f.id)}
            />
          ))}
          <span className="mx-1 h-4 w-px bg-[var(--chat-border)]" aria-hidden />
          <FilterChip
            label={viewDeleted ? 'Back to library' : 'Recently deleted'}
            active={viewDeleted}
            onClick={() => setViewDeleted((v) => !v)}
          />
        </div>
      </div>

      {/* Error state with retry — never silent. */}
      {error ? (
        <div
          data-testid="library-error"
          className="flex items-center gap-3 rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-4 text-sm text-[var(--chat-destructive)]"
        >
          <span>Couldn&apos;t load your library ({error}).</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadPage(0, false)}
            className="h-7 gap-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}

      {(!isAuthReady || (isSignedIn && (!hasResolvedPage || loading))) && cards.length === 0 ? (
        <div
          data-testid="library-loading"
          className="flex items-center gap-2 py-16 text-sm text-[var(--chat-text-muted)]"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading your library…
        </div>
      ) : null}

      {isAuthReady &&
      (!isSignedIn || hasResolvedPage) &&
      !loading &&
      !error &&
      cards.length === 0 ? (
        <EmptyState
          origin={origin}
          hasQuery={query.length > 0}
          viewDeleted={viewDeleted}
          startChat={transport.startChat}
        />
      ) : null}

      {cards.length > 0 ? (
        <div
          data-testid="library-grid"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {cards.map(({ item, isUnavailable, isArtifact, presentation }) => (
            <div
              key={item.id}
              className="flex h-full flex-col overflow-hidden rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]"
            >
              <GeneratedFileCard
                className="h-auto flex-1 rounded-none border-0 bg-transparent"
                presentation={{
                  ...presentation,
                  previewUri:
                    !isUnavailable &&
                    item.previewable &&
                    item.mime_type.toLowerCase().startsWith('image/')
                      ? transport.inlinePreviewUri?.(item.uri)
                      : undefined,
                  canPreview: !isUnavailable && item.previewable,
                }}
                onDownload={isUnavailable ? undefined : () => void handleDownload(item)}
                onPreview={
                  isUnavailable || !item.previewable
                    ? undefined
                    : isArtifact
                      ? // An artifact-class row's bytes are markup or source, so
                        // handing them to the host's raw-bytes tab is both a worse
                        // reading experience and an unsandboxed one. Render it
                        // through the same sandboxed renderer the chat panel uses.
                        () => toggleArtifact(item)
                      : () => handlePreview(item)
                }
                onPreviewError={() => void handleThumbnailError(item)}
              />
              {isArtifact && openArtifactIds.has(item.id) ? (
                <ArtifactSection
                  item={item}
                  source={artifactSources[item.id]}
                  onRetry={() => void loadArtifactSource(item)}
                />
              ) : null}
              <div className="flex flex-col gap-2 border-t border-[var(--chat-border)] px-3 py-2">
                {isUnavailable ? (
                  <p className="text-xs text-[var(--chat-destructive)]" role="status">
                    Stored file bytes are no longer available. You can remove this stale Library
                    entry.
                  </p>
                ) : null}
                {viewDeleted ? (
                  confirmingPermanentDeleteId === item.id ? (
                    <div
                      className="rounded-[var(--chat-radius-sm)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-2"
                      role="group"
                      aria-label={`Permanently delete ${item.file_name}`}
                    >
                      <p className="text-xs text-[var(--chat-text-secondary)]">
                        Delete permanently? This file cannot be restored.
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmingPermanentDeleteId(null)}
                          disabled={permanentlyDeletingId === item.id}
                          className="text-xs font-medium text-[var(--chat-text-secondary)] underline underline-offset-2 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void handlePermanentDelete(item.id)}
                          disabled={permanentlyDeletingId === item.id}
                          className="text-xs font-medium text-[var(--chat-destructive)] underline underline-offset-2 disabled:opacity-50"
                        >
                          {permanentlyDeletingId === item.id ? 'Deleting…' : 'Delete permanently'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleRestore(item.id)}
                        disabled={restoringId === item.id}
                        className="text-xs font-medium text-primary underline underline-offset-2 disabled:opacity-50"
                      >
                        {restoringId === item.id ? 'Restoring…' : 'Restore'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingPermanentDeleteId(item.id)}
                        className="text-xs font-medium text-[var(--chat-destructive)] underline underline-offset-2"
                      >
                        Delete permanently
                      </button>
                    </div>
                  )
                ) : confirmingDeleteId === item.id ? (
                  <div
                    className="rounded-[var(--chat-radius-sm)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-2"
                    role="group"
                    aria-label={`Delete ${item.file_name}`}
                  >
                    <p className="text-xs text-[var(--chat-text-secondary)]">
                      Move to Recently deleted? You can restore it for 30 days.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(null)}
                        disabled={deletingId === item.id}
                        className="text-xs font-medium text-[var(--chat-text-secondary)] underline underline-offset-2 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="text-xs font-medium text-[var(--chat-destructive)] underline underline-offset-2 disabled:opacity-50"
                      >
                        {deletingId === item.id ? 'Deleting…' : 'Move to Recently deleted'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteId(item.id)}
                    className="flex self-start items-center gap-1 text-xs font-medium text-[var(--chat-destructive)] underline underline-offset-2"
                    aria-label={`Delete ${item.file_name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Delete
                  </button>
                )}
                {mutationErrors[item.id] ? (
                  <div className="flex items-center gap-2 text-xs text-[var(--chat-destructive)]">
                    <span>
                      {viewDeleted && confirmingPermanentDeleteId === item.id
                        ? 'Permanent delete'
                        : viewDeleted
                          ? 'Restore'
                          : 'Delete'}{' '}
                      failed ({mutationErrors[item.id]}).
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void (viewDeleted
                          ? confirmingPermanentDeleteId === item.id
                            ? handlePermanentDelete(item.id)
                            : handleRestore(item.id)
                          : handleDelete(item.id))
                      }
                      className="font-medium underline underline-offset-2"
                    >
                      Retry
                    </button>
                  </div>
                ) : null}
                {downloadErrors[item.id] ? (
                  <div className="flex items-center gap-2 text-xs text-[var(--chat-destructive)]">
                    <span>Download failed ({downloadErrors[item.id]}).</span>
                    <button
                      type="button"
                      onClick={() => void handleDownload(item)}
                      className="font-medium underline underline-offset-2"
                    >
                      Retry
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {page.hasMore && page.nextOffset != null ? (
        <div className="flex justify-center pb-8">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => void loadPage(page.nextOffset ?? 0, true)}
            data-testid="library-show-more"
          >
            {loadingMore ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : null}
            Show more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ArtifactSection({
  item,
  source,
  onRetry,
}: {
  item: LibraryItem;
  source: ArtifactSource | undefined;
  onRetry: () => void;
}) {
  if (!source || source.status === 'loading') {
    return (
      <div
        data-testid={`library-artifact-loading-${item.id}`}
        className="flex items-center gap-2 border-t border-[var(--chat-border)] px-3 py-3 text-xs text-[var(--chat-text-muted)]"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Loading preview…
      </div>
    );
  }

  if (source.status === 'error') {
    return (
      <div
        data-testid={`library-artifact-error-${item.id}`}
        className="flex items-center gap-2 border-t border-[var(--chat-border)] px-3 py-3 text-xs text-[var(--chat-destructive)]"
      >
        <span>Couldn&apos;t open this artifact ({source.message}).</span>
        <button
          type="button"
          onClick={onRetry}
          className="font-medium underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--chat-border)] p-3">
      <ArtifactRenderer
        artifact={{
          id: item.id,
          type: artifactTypeForLibraryItem(item),
          title: item.file_name,
          content: source.content,
          createdAt: item.created_at,
        }}
      />
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-xs font-medium text-primary'
          : 'rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-3 py-1 text-xs font-medium text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-primary)]'
      }
    >
      {label}
    </button>
  );
}

function EmptyState({
  origin,
  hasQuery,
  viewDeleted,
  startChat,
}: {
  origin: OriginFilter;
  hasQuery: boolean;
  viewDeleted: boolean;
  startChat?: () => void;
}) {
  const title = viewDeleted ? 'Recently deleted is empty' : 'Nothing here yet';
  const copy = hasQuery
    ? viewDeleted
      ? 'No deleted files match your search.'
      : 'No files match your search.'
    : viewDeleted
      ? 'Files you delete stay here for 30 days so you can restore them before they are permanently removed.'
      : origin === 'uploaded'
        ? 'Uploaded files aren’t cataloged in the Library yet — files you upload stay with their conversation. Generated files appear under Generated.'
        : 'Files created in your conversations — images, documents, spreadsheets — will appear here.';
  const EmptyIcon = viewDeleted ? Trash2 : FolderOpen;
  return (
    <div
      data-testid="library-empty-state"
      className="flex flex-col items-center gap-3 py-20 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--chat-accent-primary)]/15">
        <EmptyIcon className="h-7 w-7 text-[var(--chat-accent-primary)]" aria-hidden />
      </div>
      <p className="text-base font-semibold text-[var(--chat-text-primary)]">{title}</p>
      <p className="max-w-md text-sm text-[var(--chat-text-muted)]">{copy}</p>
      {/* A search miss has an obvious way out (clear the query); a genuinely
          empty Library does not, so only that case gets the CTA. */}
      {startChat && !hasQuery && !viewDeleted ? (
        <Button size="sm" className="mt-1" onClick={startChat}>
          Start a chat
        </Button>
      ) : null}
    </div>
  );
}
