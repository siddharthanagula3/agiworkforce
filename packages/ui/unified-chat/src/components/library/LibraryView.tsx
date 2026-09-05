import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { toUserMessageWithStatus } from '../../lib/network-error';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Folder,
  LayoutGrid,
  List,
  Mic,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { SEARCH_INPUT_DEBOUNCE_MS, formatBytes } from '@agiworkforce/utils';
import {
  LibraryListResponseSchema,
  LIBRARY_DEFAULT_PAGE_SIZE,
  LIBRARY_DEFAULT_SORT,
  type LibraryItem,
  type LibrarySort,
} from '@agiworkforce/cloud-contracts';
import { generatedFileTrustBoundary } from '../MessageGeneratedFiles';
import { ArtifactRenderer, type NativeExportFormat } from '../ArtifactRenderer';
import { Button, Spinner, useConfirmAction, useMenuKeyboard } from '@agiworkforce/ui';
import {
  type ArtifactType,
  type GeneratedFile,
  type GeneratedFileKind,
  type SourceSurface,
} from '@agiworkforce/types';
import { FileKindIcon } from './FileKindIcon';

export type SurfaceFilter = 'all' | 'artifact' | 'file';
export type LibraryTab = 'all' | 'images' | 'documents';
export type LibraryViewMode = 'grid' | 'list';

export interface LibraryFolder {
  id: string;
  name: string;
  updatedAt: string;
  itemCount: number | null;
}

const TABS: ReadonlyArray<{ id: LibraryTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'images', label: 'Images' },
  { id: 'documents', label: 'Documents' },
];

const KIND_PARAM_BY_TAB: Readonly<Record<LibraryTab, string | null>> = {
  all: null,
  images: 'image,video',
  documents: 'file',
};

const SORT_OPTIONS: ReadonlyArray<{ id: LibrarySort; label: string }> = [
  { id: 'modified', label: 'Modified' },
  { id: 'name', label: 'Name' },
  { id: 'size', label: 'Size' },
];

const VIEW_MODE_STORAGE_KEY = 'agi-library-view-mode';
const VIEW_MODES: ReadonlySet<string> = new Set<LibraryViewMode>(['grid', 'list']);

function loadViewMode(): LibraryViewMode {
  if (typeof window === 'undefined') return 'grid';
  try {
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return stored !== null && VIEW_MODES.has(stored) ? (stored as LibraryViewMode) : 'grid';
  } catch {
    return 'grid';
  }
}

function saveViewMode(mode: LibraryViewMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    return;
  }
}

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
    ...generatedFileTrustBoundary({ provider: item.provider, model: item.model }),
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
  /** Starts a chat seeded with `message`, opened from the file viewer's "Ask
   *  about this file" composer for `item`. */
  askAboutFile?: (item: LibraryItem, message: string) => void;
  /** Folders the host lists alongside files. Hosts without one omit it and no
   *  folder row is rendered, rather than an empty section that implies none. */
  listFolders?: () => Promise<LibraryFolder[]>;
  openFolder?: (folder: LibraryFolder) => void;
  createFolder?: () => void;
  uploadFiles?: (files: File[]) => Promise<void>;
  /** Native document export. Hosts that cannot produce a format must leave it
   *  out of `nativeExportFormats` so the option is never offered. */
  exportNative?: (
    format: NativeExportFormat,
    artifactId: string,
    content: string,
    title: string,
  ) => Promise<void>;
  nativeExportFormats?: readonly NativeExportFormat[];
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

function isImageItem(item: LibraryItem): boolean {
  return item.mime_type.toLowerCase().startsWith('image/');
}

function isVideoItem(item: LibraryItem): boolean {
  return item.mime_type.toLowerCase().startsWith('video/');
}

const MODIFIED_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

function formatModified(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, MODIFIED_DATE_FORMAT);
}

function formatSize(bytes: number | null): string {
  return bytes === null ? '' : formatBytes(bytes, 0);
}

function sortFolders(folders: readonly LibraryFolder[], sort: LibrarySort): LibraryFolder[] {
  const sorted = [...folders];
  if (sort === 'modified') {
    sorted.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return sorted;
  }
  sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}

export interface LibraryViewProps {
  transport: LibraryTransport;
  initialQuery?: string;
  /** Preselected surface tab, so `/chat/library?surface=artifact` opens on Artifacts. */
  initialSurface?: SurfaceFilter;
  overlayContainerId?: string;
}

export function LibraryView({
  transport,
  initialQuery = '',
  initialSurface = 'all',
  overlayContainerId,
}: LibraryViewProps) {
  const { isSignedIn } = transport;
  const isAuthReady = transport.isAuthReady !== false;
  const [surface] = useState<SurfaceFilter>(initialSurface);
  const [tab, setTab] = useState<LibraryTab>('all');
  const [sort, setSort] = useState<LibrarySort>(LIBRARY_DEFAULT_SORT);
  const [viewMode, setViewMode] = useState<LibraryViewMode>('grid');
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery.trim());
  const [page, setPage] = useState<PageState>({ items: [], hasMore: false, nextOffset: null });
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasResolvedPage, setHasResolvedPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [unavailableIds, setUnavailableIds] = useState<ReadonlySet<string>>(() => new Set());
  const [viewDeleted, setViewDeleted] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [openArtifactIds, setOpenArtifactIds] = useState<ReadonlySet<string>>(() => new Set());
  const [artifactSources, setArtifactSources] = useState<Record<string, ArtifactSource>>({});
  const [viewerItem, setViewerItem] = useState<LibraryItem | null>(null);
  const requestSeq = useRef(0);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setViewMode(loadViewMode()), []);

  const changeViewMode = useCallback((mode: LibraryViewMode) => {
    setViewMode(mode);
    saveViewMode(mode);
  }, []);

  useEffect(() => {
    setSearchInput(initialQuery);
    setQuery(initialQuery.trim());
  }, [initialQuery]);

  useEffect(() => {
    const handle = setTimeout(() => setQuery(searchInput.trim()), SEARCH_INPUT_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const buildParams = useCallback(
    (offset: number) => {
      const params = new URLSearchParams();
      params.set('limit', String(LIBRARY_DEFAULT_PAGE_SIZE));
      params.set('sort', sort);
      if (offset > 0) params.set('offset', String(offset));
      if (surface !== 'all') params.set('surface', surface);
      const kindParam = KIND_PARAM_BY_TAB[tab];
      if (kindParam) params.set('kind', kindParam);
      if (query) params.set('q', query);
      if (viewDeleted) params.set('deleted', 'true');
      return params;
    },
    [surface, tab, sort, query, viewDeleted],
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
        setError(toUserMessageWithStatus(err, 'Something went wrong.'));
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

  const listFolders = transport.listFolders;
  useEffect(() => {
    if (!isAuthReady || !isSignedIn || !listFolders) return;
    let active = true;
    void (async () => {
      try {
        const loaded = await listFolders();
        if (active) setFolders(loaded);
      } catch {
        if (active) setFolders([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [isAuthReady, isSignedIn, listFolders]);

  const setRowError = useCallback((id: string, message: string | null) => {
    setRowErrors((prev) => {
      if (message === null) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: message };
    });
  }, []);

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
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = item.file_name;
        anchor.click();
        URL.revokeObjectURL(url);
        setRowError(item.id, null);
      } catch (err) {
        setRowError(
          item.id,
          `Download failed (${err instanceof Error ? err.message : String(err)}).`,
        );
      }
    },
    [transport, setRowError],
  );

  const handleThumbnailError = useCallback(
    async (item: LibraryItem) => {
      try {
        const response = await transport.fetchAsset(item.uri);
        if (response.status === 404 || response.status === 410) {
          setUnavailableIds((current) => new Set(current).add(item.id));
        }
      } catch {
        return;
      }
    },
    [transport],
  );

  const removeFromPage = useCallback((id: string) => {
    setPage((prev) => ({ ...prev, items: prev.items.filter((entry) => entry.id !== id) }));
  }, []);

  const runMutation = useCallback(
    async (id: string, label: string, call: () => Promise<Response>) => {
      setRowError(id, null);
      try {
        await requireSuccessfulMutation(await call());
        removeFromPage(id);
      } catch (err) {
        setRowError(id, `${label} failed (${err instanceof Error ? err.message : String(err)}).`);
      }
    },
    [removeFromPage, setRowError],
  );

  const handleRestore = useCallback(
    (id: string) => runMutation(id, 'Restore', () => transport.restoreItem(id)),
    [runMutation, transport],
  );

  const confirmDelete = useCallback(
    (item: LibraryItem) =>
      confirm({
        title: `Delete ${item.file_name}?`,
        description:
          'It moves to Recently deleted, where it stays restorable for 30 days before it is removed for good.',
        confirmLabel: 'Delete',
        destructive: true,
        onConfirm: () => runMutation(item.id, 'Delete', () => transport.deleteItem(item.id)),
      }),
    [confirm, runMutation, transport],
  );

  const confirmPermanentDelete = useCallback(
    (item: LibraryItem) =>
      confirm({
        title: `Permanently delete ${item.file_name}?`,
        description:
          'The stored bytes are erased now. Nothing restores this file, and anything linking to it stops resolving.',
        confirmLabel: 'Delete permanently',
        destructive: true,
        onConfirm: () =>
          runMutation(item.id, 'Permanent delete', () => transport.permanentlyDeleteItem(item.id)),
      }),
    [confirm, runMutation, transport],
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
              message: 'This file is too large to preview here. Download it instead.',
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

  const openItem = useCallback(
    (item: LibraryItem) => {
      if (unavailableIds.has(item.id)) return;
      if (item.surface === 'artifact') {
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
        return;
      }
      if (item.previewable) setViewerItem(item);
    },
    [unavailableIds, openArtifactIds, artifactSources, loadArtifactSource],
  );

  const uploadFiles = transport.uploadFiles;
  const handleUploadPicked = useCallback(
    async (files: FileList | null) => {
      if (!uploadFiles || !files || files.length === 0) return;
      setUploadError(null);
      setUploading(true);
      try {
        await uploadFiles(Array.from(files));
        await loadPage(0, false);
      } catch (err) {
        setUploadError(toUserMessageWithStatus(err, 'That upload did not finish.'));
      } finally {
        setUploading(false);
      }
    },
    [uploadFiles, loadPage],
  );

  const requestUpload = useCallback(() => uploadInputRef.current?.click(), []);

  const visibleFolders = useMemo(() => {
    if (tab !== 'all' || viewDeleted || folders.length === 0) return [];
    const needle = query.toLowerCase();
    const matched = needle
      ? folders.filter((folder) => folder.name.toLowerCase().includes(needle))
      : folders;
    return sortFolders(matched, sort);
  }, [folders, tab, viewDeleted, query, sort]);

  const rowActions = useMemo(
    () => ({
      onOpen: openItem,
      onDownload: handleDownload,
      onDelete: confirmDelete,
      onRestore: handleRestore,
      onPermanentDelete: confirmPermanentDelete,
    }),
    [openItem, handleDownload, confirmDelete, handleRestore, confirmPermanentDelete],
  );

  const isBusy = !isAuthReady || (isSignedIn && (!hasResolvedPage || loading));
  const isEmpty =
    isAuthReady &&
    (!isSignedIn || hasResolvedPage) &&
    !loading &&
    !error &&
    page.items.length === 0 &&
    visibleFolders.length === 0;

  const sharedListProps = {
    items: page.items,
    folders: visibleFolders,
    unavailableIds,
    rowErrors,
    viewDeleted,
    actions: rowActions,
    onOpenFolder: transport.openFolder,
    onThumbnailError: handleThumbnailError,
    inlinePreviewUri: transport.inlinePreviewUri,
    openArtifactIds,
    artifactSources,
    onRetryArtifact: loadArtifactSource,
    exportNative: transport.exportNative,
    nativeExportFormats: transport.nativeExportFormats,
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5" data-testid="library-view">
      {confirmDialog}
      {viewerItem ? (
        <FileViewerOverlay
          item={viewerItem}
          onClose={() => setViewerItem(null)}
          onDownload={handleDownload}
          inlinePreviewUri={transport.inlinePreviewUri}
          askAboutFile={transport.askAboutFile}
          containerId={overlayContainerId}
        />
      ) : null}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-[var(--chat-font-sans)] text-[28px] font-medium text-[var(--chat-text-primary)]">
          Library
        </h1>
        {uploadFiles || transport.createFolder ? (
          <NewMenu
            onUpload={uploadFiles ? requestUpload : undefined}
            onCreateFolder={transport.createFolder}
            busy={uploading}
          />
        ) : null}
      </header>

      {uploadFiles ? (
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(event) => {
            void handleUploadPicked(event.target.files);
            event.target.value = '';
          }}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--chat-text-muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search files and projects"
            aria-label="Search the library by name"
            className="w-full rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] py-2 pl-9 pr-3 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--chat-focus-ring)]"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" aria-label="Filter the library" className="flex items-center gap-1">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
                className={
                  tab === entry.id
                    ? 'min-h-9 rounded-[var(--chat-radius-md)] bg-[var(--chat-surface-hover)] px-3 py-1.5 text-sm font-medium text-[var(--chat-text-primary)]'
                    : 'min-h-9 rounded-[var(--chat-radius-md)] px-3 py-1.5 text-sm font-medium text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]'
                }
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <SortMenu sort={sort} onChange={setSort} />
            <ToolbarToggle
              label="Recently deleted"
              pressed={viewDeleted}
              onClick={() => setViewDeleted((current) => !current)}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </ToolbarToggle>
            <div
              role="group"
              aria-label="Library layout"
              className="ml-1 flex items-center gap-1 border-l border-[var(--chat-border)] pl-1"
            >
              <IconToggle
                label="Grid view"
                pressed={viewMode === 'grid'}
                onClick={() => changeViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden />
              </IconToggle>
              <IconToggle
                label="List view"
                pressed={viewMode === 'list'}
                onClick={() => changeViewMode('list')}
              >
                <List className="h-4 w-4" aria-hidden />
              </IconToggle>
            </div>
          </div>
        </div>
      </div>

      {uploadError ? (
        <p role="alert" className="text-sm text-[var(--chat-destructive-text)]">
          {uploadError}
        </p>
      ) : null}

      {error ? (
        <div
          data-testid="library-error"
          role="alert"
          className="flex items-center gap-3 rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-4 text-sm text-[var(--chat-destructive-text)]"
        >
          <span>{error}</span>
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

      {isBusy && page.items.length === 0 ? (
        <div
          data-testid="library-loading"
          className="flex items-center gap-2 py-16 text-sm text-[var(--chat-text-muted)]"
        >
          <Spinner size="sm" />
          Loading your library
        </div>
      ) : null}

      {isEmpty ? (
        <EmptyState
          hasQuery={query.length > 0}
          viewDeleted={viewDeleted}
          onUpload={uploadFiles ? requestUpload : undefined}
          startChat={transport.startChat}
        />
      ) : null}

      {!isEmpty && !isBusy && viewMode === 'grid' ? <LibraryGrid {...sharedListProps} /> : null}
      {!isEmpty && !isBusy && viewMode === 'list' ? <LibraryList {...sharedListProps} /> : null}

      {page.hasMore && page.nextOffset != null ? (
        <div className="flex justify-center pb-8">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => void loadPage(page.nextOffset ?? 0, true)}
            data-testid="library-show-more"
          >
            {loadingMore ? <Spinner size="sm" className="mr-1.5 h-3.5 w-3.5" /> : null}
            Show more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const VIEWER_ZOOM_MIN = 25;
const VIEWER_ZOOM_MAX = 400;
const VIEWER_ZOOM_STEP = 25;
const VIEWER_ZOOM_DEFAULT = 100;

interface FileViewerOverlayProps {
  item: LibraryItem;
  onClose: () => void;
  onDownload: (item: LibraryItem) => Promise<void>;
  inlinePreviewUri?: (uri: string) => string;
  askAboutFile?: (item: LibraryItem, message: string) => void;
  containerId?: string;
}

function FileViewerOverlay({
  item,
  onClose,
  onDownload,
  inlinePreviewUri,
  askAboutFile,
  containerId,
}: FileViewerOverlayProps) {
  const [zoom, setZoom] = useState(VIEWER_ZOOM_DEFAULT);
  const [question, setQuestion] = useState('');
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const previewUri = isImageItem(item) ? inlinePreviewUri?.(item.uri) : undefined;

  useEffect(() => {
    setContainer(containerId ? document.getElementById(containerId) : null);
  }, [containerId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const submitQuestion = () => {
    const trimmed = question.trim();
    if (!trimmed || !askAboutFile) return;
    askAboutFile(item, trimmed);
    setQuestion('');
  };

  const panel = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${item.file_name} viewer`}
      data-testid="library-file-viewer"
      className={
        container
          ? 'pointer-events-auto absolute inset-0 z-[var(--z-modal)] flex flex-col bg-black/70 backdrop-blur-sm'
          : 'pointer-events-auto fixed inset-0 z-[var(--z-modal)] flex flex-col bg-black/70 backdrop-blur-sm'
      }
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1.5 rounded-[var(--chat-radius-md)] bg-[var(--chat-surface-base)]/90 px-2.5 py-1 text-sm text-[var(--chat-text-secondary)] backdrop-blur-sm"
        >
          <span className="shrink-0">Library</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate font-medium text-[var(--chat-text-primary)]">
            {item.file_name}
          </span>
        </nav>
        <div className="flex shrink-0 items-center gap-1.5 rounded-[var(--chat-radius-md)] bg-[var(--chat-surface-base)]/90 p-1 backdrop-blur-sm">
          {previewUri ? (
            <div
              role="group"
              aria-label="Zoom"
              className="flex items-center gap-1 rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] px-1 py-1"
            >
              <button
                type="button"
                aria-label="Zoom out"
                disabled={zoom <= VIEWER_ZOOM_MIN}
                onClick={() =>
                  setZoom((current) => Math.max(VIEWER_ZOOM_MIN, current - VIEWER_ZOOM_STEP))
                }
                className={MENU_TRIGGER_CLASS}
              >
                <ZoomOut className="h-4 w-4" aria-hidden />
              </button>
              <span className="w-10 text-center text-xs tabular-nums text-[var(--chat-text-secondary)]">
                {zoom}%
              </span>
              <button
                type="button"
                aria-label="Zoom in"
                disabled={zoom >= VIEWER_ZOOM_MAX}
                onClick={() =>
                  setZoom((current) => Math.min(VIEWER_ZOOM_MAX, current + VIEWER_ZOOM_STEP))
                }
                className={MENU_TRIGGER_CLASS}
              >
                <ZoomIn className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : null}
          <button
            type="button"
            aria-label={`Download ${item.file_name}`}
            onClick={() => void onDownload(item)}
            className={MENU_TRIGGER_CLASS}
          >
            <Download className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Close file viewer"
            onClick={onClose}
            className={MENU_TRIGGER_CLASS}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6 pb-28">
        {previewUri ? (
          <img
            src={previewUri}
            alt={item.file_name}
            style={{ transform: `scale(${zoom / 100})` }}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-[var(--chat-radius-lg)] bg-[var(--chat-surface-base)] p-8 text-center text-sm text-[var(--chat-text-secondary)]">
            <FileKindIcon
              kind={iconKindFor(item.file_name, item.mime_type)}
              className="h-12 w-12 text-[var(--chat-text-muted)]"
            />
            <p>Preview isn&rsquo;t available for this file inline.</p>
            <Button size="sm" onClick={() => void onDownload(item)}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              Download to view
            </Button>
          </div>
        )}
      </div>

      {askAboutFile ? (
        <form
          className="absolute inset-x-0 bottom-6 mx-auto flex h-12 w-full max-w-[600px] shrink-0 items-center gap-1 rounded-[28px] border border-[var(--chat-border-strong)] bg-[var(--chat-input-bg)] px-2 shadow-lg backdrop-blur-sm"
          onSubmit={(event) => {
            event.preventDefault();
            submitQuestion();
          }}
        >
          <button
            type="button"
            disabled
            aria-hidden
            tabIndex={-1}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--chat-text-muted)] opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
          <input
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about this file"
            aria-label="Ask about this file"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)] outline-none"
          />
          <span
            aria-hidden
            className="hidden shrink-0 items-center rounded-full px-2 py-1 text-xs font-medium text-[var(--chat-text-muted)] opacity-50 sm:flex"
          >
            Auto
          </span>
          <button
            type="button"
            disabled
            aria-hidden
            tabIndex={-1}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--chat-text-muted)] opacity-50"
          >
            <Mic className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="submit"
            aria-label="Ask"
            disabled={!question.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent-primary)] text-[var(--chat-accent-on-primary)] transition-opacity disabled:opacity-40"
          >
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </form>
      ) : null}
    </div>
  );

  return createPortal(panel, container ?? document.body);
}

interface RowActions {
  onOpen: (item: LibraryItem) => void;
  onDownload: (item: LibraryItem) => Promise<void>;
  onDelete: (item: LibraryItem) => void;
  onRestore: (id: string) => Promise<void>;
  onPermanentDelete: (item: LibraryItem) => void;
}

interface LibraryListProps {
  items: readonly LibraryItem[];
  folders: readonly LibraryFolder[];
  unavailableIds: ReadonlySet<string>;
  rowErrors: Record<string, string>;
  viewDeleted: boolean;
  actions: RowActions;
  onOpenFolder?: (folder: LibraryFolder) => void;
  onThumbnailError: (item: LibraryItem) => Promise<void>;
  inlinePreviewUri?: (uri: string) => string;
  openArtifactIds: ReadonlySet<string>;
  artifactSources: Record<string, ArtifactSource>;
  onRetryArtifact: (item: LibraryItem) => Promise<void>;
  exportNative?: LibraryTransport['exportNative'];
  nativeExportFormats?: readonly NativeExportFormat[];
}

function artifactPanelFor(props: LibraryListProps, item: LibraryItem): ReactNode {
  if (item.surface !== 'artifact' || !props.openArtifactIds.has(item.id)) return null;
  return (
    <ArtifactSection
      item={item}
      source={props.artifactSources[item.id]}
      onRetry={() => void props.onRetryArtifact(item)}
      {...(props.exportNative ? { exportNative: props.exportNative } : {})}
      {...(props.nativeExportFormats ? { nativeExportFormats: props.nativeExportFormats } : {})}
    />
  );
}

function GridTile({
  name,
  meta,
  ariaLabel,
  onOpen,
  menu,
  testId,
  children,
  notes,
}: {
  name: string;
  meta: string;
  ariaLabel: string;
  onOpen: () => void;
  menu?: ReactNode;
  testId: string;
  children: ReactNode;
  notes?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="group relative">
        <button type="button" onClick={onOpen} aria-label={ariaLabel} className={TILE_MEDIA_CLASS}>
          {children}
        </button>
        {menu ? <div className="absolute right-1.5 top-1.5">{menu}</div> : null}
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <span className="truncate text-sm text-[var(--chat-text-primary)]" title={name}>
          {name}
        </span>
        <span className="text-xs text-[var(--chat-text-muted)]">{meta}</span>
      </div>
      {notes}
    </div>
  );
}

function LibraryGrid(props: LibraryListProps) {
  return (
    <div
      data-testid="library-grid"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      {props.folders.map((folder) => (
        <GridTile
          key={folder.id}
          testId="library-folder-tile"
          name={folder.name}
          meta={formatModified(folder.updatedAt)}
          ariaLabel={`Open ${folder.name}`}
          onOpen={() => props.onOpenFolder?.(folder)}
        >
          <Folder className={TILE_GLYPH_CLASS} aria-hidden />
        </GridTile>
      ))}

      {props.items.map((item) => {
        const unavailable = props.unavailableIds.has(item.id);
        const thumbnailUri =
          !unavailable && isImageItem(item) ? props.inlinePreviewUri?.(item.uri) : undefined;
        const rowError = props.rowErrors[item.id];
        return (
          <GridTile
            key={item.id}
            testId="library-tile"
            name={item.file_name}
            meta={formatModified(item.created_at)}
            ariaLabel={`Open ${item.file_name}`}
            onOpen={() => props.actions.onOpen(item)}
            menu={
              <ItemMenu
                item={item}
                viewDeleted={props.viewDeleted}
                actions={props.actions}
                triggerClassName={MENU_TRIGGER_OVERLAY_CLASS}
              />
            }
            notes={
              <>
                {unavailable ? (
                  <p className="px-0.5 text-xs text-[var(--chat-destructive-text)]" role="status">
                    The stored bytes are gone. Remove this entry.
                  </p>
                ) : null}
                {rowError ? (
                  <p className="px-0.5 text-xs text-[var(--chat-destructive-text)]" role="status">
                    {rowError}
                  </p>
                ) : null}
                {artifactPanelFor(props, item)}
              </>
            }
          >
            {thumbnailUri ? (
              <img
                src={thumbnailUri}
                data-testid="library-thumbnail"
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
                onError={() => void props.onThumbnailError(item)}
              />
            ) : isVideoItem(item) ? (
              <Play className={TILE_GLYPH_CLASS} aria-hidden />
            ) : (
              <FileKindIcon
                kind={iconKindFor(item.file_name, item.mime_type)}
                className={TILE_GLYPH_CLASS}
              />
            )}
          </GridTile>
        );
      })}
    </div>
  );
}

const TILE_SHELL_CLASS =
  'rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] hover:bg-[var(--chat-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]';

const TILE_MEDIA_CLASS = `flex aspect-square w-full items-center justify-center overflow-hidden ${TILE_SHELL_CLASS}`;

const TILE_GLYPH_CLASS = 'h-1/3 w-1/3 text-[var(--chat-text-secondary)]';

const HEADER_CELL_CLASS =
  'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--chat-text-muted)]';

function LibraryList(props: LibraryListProps) {
  return (
    <div className="overflow-x-auto">
      <table data-testid="library-list" className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--chat-border)]">
            <th scope="col" className={HEADER_CELL_CLASS}>
              Name
            </th>
            <th scope="col" className={HEADER_CELL_CLASS}>
              Modified
            </th>
            <th scope="col" className={`hidden sm:table-cell ${HEADER_CELL_CLASS}`}>
              Size
            </th>
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.folders.map((folder) => (
            <tr
              key={folder.id}
              data-testid="library-folder-row"
              tabIndex={0}
              onClick={() => props.onOpenFolder?.(folder)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  props.onOpenFolder?.(folder);
                }
              }}
              className="cursor-pointer border-b border-[var(--chat-border-subtle)] hover:bg-[var(--chat-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
            >
              <td className="px-3 py-2">
                <span className="flex items-center gap-2">
                  <Folder
                    className="h-4 w-4 shrink-0 text-[var(--chat-text-secondary)]"
                    aria-hidden
                  />
                  <span className="truncate text-[var(--chat-text-primary)]">{folder.name}</span>
                </span>
              </td>
              <td className="px-3 py-2 text-[var(--chat-text-muted)]">
                {formatModified(folder.updatedAt)}
              </td>
              <td className="hidden px-3 py-2 text-[var(--chat-text-muted)] sm:table-cell" />
              <td className="px-3 py-2" />
            </tr>
          ))}

          {props.items.map((item) => {
            const unavailable = props.unavailableIds.has(item.id);
            const rowError = props.rowErrors[item.id];
            const panel = artifactPanelFor(props, item);
            return (
              <Fragment key={item.id}>
                <tr
                  data-testid="library-row"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      props.actions.onOpen(item);
                    }
                  }}
                  className="border-b border-[var(--chat-border-subtle)] hover:bg-[var(--chat-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => props.actions.onOpen(item)}
                      className="flex w-full items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
                    >
                      <FileKindIcon
                        kind={iconKindFor(item.file_name, item.mime_type)}
                        className="h-4 w-4 shrink-0 text-[var(--chat-text-secondary)]"
                      />
                      <span className="truncate text-[var(--chat-text-primary)]">
                        {item.file_name}
                      </span>
                    </button>
                    {unavailable ? (
                      <span className="mt-1 block text-xs text-[var(--chat-destructive-text)]">
                        The stored bytes are gone. Remove this entry.
                      </span>
                    ) : null}
                    {rowError ? (
                      <span
                        role="status"
                        className="mt-1 block text-xs text-[var(--chat-destructive-text)]"
                      >
                        {rowError}
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--chat-text-muted)]">
                    {formatModified(item.created_at)}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-[var(--chat-text-muted)] sm:table-cell">
                    {formatSize(item.byte_count)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end">
                      <ItemMenu
                        item={item}
                        viewDeleted={props.viewDeleted}
                        actions={props.actions}
                      />
                    </div>
                  </td>
                </tr>
                {panel ? (
                  <tr>
                    <td colSpan={4} className="px-3 pb-3">
                      {panel}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const MENU_PANEL_CLASS =
  'absolute right-0 z-20 mt-1 min-w-44 rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] p-1 shadow-[var(--chat-shadow-lg)]';

const MENU_TRIGGER_CLASS =
  'flex h-8 w-8 items-center justify-center rounded-[var(--chat-radius-sm)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]';

/**
 * The tile chip stays in the DOM at low emphasis and gains its border and full
 * ink on hover or keyboard focus. A reveal that removes it until hover would be
 * unreachable on a touch pointer, which has neither.
 */
const MENU_TRIGGER_OVERLAY_CLASS =
  'flex h-8 w-8 items-center justify-center rounded-[var(--chat-radius-sm)] border border-transparent bg-[var(--chat-surface-overlay)] text-[var(--chat-text-muted)] group-hover:border-[var(--chat-border)] group-hover:text-[var(--chat-text-primary)] group-focus-within:border-[var(--chat-border)] group-focus-within:text-[var(--chat-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]';

const MENU_ITEM_CLASS =
  'flex w-full min-h-9 items-center gap-2 rounded-[var(--chat-radius-sm)] px-2.5 py-1.5 text-left text-sm text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)] focus:bg-[var(--chat-surface-hover)] focus:outline-none';

const MENU_ITEM_DESTRUCTIVE_CLASS =
  'flex w-full min-h-9 items-center gap-2 rounded-[var(--chat-radius-sm)] px-2.5 py-1.5 text-left text-sm text-[var(--chat-destructive-text)] hover:bg-[var(--chat-surface-hover)] focus:bg-[var(--chat-surface-hover)] focus:outline-none';

function useDismissOnOutsideClick(
  open: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, onClose, containerRef]);
}

function ItemMenu({
  item,
  viewDeleted,
  actions,
  triggerClassName = MENU_TRIGGER_CLASS,
}: {
  item: LibraryItem;
  viewDeleted: boolean;
  actions: RowActions;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useMenuKeyboard({ open, onClose: close, panelRef, triggerRef });
  useDismissOnOutsideClick(open, close, containerRef);

  const choose = (run: () => void) => () => {
    close();
    triggerRef.current?.focus();
    run();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        aria-label={`Actions for ${item.file_name}`}
        className={triggerClassName}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <div
          ref={panelRef}
          role="menu"
          aria-label={`Actions for ${item.file_name}`}
          className={MENU_PANEL_CLASS}
        >
          {viewDeleted ? (
            <button
              type="button"
              role="menuitem"
              className={MENU_ITEM_CLASS}
              onClick={choose(() => void actions.onRestore(item.id))}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Restore
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className={MENU_ITEM_CLASS}
              onClick={choose(() => void actions.onDownload(item))}
            >
              <Upload className="h-4 w-4 rotate-180" aria-hidden />
              Download
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM_DESTRUCTIVE_CLASS}
            onClick={choose(() =>
              viewDeleted ? actions.onPermanentDelete(item) : actions.onDelete(item),
            )}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {viewDeleted ? 'Delete permanently' : 'Delete'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NewMenu({
  onUpload,
  onCreateFolder,
  busy,
}: {
  onUpload?: () => void;
  onCreateFolder?: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useMenuKeyboard({ open, onClose: close, panelRef, triggerRef });
  useDismissOnOutsideClick(open, close, containerRef);

  const choose = (run: () => void) => () => {
    close();
    run();
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        ref={triggerRef}
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((current) => !current)}
        className="gap-1.5"
      >
        {busy ? (
          <Spinner size="sm" className="h-3.5 w-3.5" />
        ) : (
          <Plus className="h-4 w-4" aria-hidden />
        )}
        New
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </Button>
      {open ? (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Add to the library"
          className={MENU_PANEL_CLASS}
        >
          {onUpload ? (
            <button
              type="button"
              role="menuitem"
              className={MENU_ITEM_CLASS}
              onClick={choose(onUpload)}
            >
              <Upload className="h-4 w-4" aria-hidden />
              Upload file
            </button>
          ) : null}
          {onCreateFolder ? (
            <button
              type="button"
              role="menuitem"
              className={MENU_ITEM_CLASS}
              onClick={choose(onCreateFolder)}
            >
              <Folder className="h-4 w-4" aria-hidden />
              New project
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SortMenu({
  sort,
  onChange,
}: {
  sort: LibrarySort;
  onChange: (next: LibrarySort) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useMenuKeyboard({ open, onClose: close, panelRef, triggerRef });
  useDismissOnOutsideClick(open, close, containerRef);
  const active = SORT_OPTIONS.find((option) => option.id === sort);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        aria-label={`Sort by ${active?.label ?? sort}`}
        className="flex min-h-9 items-center gap-1.5 rounded-[var(--chat-radius-md)] px-2.5 py-1.5 text-sm text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">{active?.label}</span>
      </button>
      {open ? (
        <div ref={panelRef} role="menu" aria-label="Sort the library" className={MENU_PANEL_CLASS}>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={sort === option.id}
              className={MENU_ITEM_CLASS}
              onClick={() => {
                close();
                triggerRef.current?.focus();
                onChange(option.id);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ToolbarToggle({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={
        pressed
          ? 'flex min-h-9 items-center gap-1.5 rounded-[var(--chat-radius-md)] bg-[var(--chat-surface-hover)] px-2.5 py-1.5 text-sm text-[var(--chat-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]'
          : 'flex min-h-9 items-center gap-1.5 rounded-[var(--chat-radius-md)] px-2.5 py-1.5 text-sm text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]'
      }
    >
      {children}
      <span className="hidden sm:inline" aria-hidden>
        {label}
      </span>
    </button>
  );
}

function IconToggle({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={
        pressed
          ? 'flex h-9 w-9 items-center justify-center rounded-[var(--chat-radius-md)] bg-[var(--chat-surface-hover)] text-[var(--chat-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]'
          : 'flex h-9 w-9 items-center justify-center rounded-[var(--chat-radius-md)] text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]'
      }
    >
      {children}
    </button>
  );
}

function ArtifactSection({
  item,
  source,
  onRetry,
  exportNative,
  nativeExportFormats,
}: {
  item: LibraryItem;
  source: ArtifactSource | undefined;
  onRetry: () => void;
  exportNative?: LibraryTransport['exportNative'];
  nativeExportFormats?: readonly NativeExportFormat[];
}) {
  if (!source || source.status === 'loading') {
    return (
      <div
        data-testid={`library-artifact-loading-${item.id}`}
        className="flex items-center gap-2 rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] px-3 py-3 text-xs text-[var(--chat-text-muted)]"
      >
        <Spinner size="sm" className="h-3.5 w-3.5" />
        Loading preview
      </div>
    );
  }

  if (source.status === 'error') {
    return (
      <div
        data-testid={`library-artifact-error-${item.id}`}
        className="flex items-center gap-2 rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] px-3 py-3 text-xs text-[var(--chat-destructive-text)]"
      >
        <span>This artifact would not open ({source.message}).</span>
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
    <div className="rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] p-3">
      <ArtifactRenderer
        artifact={{
          id: item.id,
          type: artifactTypeForLibraryItem(item),
          title: item.file_name,
          content: source.content,
          createdAt: item.created_at,
        }}
        {...(exportNative ? { onExportNative: exportNative } : {})}
        {...(nativeExportFormats ? { nativeExportFormats } : {})}
      />
    </div>
  );
}

function EmptyState({
  hasQuery,
  viewDeleted,
  onUpload,
  startChat,
}: {
  hasQuery: boolean;
  viewDeleted: boolean;
  onUpload?: () => void;
  startChat?: () => void;
}) {
  const title = viewDeleted
    ? 'Recently deleted is empty'
    : hasQuery
      ? 'No matches'
      : 'Your library is empty';
  const copy = hasQuery
    ? 'Nothing here matches that name. Try a shorter search.'
    : viewDeleted
      ? 'Deleted files wait here for 30 days, so you can put one back before it is removed for good.'
      : 'Files you upload and files your work produces collect here, with your projects.';
  return (
    <div
      data-testid="library-empty-state"
      className="flex flex-col items-center gap-3 py-20 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--chat-surface-hover)]">
        {viewDeleted ? (
          <Trash2 className="h-7 w-7 text-[var(--chat-text-secondary)]" aria-hidden />
        ) : (
          <Folder className="h-7 w-7 text-[var(--chat-text-secondary)]" aria-hidden />
        )}
      </div>
      <p className="text-base font-semibold text-[var(--chat-text-primary)]">{title}</p>
      <p className="max-w-md text-sm text-[var(--chat-text-muted)]">{copy}</p>
      {!hasQuery && !viewDeleted && onUpload ? (
        <Button size="sm" className="mt-1 gap-1.5" onClick={onUpload}>
          <Upload className="h-4 w-4" aria-hidden />
          Upload a file
        </Button>
      ) : null}
      {!hasQuery && !viewDeleted && !onUpload && startChat ? (
        <Button size="sm" className="mt-1" onClick={startChat}>
          Start a chat
        </Button>
      ) : null}
    </div>
  );
}
