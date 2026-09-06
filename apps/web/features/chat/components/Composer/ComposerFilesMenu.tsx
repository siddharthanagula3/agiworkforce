'use client';

import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  File as FileIcon,
  FileArchive,
  FileCode,
  FileJson,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Search,
  Upload,
  Video,
} from '@agiworkforce/icons';
import {
  LIBRARY_DEFAULT_SORT,
  type LibraryItem,
  type LibraryListResponse,
} from '@agiworkforce/cloud-contracts';
import type { GeneratedFileKind } from '@agiworkforce/types';
import { Popover, PopoverContent, PopoverTrigger, Spinner } from '@agiworkforce/ui';
import { iconKindFor } from '@agiworkforce/unified-chat';
import { cn } from '@shared/lib/utils';

export const COMPOSER_FILES_MENU_TESTID = 'composer-files-menu';
export const COMPOSER_FILES_SEARCH_LABEL = 'Search library files';
export const COMPOSER_FILES_BROWSE_LABEL = 'Browse all';
export const COMPOSER_FILES_UPLOAD_LABEL = 'Upload from device';
export const COMPOSER_FILES_EMPTY_COPY = 'No files in your library yet.';
export const LIBRARY_PATH = '/library';
export const LIBRARY_API_PATH = '/api/library';
export const LIBRARY_RECENT_LIMIT = 6;

const MENU_LABEL = 'Files';
const NO_MATCH_COPY = 'No library file matches that search.';
const LOADING_LABEL = 'Loading files';
const UNAVAILABLE_COPY = 'The library could not be loaded.';
const ATTACH_FAILED_COPY = 'That file could not be added. Try again.';
const ATTACH_LABEL_PREFIX = 'Attach';
const SEARCH_DEBOUNCE_MS = 200;
const QUERY_PARAM = 'q';
const LIMIT_PARAM = 'limit';
const SORT_PARAM = 'sort';
const VIDEO_MIME_PREFIX = 'video/';

const PANEL_CLASS = 'w-[min(22rem,calc(100vw-1rem))] rounded-xl p-1.5';
const SEARCH_WRAP_CLASS = 'relative px-1 pb-1.5 pt-1';
const SEARCH_INPUT_CLASS =
  'h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const ROW_CLASS =
  'flex min-h-10 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
const GLYPH_CLASS = 'h-4 w-4 shrink-0 text-muted-foreground';
const DIVIDER_CLASS = 'my-1 border-t border-border';
const NOTE_CLASS = 'px-2 py-3 text-center text-xs text-muted-foreground';

type Glyph = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

const GLYPH_BY_KIND: Readonly<Record<GeneratedFileKind, Glyph>> = {
  image: ImageIcon,
  pdf: FileText,
  docx: FileText,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  pptx: FileText,
  json: FileJson,
  markdown: FileText,
  html: FileCode,
  archive: FileArchive,
  other: FileIcon,
};

export function libraryFileGlyph(item: Pick<LibraryItem, 'file_name' | 'mime_type'>): Glyph {
  if (item.mime_type.toLowerCase().startsWith(VIDEO_MIME_PREFIX)) return Video;
  return GLYPH_BY_KIND[iconKindFor(item.file_name, item.mime_type)] ?? FileIcon;
}

export function libraryListHref(query: string): string {
  const params = new URLSearchParams();
  const trimmed = query.trim();
  if (trimmed) params.set(QUERY_PARAM, trimmed);
  params.set(LIMIT_PARAM, String(LIBRARY_RECENT_LIMIT));
  params.set(SORT_PARAM, LIBRARY_DEFAULT_SORT);
  return `${LIBRARY_API_PATH}?${params.toString()}`;
}

export async function fetchRecentLibraryFiles(
  query: string,
  signal?: AbortSignal,
): Promise<LibraryItem[]> {
  const response = await fetch(libraryListHref(query), { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`library failed: ${response.status}`);
  const body = (await response.json()) as Partial<LibraryListResponse>;
  return body.items ?? [];
}

export async function libraryItemToFile(item: LibraryItem): Promise<File> {
  const response = await fetch(item.uri, { credentials: 'include' });
  if (!response.ok) throw new Error(`library file failed: ${response.status}`);
  const blob = await response.blob();
  return new File([blob], item.file_name, { type: item.mime_type || blob.type });
}

export interface ComposerFilesMenuProps {
  children: ReactNode;
  disabled?: boolean;
  onAttach: (file: File) => void;
  onUploadFromDevice: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function useDebouncedQuery(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [value]);
  return debounced;
}

export function ComposerFilesMenu({
  children,
  disabled = false,
  onAttach,
  onUploadFromDevice,
  open,
  onOpenChange,
}: ComposerFilesMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedQuery(query);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const isOpen = open ?? internalOpen;

  const setOpen = (next: boolean) => {
    if (!next) {
      setQuery('');
      setError(null);
    }
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchRecentLibraryFiles(debouncedQuery, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setItems(next);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(UNAVAILABLE_COPY);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isOpen, debouncedQuery]);

  const attach = async (item: LibraryItem) => {
    setAttachingId(item.id);
    setError(null);
    try {
      onAttach(await libraryItemToFile(item));
      setOpen(false);
    } catch {
      setError(ATTACH_FAILED_COPY);
    } finally {
      setAttachingId(null);
    }
  };

  const upload = () => {
    setOpen(false);
    onUploadFromDevice();
  };

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        aria-label={MENU_LABEL}
        data-testid={COMPOSER_FILES_MENU_TESTID}
        className={PANEL_CLASS}
      >
        <div className={SEARCH_WRAP_CLASS}>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={COMPOSER_FILES_SEARCH_LABEL}
            aria-label={COMPOSER_FILES_SEARCH_LABEL}
            className={SEARCH_INPUT_CLASS}
          />
        </div>

        {error ? <p className={cn(NOTE_CLASS, 'text-danger')}>{error}</p> : null}

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <Spinner size="sm" aria-label={LOADING_LABEL} />
            {LOADING_LABEL}
          </div>
        ) : items.length === 0 && !error ? (
          <p className={NOTE_CLASS}>
            {debouncedQuery.trim() ? NO_MATCH_COPY : COMPOSER_FILES_EMPTY_COPY}
          </p>
        ) : (
          <ul className="flex flex-col" aria-busy={loading}>
            {items.map((item) => {
              const Glyph = libraryFileGlyph(item);
              const attaching = attachingId === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void attach(item)}
                    disabled={disabled || attachingId !== null}
                    aria-label={`${ATTACH_LABEL_PREFIX} ${item.file_name}`}
                    className={ROW_CLASS}
                  >
                    {attaching ? (
                      <Spinner size="sm" className={GLYPH_CLASS} />
                    ) : (
                      <Glyph aria-hidden className={GLYPH_CLASS} />
                    )}
                    <span className="min-w-0 flex-1 truncate">{item.file_name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className={DIVIDER_CLASS} />
        <Link href={LIBRARY_PATH} onClick={() => setOpen(false)} className={ROW_CLASS}>
          <span className="min-w-0 flex-1 truncate">{COMPOSER_FILES_BROWSE_LABEL}</span>
          <ChevronRight aria-hidden className={GLYPH_CLASS} />
        </Link>
        <button type="button" onClick={upload} disabled={disabled} className={ROW_CLASS}>
          <Upload aria-hidden className={GLYPH_CLASS} />
          <span className="min-w-0 flex-1 truncate">{COMPOSER_FILES_UPLOAD_LABEL}</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
