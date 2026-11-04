'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { NotebookWorkspace } from '../services/notebook-workspace';
export { isRunnableCell } from '../services/notebook-workspace';
export type { NotebookCell, NotebookCellKind, NotebookCellStatus, NotebookRunProvenance } from '../services/notebook-workspace';

export function useNotebookCells(workspace: NotebookWorkspace, sessionId: string) {
  const subscribe = useCallback((listener: () => void) => workspace.subscribe(sessionId, listener), [workspace, sessionId]);
  const getSnapshot = useCallback(() => workspace.getSnapshot(sessionId), [workspace, sessionId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
