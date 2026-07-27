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
import { FolderOpen, Loader2, RotateCcw, Search } from 'lucide-react';
import {
  LibraryListResponseSchema,
  LIBRARY_DEFAULT_PAGE_SIZE,
  type LibraryItem,
} from '@agiworkforce/cloud-contracts';
import {
  summarizeGeneratedFileBundle,
  type GeneratedFile,
  type GeneratedFileKind,
  type SourceSurface,
} from '@agiworkforce/types';
import { GeneratedFileCard } from '../GeneratedFileCard';
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

/**
 * Icon taxonomy for the card badge — display-only. Ownership classification
 * (`surface`) comes from the server; this only picks which icon/label the
 * shared card shows, mirroring the server's coarse kind buckets.
 */
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

const KNOWN_SURFACES: ReadonlySet<string> = new Set([
  'web',
  'desktop',
  'mobile',
  'cli',
  'vscode',
  'chrome',
]);

/** Map one Library item onto the suite-contract GeneratedFile the shared
 *  presentation helper consumes (mirrors MessageGeneratedFiles' mapping). */
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

/**
 * Everything this view cannot do for itself.
 *
 * Auth differs per host (Clerk session cookies on web, a bearer token on
 * desktop) and so does "open a preview" (a new tab vs. the OS browser). Passing
 * `Response` objects rather than parsed data keeps the status/parse handling —
 * and its error copy — in one place here.
 */
export interface LibraryTransport {
  /** Whether an authenticated session exists. Gates the first fetch so a
   *  signed-out visit never fires an authenticated request. */
  isSignedIn: boolean;
  /** GET the library page for the supplied query parameters. */
  listPage(params: URLSearchParams): Promise<Response>;
  /** GET one asset's bytes, for the download blob. */
  fetchAsset(uri: string): Promise<Response>;
  /** POST a restore for a soft-deleted asset id. */
  restoreItem(id: string): Promise<Response>;
  /** Show the asset to the user however this host does that. */
  openPreview(uri: string): void;
}

interface PageState {
  items: LibraryItem[];
  hasMore: boolean;
  nextOffset: number | null;
}

export function LibraryView({ transport }: { transport: LibraryTransport }) {
  const { isSignedIn } = transport;
  const [origin, setOrigin] = useState<OriginFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<PageState>({ items: [], hasMore: false, nextOffset: null });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const [viewDeleted, setViewDeleted] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const requestSeq = useRef(0);

  // Debounce the search box into the effective query.
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
      else setLoading(true);
      setError(null);
      try {
        const res = await transport.listPage(buildParams(offset));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = LibraryListResponseSchema.safeParse(await res.json());
        if (!parsed.success) throw new Error('Unexpected response shape');
        if (seq !== requestSeq.current) return; // superseded by a newer request
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
        }
      }
    },
    [buildParams, transport],
  );

  // (Re)load the first page whenever the filters change. Gated on isSignedIn
  // so a signed-out visit never fires an authenticated fetch.
  useEffect(() => {
    if (!isSignedIn) return;
    void loadPage(0, false);
  }, [isSignedIn, loadPage]);

  const handleDownload = useCallback(
    async (item: LibraryItem) => {
      try {
        const res = await transport.fetchAsset(item.uri);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

  // Restore a soft-deleted asset from the Recently-deleted bin. On success the
  // row leaves the bin view immediately (it is live again). CSRF-guarded POST.
  const handleRestore = useCallback(
    async (id: string) => {
      setRestoringId(id);
      try {
        const res = await transport.restoreItem(id);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setPage((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== id) }));
      } catch {
        // Non-fatal: leave the item in the bin so the user can retry.
      } finally {
        setRestoringId(null);
      }
    },
    [transport],
  );

  // Preview opens the authed same-origin serve route in a new tab — the route
  // responds with Content-Disposition: inline, so browsers render it.
  const handlePreview = useCallback(
    (item: LibraryItem) => {
      transport.openPreview(item.uri);
    },
    [transport],
  );

  const cards = useMemo(
    () =>
      page.items.map((item) => ({
        item,
        presentation: summarizeGeneratedFileBundle({
          generatedFile: generatedFileFromLibraryItem(item),
          // Library rows exist only after the server persisted the bytes.
          fallbackStatus: 'completed',
        }),
      })),
    [page.items],
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
          className="flex items-center gap-3 rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-4 text-sm text-[var(--chat-destructive,#e5484d)]"
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

      {loading && cards.length === 0 ? (
        <div
          data-testid="library-loading"
          className="flex items-center gap-2 py-16 text-sm text-[var(--chat-text-muted)]"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading your library…
        </div>
      ) : null}

      {!loading && !error && cards.length === 0 ? (
        <EmptyState origin={origin} hasQuery={query.length > 0} />
      ) : null}

      {cards.length > 0 ? (
        <div
          data-testid="library-grid"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {cards.map(({ item, presentation }) => (
            <div key={item.id} className="flex flex-col gap-1">
              <GeneratedFileCard
                presentation={{
                  ...presentation,
                  // Inline thumbnail through the authed serve route for
                  // previewable images; other kinds keep the icon tile.
                  previewUri:
                    item.previewable && item.mime_type.toLowerCase().startsWith('image/')
                      ? item.uri
                      : undefined,
                  canPreview: item.previewable,
                }}
                onDownload={() => void handleDownload(item)}
                onPreview={item.previewable ? () => handlePreview(item) : undefined}
              />
              {viewDeleted ? (
                <button
                  type="button"
                  onClick={() => void handleRestore(item.id)}
                  disabled={restoringId === item.id}
                  className="self-start text-xs font-medium text-primary underline underline-offset-2 disabled:opacity-50"
                >
                  {restoringId === item.id ? 'Restoring…' : 'Restore'}
                </button>
              ) : null}
              {downloadErrors[item.id] ? (
                <div className="flex items-center gap-2 text-xs text-[var(--chat-destructive,#e5484d)]">
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

function EmptyState({ origin, hasQuery }: { origin: OriginFilter; hasQuery: boolean }) {
  // Honest copy: search miss vs. genuinely empty buckets. Uploads are not
  // cataloged into the Library today (chat uploads stay with their
  // conversation), so the Uploaded bucket says exactly that.
  const copy = hasQuery
    ? 'No files match your search.'
    : origin === 'uploaded'
      ? 'Uploaded files aren’t cataloged in the Library yet — files you upload stay with their conversation. Generated files appear under Generated.'
      : 'Files created in your conversations — images, documents, spreadsheets — will appear here.';
  return (
    <div
      data-testid="library-empty-state"
      className="flex flex-col items-center gap-3 py-20 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--chat-surface-elevated)]">
        <FolderOpen className="h-6 w-6 text-[var(--chat-text-muted)]" aria-hidden />
      </div>
      <p className="text-base font-semibold text-[var(--chat-text-primary)]">Nothing here yet</p>
      <p className="max-w-md text-sm text-[var(--chat-text-muted)]">{copy}</p>
    </div>
  );
}
