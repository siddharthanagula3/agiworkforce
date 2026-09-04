'use client';

import { ChangeEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Download, Loader2, Play, Plus, Upload } from 'lucide-react';
import type { CloudCodeSession, NotebookCellLanguage } from '@agiworkforce/types';
import { toUserMessage } from '@/lib/user-error-message';
import { notebookApi, type NotebookApi, type NotebookFile } from './services/notebook-api';
import { useNotebookCells } from './hooks/useNotebookCells';
import { NotebookCellView } from './NotebookCellView';
import styles from './NotebookPanel.module.css';

export interface NotebookPanelProps {
  sessionId: string;
  sessionReady: boolean;
  onSession: (session: CloudCodeSession) => void;
  api?: NotebookApi;
}

function formatBytes(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${Math.round(byteSize / 102.4) / 10} KB`;
  return `${Math.round(byteSize / (1024 * 102.4)) / 10} MB`;
}

export function NotebookPanel({
  sessionId,
  sessionReady,
  onSession,
  api = notebookApi,
}: NotebookPanelProps) {
  const {
    cells,
    runningCellId,
    addCell,
    removeCell,
    setCellCode,
    setCellLanguage,
    runCell,
    runAll,
  } = useNotebookCells({ api, sessionId, onSession });
  const [files, setFiles] = useState<NotebookFile[]>([]);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const textareaRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const fileInputId = useId();

  const refreshFiles = useCallback(async () => {
    try {
      const result = await api.listFiles(sessionId);
      setFiles(result.files);
      setFilesError(null);
    } catch (error) {
      setFilesError(toUserMessage(error, 'Could not load sandbox files.'));
    }
  }, [api, sessionId]);

  useEffect(() => {
    if (sessionReady) void refreshFiles();
  }, [refreshFiles, sessionReady]);

  const registerTextarea = useCallback((cellId: string, element: HTMLTextAreaElement | null) => {
    if (element) textareaRefs.current.set(cellId, element);
    else textareaRefs.current.delete(cellId);
  }, []);

  const handleRunAndAdvance = useCallback(
    (cellId: string) => {
      const index = cells.findIndex((cell) => cell.id === cellId);
      const targetId = index === cells.length - 1 ? addCell() : cells[index + 1]?.id;
      // The target cell stays disabled until this run settles, so focusing it
      // has to wait for that instead of racing the still-running textarea.
      void runCell(cellId).then(() => {
        if (targetId) requestAnimationFrame(() => textareaRefs.current.get(targetId)?.focus());
      });
    },
    [addCell, cells, runCell],
  );

  const handleRunAll = useCallback(async () => {
    setRunningAll(true);
    try {
      await runAll();
    } finally {
      setRunningAll(false);
    }
  }, [runAll]);

  const handleUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      setUploading(true);
      try {
        const result = await api.uploadFile(sessionId, file, file.name);
        onSession(result.session);
        await refreshFiles();
      } catch (error) {
        setFilesError(toUserMessage(error, 'File upload failed.'));
      } finally {
        setUploading(false);
      }
    },
    [api, onSession, refreshFiles, sessionId],
  );

  const disabled = !sessionReady || runningCellId !== null || runningAll;

  return (
    <section aria-label="Notebook" className={styles['panel']}>
      <div className={styles['toolbar']}>
        <button
          type="button"
          className={styles['toolbarButton']}
          disabled={disabled}
          onClick={() => addCell()}
        >
          <Plus size={13} /> Add cell
        </button>
        <button
          type="button"
          className={styles['toolbarButton']}
          disabled={disabled || cells.every((cell) => !cell.code.trim())}
          onClick={() => void handleRunAll()}
        >
          {runningAll ? <Loader2 className={styles['spin']} size={13} /> : <Play size={13} />}
          Run all
        </button>
        <label className={styles['toolbarButton']} htmlFor={fileInputId}>
          {uploading ? <Loader2 className={styles['spin']} size={13} /> : <Upload size={13} />}
          Upload file
        </label>
        <input
          id={fileInputId}
          type="file"
          className={styles['srOnly']}
          disabled={disabled || uploading}
          onChange={(event) => void handleUpload(event)}
        />
      </div>

      <div className={styles['cells']}>
        {cells.map((cell, index) => (
          <NotebookCellView
            key={cell.id}
            cell={cell}
            index={index}
            canRemove={cells.length > 1}
            disabled={disabled}
            registerTextarea={registerTextarea}
            onChangeCode={setCellCode}
            onChangeLanguage={(cellId, language: NotebookCellLanguage) =>
              setCellLanguage(cellId, language)
            }
            onRun={(cellId) => void runCell(cellId)}
            onRunAndAdvance={handleRunAndAdvance}
            onRemove={removeCell}
          />
        ))}
      </div>

      <div className={styles['files']}>
        <div className={styles['filesHeading']}>Sandbox files</div>
        {filesError && <div className={styles['filesError']}>{filesError}</div>}
        {files.length === 0 ? (
          <div className={styles['filesEmpty']}>No files yet.</div>
        ) : (
          <ul className={styles['fileList']}>
            {files.map((file) => (
              <li key={file.path} className={styles['fileRow']}>
                <span className={styles['fileName']}>{file.path}</span>
                <span className={styles['fileSize']}>{formatBytes(file.byteSize)}</span>
                <a
                  className={styles['fileDownload']}
                  href={api.downloadUrl(sessionId, file.path)}
                  download={file.name}
                  aria-label={`Download ${file.name}`}
                >
                  <Download size={13} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
