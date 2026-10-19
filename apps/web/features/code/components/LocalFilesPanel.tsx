'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, File, Folder, X } from '@agiworkforce/icons';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import type { FileEntry } from '@agiworkforce/local-runtime-contract';
import { findWorkspaceFilesByName, listWorkspaceFiles } from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_CODE_COPY } from '../local-code';
import { LocalFileEditor } from './LocalFileEditor';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;
const SEARCH_DELAY_MS = 200;
const MAX_SEARCH_RESULTS = 200;

function visibleEntries(entries: FileEntry[]): FileEntry[] {
  return entries
    .filter((entry) => entry.kind !== 'symlink')
    .sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1,
    );
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

interface TreeState {
  children: Map<string, FileEntry[]>;
  expanded: Set<string>;
  loading: Set<string>;
}

function FileTree({
  path,
  tree,
  onToggle,
  onOpen,
}: {
  path: string;
  tree: TreeState;
  onToggle: (entry: FileEntry) => void;
  onOpen: (path: string) => void;
}) {
  const entries = tree.children.get(path);
  if (!entries) return null;
  return (
    <ul className={path === '' ? styles['filesTree'] : styles['filesTreeChildren']}>
      {entries.map((entry) => {
        const open = tree.expanded.has(entry.path);
        return (
          <li key={entry.path}>
            {entry.kind === 'directory' ? (
              <button
                type="button"
                className={styles['fileRow']}
                aria-expanded={open}
                onClick={() => onToggle(entry)}
              >
                {open ? (
                  <ChevronDown size={GLYPH_SIZE} aria-hidden="true" />
                ) : (
                  <ChevronRight size={GLYPH_SIZE} aria-hidden="true" />
                )}
                <Folder size={GLYPH_SIZE} aria-hidden="true" />
                <span className={styles['fileName']}>{entry.name}</span>
                {tree.loading.has(entry.path) && (
                  <Spinner size="sm" aria-label={LOCAL_CODE_COPY.filesLoading} />
                )}
              </button>
            ) : (
              <button
                type="button"
                className={styles['fileRow']}
                onClick={() => onOpen(entry.path)}
              >
                <File size={GLYPH_SIZE} aria-hidden="true" />
                <span className={styles['fileName']}>{entry.name}</span>
              </button>
            )}
            {entry.kind === 'directory' && open && (
              <FileTree path={entry.path} tree={tree} onToggle={onToggle} onOpen={onOpen} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface LocalFilesPanelProps {
  rootId: string;
  searchFocusKey: number;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function LocalFilesPanel({
  rootId,
  searchFocusKey,
  onClose,
  onDirtyChange,
}: LocalFilesPanelProps) {
  const [tree, setTree] = useState<TreeState>({
    children: new Map(),
    expanded: new Set(),
    loading: new Set(),
  });
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FileEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
  const [revision, setRevision] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const { confirm, dialog } = useConfirmAction();

  useEffect(() => {
    onDirtyChange?.(dirty.size > 0);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (searchFocusKey > 0) searchRef.current?.focus();
  }, [searchFocusKey]);

  const loadFolder = useCallback(
    async (path: string) => {
      setTree((current) => ({ ...current, loading: new Set(current.loading).add(path) }));
      try {
        const entries = visibleEntries(await listWorkspaceFiles(rootId, path));
        setTree((current) => {
          const loading = new Set(current.loading);
          loading.delete(path);
          return { ...current, children: new Map(current.children).set(path, entries), loading };
        });
      } catch (cause: unknown) {
        setError(toUserMessage(cause, LOCAL_CODE_COPY.filesFailed));
        setTree((current) => {
          const loading = new Set(current.loading);
          loading.delete(path);
          return { ...current, loading };
        });
      }
    },
    [rootId],
  );

  useEffect(() => {
    setTree({ children: new Map(), expanded: new Set(), loading: new Set() });
    setError(null);
    void loadFolder('');
  }, [loadFolder]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      findWorkspaceFilesByName(rootId, trimmed, '')
        .then((found) => {
          if (cancelled) return;
          setResults(
            found.filter((entry) => entry.kind === 'file').slice(0, MAX_SEARCH_RESULTS),
          );
        })
        .catch((cause: unknown) => {
          if (!cancelled) setError(toUserMessage(cause, LOCAL_CODE_COPY.filesFailed));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, rootId]);

  const toggleFolder = (entry: FileEntry) => {
    const opening = !tree.expanded.has(entry.path);
    setTree((current) => {
      const expanded = new Set(current.expanded);
      if (opening) expanded.add(entry.path);
      else expanded.delete(entry.path);
      return { ...current, expanded };
    });
    if (opening && !tree.children.has(entry.path)) void loadFolder(entry.path);
  };

  const openFile = (path: string) => {
    setTabs((current) => (current.includes(path) ? current : [...current, path]));
    setActive(path);
  };

  const markDirty = useCallback((path: string, isDirty: boolean) => {
    setDirty((current) => {
      if (current.has(path) === isDirty) return current;
      const next = new Set(current);
      if (isDirty) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);

  const dropTab = (path: string) => {
    markDirty(path, false);
    setTabs((current) => {
      const next = current.filter((tab) => tab !== path);
      setActive((shown) => (shown === path ? (next[next.length - 1] ?? null) : shown));
      return next;
    });
  };

  const closeTab = (path: string) => {
    if (!dirty.has(path)) {
      dropTab(path);
      return;
    }
    confirm({
      title: LOCAL_CODE_COPY.discardEditsTitle,
      description: LOCAL_CODE_COPY.discardEditsDescription(path),
      confirmLabel: LOCAL_CODE_COPY.discardFileEdits,
      onConfirm: () => dropTab(path),
    });
  };

  const closePanel = () => {
    if (dirty.size === 0) {
      onClose();
      return;
    }
    confirm({
      title: LOCAL_CODE_COPY.discardEditsTitle,
      description: LOCAL_CODE_COPY.discardLocalEditsDescription,
      confirmLabel: LOCAL_CODE_COPY.discardFileEdits,
      onConfirm: onClose,
    });
  };

  return (
    <aside className={styles['changes']} aria-label={LOCAL_CODE_COPY.files}>
      <div className={styles['changesHeader']}>
        <span className={styles['changesBranch']}>{LOCAL_CODE_COPY.files}</span>
        <div className={styles['changesActions']}>
          <button
            type="button"
            className={styles['headerButton']}
            aria-label={LOCAL_CODE_COPY.closeFiles}
            onClick={closePanel}
          >
            <X size={GLYPH_SIZE} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles['filesSplit']}>
        <div className={tabs.length > 0 ? styles['filesBrowser'] : styles['filesBrowserWide']}>
          <div className={styles['filesSearch']}>
            <label htmlFor={searchId} className="sr-only">
              {LOCAL_CODE_COPY.searchFiles}
            </label>
            <input
              id={searchId}
              ref={searchRef}
              type="search"
              className={styles['textInput']}
              placeholder={LOCAL_CODE_COPY.searchFiles}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className={styles['changesBody']}>
            {error !== null && (
              <p className={styles['changesEmpty']} role="alert">
                {error}
              </p>
            )}
            {results !== null ? (
              searching && results.length === 0 ? (
                <div className={styles['changesEmpty']}>
                  <Spinner size="sm" aria-label={LOCAL_CODE_COPY.filesLoading} />
                </div>
              ) : results.length === 0 ? (
                <p className={styles['changesEmpty']}>{LOCAL_CODE_COPY.filesNoMatch}</p>
              ) : (
                <ul className={styles['filesTree']}>
                  {results.map((entry) => (
                    <li key={entry.path}>
                      <button
                        type="button"
                        className={styles['fileRow']}
                        title={entry.path}
                        onClick={() => openFile(entry.path)}
                      >
                        <File size={GLYPH_SIZE} aria-hidden="true" />
                        <span className={styles['fileName']}>{entry.path}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : tree.children.get('')?.length === 0 ? (
              <p className={styles['changesEmpty']}>{LOCAL_CODE_COPY.filesEmpty}</p>
            ) : tree.children.has('') ? (
              <FileTree path="" tree={tree} onToggle={toggleFolder} onOpen={openFile} />
            ) : (
              error === null && (
                <div className={styles['changesEmpty']}>
                  <Spinner size="sm" aria-label={LOCAL_CODE_COPY.filesLoading} />
                </div>
              )
            )}
          </div>
        </div>

        {tabs.length > 0 && (
          <div className={styles['filesEditors']}>
            <div
              className={styles['filesTabs']}
              role="tablist"
              aria-label={LOCAL_CODE_COPY.openFiles}
            >
              {tabs.map((path) => (
                <div
                  key={path}
                  className={`${styles['filesTab']} ${path === active ? styles['filesTabActive'] : ''}`}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={path === active}
                    className={styles['filesTabLabel']}
                    title={path}
                    onClick={() => setActive(path)}
                  >
                    {dirty.has(path) ? `${baseName(path)} •` : baseName(path)}
                  </button>
                  <button
                    type="button"
                    className={styles['headerButton']}
                    aria-label={LOCAL_CODE_COPY.closeTab(baseName(path))}
                    onClick={() => closeTab(path)}
                  >
                    <X size={GLYPH_SIZE} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            <div className={styles['changesBody']}>
              {tabs.map((path) => (
                <div key={path} role="tabpanel" hidden={path !== active} aria-label={path}>
                  <LocalFileEditor
                    rootId={rootId}
                    path={path}
                    refreshKey={revision}
                    onDirtyChange={(isDirty) => markDirty(path, isDirty)}
                    onSaved={() => setRevision((count) => count + 1)}
                    onClose={() => closeTab(path)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {dialog}
    </aside>
  );
}
