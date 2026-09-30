'use client';

import { useEffect, useId, useReducer, useRef, useState } from 'react';
import { X } from '@agiworkforce/icons';
import {
  DesktopRuntimeError,
  MAX_TEXT_READ_BYTES,
  type FileTextContent,
  type FileTextWrite,
} from '@agiworkforce/local-runtime-contract';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { readWorkspaceText, writeWorkspaceText } from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_CODE_COPY } from '../local-code';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;

type DiskConflict = 'changed' | 'deleted';
type EditorAction = 'save' | 'reload' | 'overwrite';

interface DiskVersion {
  text: string;
  sha256: string | undefined;
  truncated: boolean;
  readOnly: boolean;
  lineEnding: 'lf' | 'crlf';
}

interface EditorState {
  disk: DiskVersion | null;
  text: string | null;
  conflict: DiskConflict | null;
}

type EditorEvent =
  | { type: 'reset' }
  | { type: 'opened'; file: FileTextContent }
  | { type: 'edited'; text: string }
  | { type: 'saved'; text: string; written: FileTextWrite }
  | { type: 'conflicted'; conflict: DiskConflict }
  | { type: 'observed'; current: FileTextContent | null };

const UNOPENED: EditorState = { disk: null, text: null, conflict: null };

function diskVersion(file: FileTextContent): DiskVersion {
  return {
    text: file.text.replace(/\r\n/g, '\n'),
    sha256: file.sha256,
    truncated: file.truncated,
    readOnly: file.readOnly === true,
    lineEnding: file.lineEnding ?? (file.text.includes('\r\n') ? 'crlf' : 'lf'),
  };
}

function sameContent(disk: DiskVersion, file: FileTextContent): boolean {
  return disk.sha256 !== undefined && file.sha256 !== undefined
    ? disk.sha256 === file.sha256
    : disk.text === diskVersion(file).text;
}

function editorReducer(state: EditorState, event: EditorEvent): EditorState {
  switch (event.type) {
    case 'reset':
      return UNOPENED;
    case 'opened':
      return { disk: diskVersion(event.file), text: diskVersion(event.file).text, conflict: null };
    case 'edited':
      return { ...state, text: event.text };
    case 'saved':
      return {
        disk: {
          text: event.text,
          sha256: event.written.sha256,
          truncated: false,
          readOnly: false,
          lineEnding: state.disk?.lineEnding ?? 'lf',
        },
        text: state.text,
        conflict: null,
      };
    case 'conflicted':
      return { ...state, conflict: event.conflict };
    case 'observed': {
      const { disk, text } = state;
      if (disk === null || text === null) return state;
      if (event.current === null) return { ...state, conflict: 'deleted' };
      if (sameContent(disk, event.current)) {
        return state.conflict === null ? state : { ...state, conflict: null };
      }
      if (text === disk.text) {
        return {
          disk: diskVersion(event.current),
          text: diskVersion(event.current).text,
          conflict: null,
        };
      }
      return { ...state, conflict: 'changed' };
    }
  }
}

async function readDiskVersion(rootId: string, path: string): Promise<FileTextContent | null> {
  try {
    return await readWorkspaceText(rootId, path);
  } catch (cause: unknown) {
    if (cause instanceof DesktopRuntimeError && cause.code === 'not-found') return null;
    throw cause;
  }
}

async function conflictOnDisk(rootId: string, path: string): Promise<DiskConflict> {
  try {
    return (await readDiskVersion(rootId, path)) === null ? 'deleted' : 'changed';
  } catch {
    return 'changed';
  }
}

function exceedsEditableSize(text: string): boolean {
  return new TextEncoder().encode(text).byteLength > MAX_TEXT_READ_BYTES;
}

export interface LocalFileEditorProps {
  rootId: string;
  path: string;
  refreshKey: number;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
  onClose: () => void;
}

export function LocalFileEditor({
  rootId,
  path,
  refreshKey,
  onDirtyChange,
  onSaved,
  onClose,
}: LocalFileEditorProps) {
  const [{ disk, text, conflict }, dispatch] = useReducer(editorReducer, UNOPENED);
  const [pending, setPending] = useState<EditorAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0);
  const observedRefreshKey = useRef(refreshKey);
  const { confirm, dialog } = useConfirmAction();
  const fieldId = useId();

  useEffect(() => {
    let cancelled = false;
    epoch.current += 1;
    dispatch({ type: 'reset' });
    setError(null);
    readWorkspaceText(rootId, path)
      .then((file) => {
        if (cancelled) return;
        epoch.current += 1;
        dispatch({ type: 'opened', file });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(toUserMessage(cause, LOCAL_CODE_COPY.fileReadFailed));
      });
    return () => {
      cancelled = true;
    };
  }, [rootId, path]);

  useEffect(() => {
    if (observedRefreshKey.current === refreshKey) return;
    observedRefreshKey.current = refreshKey;
    const started = epoch.current;
    let cancelled = false;
    readDiskVersion(rootId, path)
      .then((current) => {
        if (!cancelled && epoch.current === started) dispatch({ type: 'observed', current });
      })
      .catch((cause: unknown) => {
        if (!cancelled && epoch.current === started) {
          setError(toUserMessage(cause, LOCAL_CODE_COPY.fileReadFailed));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rootId, path, refreshKey]);

  const truncated = disk?.truncated === true;
  const readOnly = truncated || disk?.readOnly === true;
  const dirty = disk !== null && text !== null && text !== disk.text;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [dirty]);

  const perform = async (action: EditorAction, work: () => Promise<void>, fallback: string) => {
    epoch.current += 1;
    setPending(action);
    setError(null);
    try {
      await work();
    } catch (cause: unknown) {
      if (cause instanceof DesktopRuntimeError && cause.code === 'conflict') {
        dispatch({ type: 'conflicted', conflict: await conflictOnDisk(rootId, path) });
      } else {
        setError(toUserMessage(cause, fallback));
      }
    } finally {
      epoch.current += 1;
      setPending(null);
    }
  };

  const write = async (expectedSha256: string | undefined) => {
    if (text === null || readOnly) return;
    if (exceedsEditableSize(text)) throw new Error(LOCAL_CODE_COPY.fileTooLarge);
    const savedText = disk?.lineEnding === 'crlf' ? text.replace(/\r?\n/g, '\r\n') : text;
    const written = await writeWorkspaceText(rootId, path, savedText, expectedSha256);
    dispatch({ type: 'saved', text, written });
    onSaved();
  };

  const save = () => perform('save', () => write(disk?.sha256), LOCAL_CODE_COPY.fileSaveFailed);

  const reload = () =>
    perform(
      'reload',
      async () => {
        const current = await readDiskVersion(rootId, path);
        dispatch(
          current === null
            ? { type: 'conflicted', conflict: 'deleted' }
            : { type: 'opened', file: current },
        );
      },
      LOCAL_CODE_COPY.fileReadFailed,
    );

  const overwrite = () =>
    perform(
      'overwrite',
      async () => {
        const current = await readDiskVersion(rootId, path);
        await write(current?.sha256);
      },
      LOCAL_CODE_COPY.fileSaveFailed,
    );

  const afterDiscardingEdits = (confirmLabel: string, proceed: () => unknown) => {
    if (!dirty) {
      void proceed();
      return;
    }
    confirm({
      title: LOCAL_CODE_COPY.discardEditsTitle,
      description: LOCAL_CODE_COPY.discardEditsDescription(path),
      confirmLabel,
      onConfirm: proceed,
    });
  };

  const confirmOverwrite = () =>
    confirm({
      title: LOCAL_CODE_COPY.overwriteFileTitle,
      description: LOCAL_CODE_COPY.overwriteFileDescription(path),
      confirmLabel: LOCAL_CODE_COPY.overwriteFile,
      onConfirm: overwrite,
    });

  return (
    <div className={styles['fileEditor']}>
      <div className={styles['fileEditorHeader']}>
        <label className={styles['fileName']} htmlFor={fieldId}>
          {path}
        </label>
        <button
          type="button"
          className={styles['headerButton']}
          aria-label={LOCAL_CODE_COPY.closeFile}
          onClick={() => afterDiscardingEdits(LOCAL_CODE_COPY.discardFileEdits, onClose)}
        >
          <X size={GLYPH_SIZE} aria-hidden="true" />
        </button>
      </div>

      {error !== null && (
        <span className={styles['formHelp']} role="alert">
          {error}
        </span>
      )}

      {text === null && error === null && (
        <Spinner size="sm" aria-label={LOCAL_CODE_COPY.openingFile} />
      )}

      {conflict !== null && (
        <div className={styles['approval']}>
          <span role="alert">
            {conflict === 'changed'
              ? LOCAL_CODE_COPY.fileChangedOnDisk
              : LOCAL_CODE_COPY.fileDeletedOnDisk}
          </span>
          <div className={styles['approvalActions']}>
            {conflict === 'changed' && (
              <button
                type="button"
                className={styles['secondaryButton']}
                disabled={pending !== null}
                onClick={() => afterDiscardingEdits(LOCAL_CODE_COPY.reloadFile, reload)}
              >
                {LOCAL_CODE_COPY.reloadFile}
              </button>
            )}
            <button
              type="button"
              className={styles['secondaryButton']}
              disabled={pending !== null || readOnly}
              onClick={confirmOverwrite}
            >
              {LOCAL_CODE_COPY.overwriteFile}
            </button>
          </div>
        </div>
      )}

      {text !== null && (
        <>
          <textarea
            id={fieldId}
            className={styles['fileEditorInput']}
            value={text}
            spellCheck={false}
            readOnly={readOnly}
            onChange={(event) => {
              if (!readOnly) dispatch({ type: 'edited', text: event.target.value });
            }}
          />
          {disk?.readOnly && (
            <span className={styles['formHelp']}>{LOCAL_CODE_COPY.fileUnsupportedEncoding}</span>
          )}
          {truncated && <span className={styles['formHelp']}>{LOCAL_CODE_COPY.fileTooLarge}</span>}
          {conflict === null && (
            <div className={styles['popoverActions']}>
              <button
                type="button"
                className={styles['secondaryButton']}
                disabled={pending !== null || !dirty}
                onClick={() => afterDiscardingEdits(LOCAL_CODE_COPY.discardFileEdits, reload)}
              >
                {LOCAL_CODE_COPY.discardFileEdits}
              </button>
              <button
                type="button"
                className={styles['primaryButton']}
                disabled={pending !== null || readOnly || !dirty}
                onClick={() => void save()}
              >
                {pending === 'save' && <Spinner size="sm" aria-hidden="true" />}
                {LOCAL_CODE_COPY.saveFile}
              </button>
            </div>
          )}
        </>
      )}
      {dialog}
    </div>
  );
}
