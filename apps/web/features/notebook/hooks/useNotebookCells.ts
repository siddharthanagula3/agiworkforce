'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  CloudCodeSession,
  NotebookCellLanguage,
  NotebookCellOutput,
} from '@agiworkforce/types';
import type { NotebookApi } from '../services/notebook-api';
import { toUserMessage } from '@/lib/user-error-message';

export type NotebookCellStatus = 'idle' | 'running' | 'ok' | 'error';

export type NotebookCellKind = 'code' | 'markdown';

export interface NotebookCell {
  id: string;
  kind: NotebookCellKind;
  code: string;
  language: NotebookCellLanguage;
  status: NotebookCellStatus;
  outputs: NotebookCellOutput[];
  error?: string;
}

/** What the last whole-notebook run covered, so the panel never implies more. */
export interface NotebookRunProvenance {
  runId: string;
  cellCount: number;
  fromTop: boolean;
  completed: boolean;
  finishedAt: string;
}

const DEFAULT_LANGUAGE: NotebookCellLanguage = 'python';

function makeCellId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cell_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeCell(kind: NotebookCellKind = 'code'): NotebookCell {
  return {
    id: makeCellId(),
    kind,
    code: '',
    language: DEFAULT_LANGUAGE,
    status: 'idle',
    outputs: [],
  };
}

export function isRunnableCell(cell: NotebookCell): boolean {
  return cell.kind === 'code' && cell.code.trim().length > 0;
}

export interface UseNotebookCellsOptions {
  api: NotebookApi;
  sessionId: string | null;
  onSession?: (session: CloudCodeSession) => void;
}

export interface UseNotebookCellsResult {
  cells: NotebookCell[];
  runningCellId: string | null;
  lastRun: NotebookRunProvenance | null;
  runAllError: string | null;
  addCell: (kind?: NotebookCellKind) => string;
  removeCell: (cellId: string) => void;
  setCellCode: (cellId: string, code: string) => void;
  setCellLanguage: (cellId: string, language: NotebookCellLanguage) => void;
  setCellKind: (cellId: string, kind: NotebookCellKind) => void;
  runCell: (cellId: string) => Promise<void>;
  runAll: () => Promise<void>;
}

export function useNotebookCells({
  api,
  sessionId,
  onSession,
}: UseNotebookCellsOptions): UseNotebookCellsResult {
  const [cells, setCells] = useState<NotebookCell[]>(() => [makeCell()]);
  const [runningCellId, setRunningCellId] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<NotebookRunProvenance | null>(null);
  const [runAllError, setRunAllError] = useState<string | null>(null);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;

  const addCell = useCallback((kind: NotebookCellKind = 'code') => {
    const cell = makeCell(kind);
    setCells((current) => [...current, cell]);
    return cell.id;
  }, []);

  const removeCell = useCallback((cellId: string) => {
    setCells((current) =>
      current.length > 1 ? current.filter((cell) => cell.id !== cellId) : current,
    );
  }, []);

  const setCellCode = useCallback((cellId: string, code: string) => {
    setCells((current) => current.map((cell) => (cell.id === cellId ? { ...cell, code } : cell)));
  }, []);

  const setCellLanguage = useCallback((cellId: string, language: NotebookCellLanguage) => {
    setCells((current) =>
      current.map((cell) => (cell.id === cellId ? { ...cell, language } : cell)),
    );
  }, []);

  // A markdown cell keeps its text but loses any result it had as code: the
  // output belonged to an execution the cell no longer claims to be.
  const setCellKind = useCallback((cellId: string, kind: NotebookCellKind) => {
    setCells((current) =>
      current.map((cell) =>
        cell.id === cellId
          ? { ...cell, kind, status: 'idle', outputs: [], error: undefined }
          : cell,
      ),
    );
  }, []);

  const runCell = useCallback(
    async (cellId: string) => {
      if (!sessionId) return;
      const target = cellsRef.current.find((cell) => cell.id === cellId);
      if (!target || !isRunnableCell(target) || runningCellId) return;

      setRunningCellId(cellId);
      setCells((current) =>
        current.map((cell) =>
          cell.id === cellId ? { ...cell, status: 'running', error: undefined } : cell,
        ),
      );
      try {
        const result = await api.execute(sessionId, {
          cellId,
          code: target.code,
          language: target.language,
        });
        onSession?.(result.session);
        setCells((current) =>
          current.map((cell) =>
            cell.id === cellId
              ? {
                  ...cell,
                  status: result.ok ? 'ok' : 'error',
                  outputs: result.outputs,
                  error: result.error,
                }
              : cell,
          ),
        );
      } catch (error) {
        setCells((current) =>
          current.map((cell) =>
            cell.id === cellId
              ? {
                  ...cell,
                  status: 'error',
                  error: toUserMessage(error, 'Cell execution failed'),
                }
              : cell,
          ),
        );
      } finally {
        setRunningCellId(null);
      }
    },
    [api, onSession, runningCellId, sessionId],
  );

  /**
   * One server-side run of every code cell in order, so the notebook's state
   * comes from a single recorded execution rather than from whatever sequence
   * of hand-run cells happened to precede it.
   */
  const runAll = useCallback(async () => {
    if (!sessionId || runningCellId) return;
    const runnable = cellsRef.current.filter(isRunnableCell);
    if (runnable.length === 0) return;

    setRunAllError(null);
    setCells((current) =>
      current.map((cell) =>
        isRunnableCell(cell) ? { ...cell, status: 'running', outputs: [], error: undefined } : cell,
      ),
    );
    try {
      const result = await api.runAll(sessionId, {
        cells: runnable.map((cell) => ({
          id: cell.id,
          code: cell.code,
          language: cell.language,
        })),
        fromTop: true,
      });
      onSession?.(result.session);
      const byCellId = new Map(result.results.map((entry) => [entry.cellId, entry]));
      setCells((current) =>
        current.map((cell) => {
          const outcome = byCellId.get(cell.id);
          if (!outcome) {
            return isRunnableCell(cell) ? { ...cell, status: 'idle', outputs: [] } : cell;
          }
          return {
            ...cell,
            status: outcome.ok ? 'ok' : 'error',
            outputs: outcome.outputs,
            error: outcome.error,
          };
        }),
      );
      setLastRun({
        runId: result.runId,
        cellCount: result.results.length,
        fromTop: result.fromTop,
        completed: result.completed,
        finishedAt: new Date().toISOString(),
      });
    } catch (error) {
      setCells((current) =>
        current.map((cell) => (cell.status === 'running' ? { ...cell, status: 'idle' } : cell)),
      );
      setRunAllError(toUserMessage(error, 'Could not run the notebook. Try again.'));
    }
  }, [api, onSession, runningCellId, sessionId]);

  return useMemo(
    () => ({
      cells,
      runningCellId,
      lastRun,
      runAllError,
      addCell,
      removeCell,
      setCellCode,
      setCellLanguage,
      setCellKind,
      runCell,
      runAll,
    }),
    [
      cells,
      runningCellId,
      lastRun,
      runAllError,
      addCell,
      removeCell,
      setCellCode,
      setCellLanguage,
      setCellKind,
      runCell,
      runAll,
    ],
  );
}
