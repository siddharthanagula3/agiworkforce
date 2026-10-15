'use client';

import { useCallback, useState } from 'react';
import { ChevronLeft, File, Folder, Paperclip, X } from '@agiworkforce/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Spinner,
} from '@agiworkforce/ui';
import type { FileEntry } from '@agiworkforce/local-runtime-contract';
import { listWorkspaceFiles } from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_CODE_COPY } from '../local-code';
import { menuCollisionPadding } from './LocalModelChip';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;
const ROOT_PATH = '';

function parentOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? ROOT_PATH : path.slice(0, index);
}

export interface LocalContextFilesProps {
  rootId: string;
  files: string[];
  disabled: boolean;
  full: boolean;
  onAdd: (path: string) => void;
  onRemove: (path: string) => void;
}

/**
 * Files from the session's own folder that the agent reads before it answers.
 * Only paths travel: the CLI reads each one inside the folder it was started
 * in, and refuses any path that resolves outside it.
 */
export function LocalContextFilePicker({
  rootId,
  files,
  disabled,
  full,
  onAdd,
}: Omit<LocalContextFilesProps, 'onRemove'>) {
  const [path, setPath] = useState(ROOT_PATH);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(
    async (next: string) => {
      setPath(next);
      setLoading(true);
      setError(null);
      try {
        setEntries(await listWorkspaceFiles(rootId, next));
      } catch (cause: unknown) {
        setEntries([]);
        setError(toUserMessage(cause, LOCAL_CODE_COPY.listFailed));
      } finally {
        setLoading(false);
      }
    },
    [rootId],
  );

  const visible = entries.filter((entry) => entry.kind !== 'symlink');

  return (
    <DropdownMenu
      onOpenChange={(isOpen) => {
        if (isOpen) void open(ROOT_PATH);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={styles['controlIconButton']}
          disabled={disabled || full}
          aria-label={LOCAL_CODE_COPY.addContextFile}
          title={LOCAL_CODE_COPY.addContextFile}
        >
          <Paperclip size={GLYPH_SIZE} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        collisionPadding={menuCollisionPadding()}
        className={`w-80 ${styles['menuScroll']}`}
      >
        <DropdownMenuLabel>
          {path === ROOT_PATH ? LOCAL_CODE_COPY.contextFilesHeading : path}
        </DropdownMenuLabel>
        {path !== ROOT_PATH && (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              void open(parentOf(path));
            }}
          >
            <ChevronLeft size={GLYPH_SIZE} aria-hidden="true" />
            {LOCAL_CODE_COPY.openFolderUp}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {loading && (
          <DropdownMenuItem disabled>
            <Spinner size="sm" aria-label={LOCAL_CODE_COPY.loading} />
          </DropdownMenuItem>
        )}
        {!loading && error !== null && <DropdownMenuItem disabled>{error}</DropdownMenuItem>}
        {!loading && error === null && visible.length === 0 && (
          <DropdownMenuItem disabled>{LOCAL_CODE_COPY.folderEmpty}</DropdownMenuItem>
        )}
        {!loading &&
          visible.map((entry) =>
            entry.kind === 'directory' ? (
              <DropdownMenuItem
                key={entry.path}
                onSelect={(event) => {
                  event.preventDefault();
                  void open(entry.path);
                }}
              >
                <Folder size={GLYPH_SIZE} aria-hidden="true" />
                {entry.name}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                key={entry.path}
                disabled={files.includes(entry.path)}
                onSelect={() => onAdd(entry.path)}
              >
                <File size={GLYPH_SIZE} aria-hidden="true" />
                {entry.name}
              </DropdownMenuItem>
            ),
          )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LocalContextFileChips({
  files,
  onRemove,
}: Pick<LocalContextFilesProps, 'files' | 'onRemove'>) {
  if (files.length === 0) return null;
  return (
    <div className={styles['chipRow']} aria-label={LOCAL_CODE_COPY.contextFilesHeading}>
      {files.map((file) => (
        <span key={file} className={`${styles['chip']} ${styles['chipStatic']}`}>
          <span>{file}</span>
          <button
            type="button"
            className={styles['controlIconButton']}
            aria-label={LOCAL_CODE_COPY.removeContextFile(file)}
            onClick={() => onRemove(file)}
          >
            <X size={GLYPH_SIZE} aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}
