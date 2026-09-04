'use client';

import { useCallback, useMemo, useState } from 'react';
import type {
  CloudCodeSession,
  NotebookCellLanguage,
  NotebookCellOutput,
} from '@agiworkforce/types';
import type { NotebookApi } from '../services/notebook-api';

export type NotebookCellStatus = 'idle' | 'running' | 'ok' | 'error';

export interface NotebookCell {
  id: string;
  code: string;
  language: NotebookCellLanguage;
  status: NotebookCellStatus;
  outputs: NotebookCellOutput[];
  error?: string;
}

const DEFAULT_LANGUAGE: NotebookCellLanguage = 'python';

function makeCellId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cell_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeCell(language: NotebookCellLanguage = DEFAULT_LANGUAGE): NotebookCell {
  return { id: makeCellId(), code: '', language, status: 'idle', outputs: [] };
}

export interface UseNotebookCellsOptions {
  api: NotebookApi;
  sessionId: string | null;
  onSession?: (session: CloudCodeSession) => void;
}

export interface UseNotebookCellsResult {
  cells: NotebookCell[];
  runningCellId: string | null;
  addCell: () => string;
  removeCell: (cellId: string) => void;
  setCellCode: (cellId: string, code: string) => void;
  setCellLanguage: (cellId: string, language: NotebookCellLanguage) => void;
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

  const addCell = useCallback(() => {
    const cell = makeCell();
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

  const runCell = useCallback(
    async (cellId: string) => {
      if (!sessionId) return;
      const target = cells.find((cell) => cell.id === cellId);
      if (!target || !target.code.trim() || runningCellId) return;

      setRunningCellId(cellId);
      setCells((current) =>
        current.map((cell) =>
          cell.id === cellId ? { ...cell, status: 'running', error: undefined } : cell,
        ),
      );
      try {
        const result = await api.execute(sessionId, {
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
                  error: error instanceof Error ? error.message : 'Cell execution failed',
                }
              : cell,
          ),
        );
      } finally {
        setRunningCellId(null);
      }
    },
    [api, cells, onSession, runningCellId, sessionId],
  );

  const runAll = useCallback(async () => {
    for (const cell of cells) {
      await runCell(cell.id);
    }
  }, [cells, runCell]);

  return useMemo(
    () => ({
      cells,
      runningCellId,
      addCell,
      removeCell,
      setCellCode,
      setCellLanguage,
      runCell,
      runAll,
    }),
    [cells, runningCellId, addCell, removeCell, setCellCode, setCellLanguage, runCell, runAll],
  );
}
