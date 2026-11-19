'use client';

import { Spinner, translateUiPlural } from '@agiworkforce/ui';
import { ChangeEvent, useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { Download, Play, Plus, Upload } from 'lucide-react';
import type { CloudCodeSession, NotebookCellLanguage } from '@agiworkforce/types';
import { notebookApi } from './services/notebook-api';
import type { NotebookWorkspace } from './services/notebook-workspace';
import { isRunnableCell, useNotebookCells } from './hooks/useNotebookCells';
import { NotebookCellView } from './NotebookCellView';
import styles from './NotebookPanel.module.css';

export interface NotebookPanelProps {
  sessionId: string;
  sessionReady: boolean;
  onSession: (session: CloudCodeSession) => void;
  workspace: NotebookWorkspace;
  selectionRevision?: number;
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
  workspace,
  selectionRevision = 0,
}: NotebookPanelProps) {
  const { cells, lastRun, runAllError, files, filesError, operation } = useNotebookCells(
    workspace,
    sessionId,
  );
  const uploading = operation === 'upload';
  const runningAll = operation === 'all';
  const textareaRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const view = useRef({
    sessionId,
    selectionRevision,
    token: Symbol(),
    mounted: false,
    sessionReady,
  });
  if (
    view.current.sessionId !== sessionId ||
    view.current.selectionRevision !== selectionRevision
  ) {
    view.current = {
      sessionId,
      selectionRevision,
      token: Symbol(),
      mounted: view.current.mounted,
      sessionReady,
    };
  }
  view.current.sessionReady = sessionReady;
  const renderedToken = view.current.token;
  useLayoutEffect(() => {
    view.current.mounted = true;
    return () => {
      view.current.mounted = false;
    };
  }, []);
  const fileInputId = useId();
  const isSelected = useCallback(
    () => workspace.isCurrent() && view.current.mounted && view.current.token === renderedToken,
    [workspace, renderedToken],
  );
  const canStart = useCallback(
    () =>
      isSelected() &&
      view.current.sessionReady &&
      workspace.getSnapshot(sessionId).operation === null,
    [isSelected, workspace, sessionId],
  );
  const canEdit = useCallback(() => {
    const operation = workspace.getSnapshot(sessionId).operation;
    return isSelected() && view.current.sessionReady && operation !== 'cell' && operation !== 'all';
  }, [isSelected, workspace, sessionId]);
  const publishSession = useCallback(
    (session: CloudCodeSession | null) => {
      if (session && session.id === sessionId && isSelected()) onSession(session);
    },
    [sessionId, isSelected, onSession],
  );

  useEffect(() => {
    if (sessionReady && isSelected()) void workspace.refreshFiles(sessionId);
  }, [workspace, sessionId, sessionReady, isSelected]);

  const registerTextarea = useCallback((cellId: string, element: HTMLTextAreaElement | null) => {
    if (element) textareaRefs.current.set(cellId, element);
    else textareaRefs.current.delete(cellId);
  }, []);

  const handleRunAndAdvance = useCallback(
    (cellId: string) => {
      if (!canStart()) return;
      const index = cells.findIndex((cell) => cell.id === cellId);
      if (index < 0 || !isRunnableCell(cells[index]!)) return;
      const targetId =
        index === cells.length - 1 ? workspace.addCell(sessionId) : cells[index + 1]?.id;
      void workspace.runCell(sessionId, cellId).then((session) => {
        publishSession(session);
        if (session && targetId && isSelected())
          requestAnimationFrame(() => {
            if (canStart()) textareaRefs.current.get(targetId)?.focus();
          });
      });
    },
    [canStart, cells, workspace, sessionId, publishSession, isSelected],
  );

  const handleRunAll = useCallback(async () => {
    if (canStart()) publishSession(await workspace.runAll(sessionId));
  }, [canStart, publishSession, workspace, sessionId]);

  const handleUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file || !canStart()) return;
      publishSession(await workspace.uploadFile(sessionId, file));
    },
    [canStart, publishSession, workspace, sessionId],
  );
  const disabled = !sessionReady || operation !== null;
  const editDisabled = !sessionReady || operation === 'cell' || operation === 'all';

  return (
    <section aria-label="Notebook" className={styles['panel']}>
      <div className={styles['toolbar']}>
        <button
          type="button"
          className={styles['toolbarButton']}
          disabled={editDisabled}
          onClick={() => {
            if (canEdit()) workspace.addCell(sessionId);
          }}
        >
          <Plus size={13} /> Add cell
        </button>
        <button
          type="button"
          className={styles['toolbarButton']}
          disabled={editDisabled}
          onClick={() => {
            if (canEdit()) workspace.addCell(sessionId, 'markdown');
          }}
        >
          <Plus size={13} /> Add markdown
        </button>
        <button
          type="button"
          className={styles['toolbarButton']}
          disabled={disabled || !cells.some(isRunnableCell)}
          onClick={() => void handleRunAll()}
        >
          {runningAll ? <Spinner className="h-[13px] w-[13px]" /> : <Play size={13} />}
          Run all
        </button>
        <label className={styles['toolbarButton']} htmlFor={fileInputId}>
          {uploading ? <Spinner className="h-[13px] w-[13px]" /> : <Upload size={13} />}
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

      <p className={styles['runProvenance']} aria-live="polite">
        {runAllError
          ? runAllError
          : lastRun
            ? `${translateUiPlural('chat', 'counts.ranCells', lastRun.cellCount, {
                one: 'Ran {{count}} cell',
                other: 'Ran {{count}} cells',
              })} ${
                lastRun.fromTop ? 'from the top' : 'in place'
              } at ${new Date(lastRun.finishedAt).toLocaleTimeString()}${
                lastRun.completed ? '' : ', stopped at the first error'
              }.`
            : 'Cells build on what ran before them. Run all runs every cell from the top.'}
      </p>

      <div className={styles['cells']}>
        {cells.map((cell, index) => (
          <NotebookCellView
            key={cell.id}
            cell={cell}
            index={index}
            canRemove={cells.length > 1}
            disabled={editDisabled}
            runDisabled={disabled}
            registerTextarea={registerTextarea}
            onChangeCode={(cellId, code) => {
              if (canEdit()) workspace.setCellCode(sessionId, cellId, code);
            }}
            onChangeLanguage={(cellId, language: NotebookCellLanguage) => {
              if (canEdit()) workspace.setCellLanguage(sessionId, cellId, language);
            }}
            onChangeKind={(cellId, kind) => {
              if (canEdit()) workspace.setCellKind(sessionId, cellId, kind);
            }}
            onRun={(cellId) => {
              if (canStart()) void workspace.runCell(sessionId, cellId).then(publishSession);
            }}
            onRunAndAdvance={handleRunAndAdvance}
            onRemove={(cellId) => {
              if (canEdit()) workspace.removeCell(sessionId, cellId);
            }}
          />
        ))}
      </div>

      <div className={styles['files']}>
        <div className={styles['filesHeading']}>Sandbox files</div>
        <button
          type="button"
          className={styles['toolbarButton']}
          disabled={disabled}
          onClick={() => {
            if (canStart()) void workspace.refreshFiles(sessionId);
          }}
        >
          Refresh files
        </button>
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
                  href={notebookApi.downloadUrl(sessionId, file.path)}
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
