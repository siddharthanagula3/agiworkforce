'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DesktopRuntimeError,
  type FileEntry,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import { Spinner, useDialogKeyboard } from '@agiworkforce/ui';
import { resolveChatAttachmentMimeType } from '@/lib/chat-attachment-policy';
import {
  listWorkspaceFiles,
  listWorkspaceRoots,
  openWorkspacePath,
  pickWorkspaceRoot,
  readWorkspaceFile,
  revealWorkspacePath,
} from '../lib/runtime-client';

const TITLE = 'Attach from a local folder';
const NO_ROOTS_COPY =
  'No folders are approved yet. Choose one, and AGI Cloud asks your permission before it reads anything inside.';
const EMPTY_FOLDER_COPY = 'Nothing here that can be attached.';
const LOAD_FAILED = 'That folder could not be read.';
const READ_FAILED = 'That file could not be read.';
const OPEN_FAILED = 'That file could not be opened.';
const REVEAL_FAILED = 'That file could not be shown in Finder.';
const PARENT_LABEL = 'Back';
const ROOT_SEGMENT = '';

const BUTTON_CLASS =
  'min-h-[32px] rounded-md border border-border/60 px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60';
const ENTRY_CLASS =
  'flex w-full min-h-[36px] items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60';
const ROW_ACTION_CLASS =
  'min-h-[32px] shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60';

export interface LocalFolderAttachDialogProps {
  open: boolean;
  onClose: () => void;
  onAttach: (files: File[]) => void;
}

function parentOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? ROOT_SEGMENT : path.slice(0, index);
}

function messageFor(error: unknown, fallback: string): string | null {
  if (error instanceof DesktopRuntimeError) {
    return error.code === 'cancelled' ? null : `${fallback} ${error.message}`;
  }
  return fallback;
}

/**
 * Browses a folder the user has already approved and hands the chosen file to
 * the composer's own attachment path, so the size and type rules that apply to
 * a file picked from the device apply here unchanged.
 */
export function LocalFolderAttachDialog({ open, onClose, onAttach }: LocalFolderAttachDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [roots, setRoots] = useState<WorkspaceRoot[]>([]);
  const [activeRoot, setActiveRoot] = useState<WorkspaceRoot | null>(null);
  const [path, setPath] = useState(ROOT_SEGMENT);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDialogKeyboard({ open, onClose, panelRef });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);
    listWorkspaceRoots()
      .then((next) => {
        setRoots(next);
        setActiveRoot(next[0] ?? null);
        setPath(ROOT_SEGMENT);
      })
      .catch((cause: unknown) => setError(messageFor(cause, LOAD_FAILED)))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open || !activeRoot) {
      setEntries([]);
      return;
    }
    setLoading(true);
    listWorkspaceFiles(activeRoot.id, path)
      .then((next) => {
        setEntries(next);
        setError(null);
      })
      .catch((cause: unknown) => setError(messageFor(cause, LOAD_FAILED)))
      .finally(() => setLoading(false));
  }, [open, activeRoot, path]);

  const visible = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.kind === 'directory' ||
          resolveChatAttachmentMimeType(entry.name, ROOT_SEGMENT) !== null,
      ),
    [entries],
  );

  const onAddRoot = useCallback(async () => {
    try {
      const granted = await pickWorkspaceRoot();
      setRoots((current) => [...current.filter((root) => root.id !== granted.id), granted]);
      setActiveRoot(granted);
      setPath(ROOT_SEGMENT);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause, LOAD_FAILED));
    }
  }, []);

  const onChooseFile = useCallback(
    async (entry: FileEntry) => {
      if (!activeRoot) return;
      const mimeType = resolveChatAttachmentMimeType(entry.name, ROOT_SEGMENT);
      if (!mimeType) {
        setError(`${entry.name} is not a file type this chat accepts.`);
        return;
      }
      setReading(entry.path);
      try {
        onAttach([await readWorkspaceFile(activeRoot.id, entry, mimeType)]);
        onClose();
      } catch (cause) {
        setError(messageFor(cause, READ_FAILED));
      } finally {
        setReading(null);
      }
    },
    [activeRoot, onAttach, onClose],
  );

  const onOpenEntry = useCallback(
    async (entry: FileEntry) => {
      if (!activeRoot) return;
      try {
        await openWorkspacePath(activeRoot.id, entry.path);
        setError(null);
      } catch (cause) {
        setError(messageFor(cause, OPEN_FAILED));
      }
    },
    [activeRoot],
  );

  const onRevealEntry = useCallback(
    async (entry: FileEntry) => {
      if (!activeRoot) return;
      try {
        await revealWorkspacePath(activeRoot.id, entry.path);
        setError(null);
      } catch (cause) {
        setError(messageFor(cause, REVEAL_FAILED));
      }
    },
    [activeRoot],
  );

  if (!open || typeof document === 'undefined') return null;

  /**
   * Portaled to the body, because the composer sits inside a transformed
   * ancestor that becomes the containing block for `fixed` and clips the panel
   * against the composer rather than the window.
   */
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={TITLE}
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-md flex-col gap-3 rounded-xl border border-border/60 bg-popover p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">{TITLE}</h2>
          <button type="button" className={BUTTON_CLASS} onClick={onClose}>
            Close
          </button>
        </div>

        {roots.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {roots.map((root) => (
              <button
                key={root.id}
                type="button"
                aria-pressed={root.id === activeRoot?.id}
                className={BUTTON_CLASS}
                onClick={() => {
                  setActiveRoot(root);
                  setPath(ROOT_SEGMENT);
                }}
              >
                {root.name}
              </button>
            ))}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}

        {!activeRoot && !loading ? (
          <>
            <p className="text-xs text-muted-foreground">{NO_ROOTS_COPY}</p>
            <button type="button" className={BUTTON_CLASS} onClick={() => void onAddRoot()}>
              Choose a folder
            </button>
          </>
        ) : null}

        {activeRoot ? (
          <p className="truncate text-xs text-muted-foreground">
            {path === ROOT_SEGMENT ? activeRoot.name : `${activeRoot.name}/${path}`}
          </p>
        ) : null}

        {loading ? (
          <Spinner aria-label="Loading folder contents" />
        ) : activeRoot ? (
          <ul className="flex list-none flex-col overflow-y-auto p-0">
            {path === ROOT_SEGMENT ? null : (
              <li>
                <button
                  type="button"
                  className={ENTRY_CLASS}
                  onClick={() => setPath(parentOf(path))}
                >
                  {PARENT_LABEL}
                </button>
              </li>
            )}
            {visible.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">{EMPTY_FOLDER_COPY}</li>
            ) : (
              visible.map((entry) => (
                <li key={entry.path} className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={reading !== null}
                    className={ENTRY_CLASS}
                    onClick={() =>
                      entry.kind === 'directory' ? setPath(entry.path) : void onChooseFile(entry)
                    }
                  >
                    <span className="flex-1 truncate">{entry.name}</span>
                    {entry.kind === 'directory' ? (
                      <span className="text-xs text-muted-foreground">Folder</span>
                    ) : reading === entry.path ? (
                      <Spinner aria-label={`Reading ${entry.name}`} />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className={ROW_ACTION_CLASS}
                    aria-label={`Open ${entry.name} with the default app`}
                    onClick={() => void onOpenEntry(entry)}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className={ROW_ACTION_CLASS}
                    aria-label={`Show ${entry.name} in Finder`}
                    onClick={() => void onRevealEntry(entry)}
                  >
                    Reveal
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
