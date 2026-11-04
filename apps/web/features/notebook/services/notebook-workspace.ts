import type { CloudCodeSession, NotebookCellLanguage, NotebookCellOutput } from '@agiworkforce/types';
import { toUserMessage } from '@/lib/user-error-message';
import type { NotebookApi, NotebookFile } from './notebook-api';

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
export interface NotebookRunProvenance {
  runId: string;
  cellCount: number;
  fromTop: boolean;
  completed: boolean;
  finishedAt: string;
}
export interface NotebookDraft {
  cells: NotebookCell[];
  operation: 'cell' | 'all' | 'upload' | 'list' | null;
  runningCellId: string | null;
  lastRun: NotebookRunProvenance | null;
  runAllError: string | null;
  files: NotebookFile[];
  filesError: string | null;
}
export interface NotebookRequest {
  api: NotebookApi;
  isCurrent: () => boolean;
  retire: () => void;
}
interface Bucket {
  state: NotebookDraft;
  pending: symbol | null;
  filesGeneration: number;
  listeners: Set<() => void>;
}
export function isRunnableCell(cell: NotebookCell): boolean {
  return cell.kind === 'code' && cell.code.trim().length > 0;
}
function makeCell(kind: NotebookCellKind = 'code'): NotebookCell {
  return { id: crypto.randomUUID(), kind, code: '', language: 'python', status: 'idle', outputs: [] };
}
const UNKNOWN_EXECUTION = 'The execution result could not be confirmed. Code may have run. Check the sandbox state before running it again.';

export function createNotebookWorkspace(
  captureRequest: () => NotebookRequest,
  isCurrent: () => boolean,
) {
  const buckets = new Map<string, Bucket>();
  function bucketFor(sessionId: string): Bucket {
    let bucket = buckets.get(sessionId);
    if (!bucket) {
      bucket = {
        state: {
          cells: [makeCell()], operation: null, runningCellId: null,
          lastRun: null, runAllError: null, files: [], filesError: null,
        },
        pending: null, filesGeneration: 0, listeners: new Set(),
      };
      buckets.set(sessionId, bucket);
    }
    return bucket;
  }
  function publish(bucket: Bucket, patch: Partial<NotebookDraft>) {
    bucket.state = { ...bucket.state, ...patch };
    bucket.listeners.forEach((listener) => listener());
  }
  function edit(sessionId: string, update: (cells: NotebookCell[]) => NotebookCell[]) {
    const bucket = bucketFor(sessionId);
    if (!isCurrent() || bucket.state.operation === 'cell' || bucket.state.operation === 'all') return false;
    publish(bucket, { cells: update(bucket.state.cells), lastRun: null, runAllError: null });
    return true;
  }
  function begin(sessionId: string, operation: NonNullable<NotebookDraft['operation']>) {
    const bucket = bucketFor(sessionId);
    if (!isCurrent() || bucket.pending) return null;
    let request: NotebookRequest;
    try {
      request = captureRequest();
    } catch {
      return null;
    }
    if (!request.isCurrent()) {
      request.retire();
      return null;
    }
    const token = Symbol(operation);
    bucket.pending = token;
    const current = () => isCurrent() && request.isCurrent() && bucket.pending === token;
    publish(bucket, { operation });
    return {
      bucket, request, current,
      finish: () => {
        const accepted = current();
        if (bucket.pending === token) {
          bucket.pending = null;
          publish(bucket, {
            operation: null, runningCellId: null,
            ...(!accepted && operation === 'list' ? {
              filesError: 'The file list could not be confirmed. Refresh files to check again.',
            } : {}),
            ...(!accepted && (operation === 'cell' || operation === 'all') ? {
              cells: bucket.state.cells.map((cell): NotebookCell => cell.status === 'running'
                ? { ...cell, status: 'error', outputs: [], error: UNKNOWN_EXECUTION } : cell),
              runAllError: operation === 'all' ? UNKNOWN_EXECUTION : bucket.state.runAllError,
            } : {}),
          });
        }
        request.retire();
      },
    };
  }
  function verifySession(sessionId: string, session: CloudCodeSession) {
    if (session.id !== sessionId) throw new Error('Notebook response belongs to a different session');
  }
  async function refreshFiles(sessionId: string): Promise<CloudCodeSession | null> {
    const owner = begin(sessionId, 'list');
    if (!owner) return null;
    const { bucket, request, current } = owner;
    const generation = ++bucket.filesGeneration;
    try {
      const result = await request.api.listFiles(sessionId);
      if (!current() || generation !== bucket.filesGeneration) return null;
      verifySession(sessionId, result.session);
      publish(bucket, { files: result.files, filesError: null });
      return result.session;
    } catch (error) {
      if (current() && generation === bucket.filesGeneration) {
        publish(bucket, { filesError: toUserMessage(error, 'Could not load sandbox files.') });
      }
      return null;
    } finally {
      owner.finish();
    }
  }
  return {
    isCurrent,
    getSnapshot: (sessionId: string) => bucketFor(sessionId).state,
    subscribe(sessionId: string, listener: () => void) {
      const listeners = bucketFor(sessionId).listeners;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    addCell(sessionId: string, kind: NotebookCellKind = 'code') {
      const cell = makeCell(kind);
      return edit(sessionId, (cells) => [...cells, cell]) ? cell.id : null;
    },
    removeCell(sessionId: string, cellId: string) {
      edit(sessionId, (cells) => cells.length > 1 ? cells.filter((cell) => cell.id !== cellId) : cells);
    },
    setCellCode(sessionId: string, cellId: string, code: string) {
      edit(sessionId, (cells) => cells.map((cell) => cell.id === cellId
        ? { ...cell, code, status: 'idle', outputs: [], error: undefined } : cell));
    },
    setCellLanguage(sessionId: string, cellId: string, language: NotebookCellLanguage) {
      edit(sessionId, (cells) => cells.map((cell) => cell.id === cellId
        ? { ...cell, language, status: 'idle', outputs: [], error: undefined } : cell));
    },
    setCellKind(sessionId: string, cellId: string, kind: NotebookCellKind) {
      edit(sessionId, (cells) => cells.map((cell) => cell.id === cellId
        ? { ...cell, kind, status: 'idle', outputs: [], error: undefined } : cell));
    },
    async runCell(sessionId: string, cellId: string): Promise<CloudCodeSession | null> {
      const target = bucketFor(sessionId).state.cells.find((cell) => cell.id === cellId);
      if (!target || !isRunnableCell(target)) return null;
      const owner = begin(sessionId, 'cell');
      if (!owner) return null;
      const { bucket, request, current } = owner;
      publish(bucket, {
        runningCellId: cellId, lastRun: null, runAllError: null,
        cells: bucket.state.cells.map((cell) => cell.id === cellId
          ? { ...cell, status: 'running', outputs: [], error: undefined } : cell),
      });
      try {
        const result = await request.api.execute(sessionId, {
          cellId, code: target.code, language: target.language,
        });
        if (!current()) return null;
        verifySession(sessionId, result.session);
        publish(bucket, {
          cells: bucket.state.cells.map((cell) => cell.id === cellId
            ? { ...cell, status: result.ok ? 'ok' : 'error', outputs: result.outputs, error: result.error }
            : cell),
        });
        return result.session;
      } catch {
        if (current()) publish(bucket, {
          cells: bucket.state.cells.map((cell) => cell.id === cellId
            ? { ...cell, status: 'error', outputs: [], error: UNKNOWN_EXECUTION } : cell),
        });
        return null;
      } finally {
        owner.finish();
      }
    },
    async runAll(sessionId: string): Promise<CloudCodeSession | null> {
      const runnable = bucketFor(sessionId).state.cells.filter(isRunnableCell);
      if (!runnable.length) return null;
      const owner = begin(sessionId, 'all');
      if (!owner) return null;
      const { bucket, request, current } = owner;
      publish(bucket, {
        lastRun: null, runAllError: null,
        cells: bucket.state.cells.map((cell) => isRunnableCell(cell)
          ? { ...cell, status: 'running', outputs: [], error: undefined } : cell),
      });
      try {
        const result = await request.api.runAll(sessionId, {
          cells: runnable.map((cell) => ({ id: cell.id, code: cell.code, language: cell.language })),
          fromTop: true,
        });
        if (!current()) return null;
        verifySession(sessionId, result.session);
        const byId = new Map(result.results.map((entry) => [entry.cellId, entry]));
        if (byId.size !== result.results.length || !result.fromTop ||
            result.completed !== (result.results.length === runnable.length && result.results.every((entry) => entry.ok)) ||
            result.results.some((entry, index) => entry.cellId !== runnable[index]?.id)) {
          throw new Error('Notebook result does not match submitted cells');
        }
        publish(bucket, {
          cells: bucket.state.cells.map((cell) => {
            const outcome = byId.get(cell.id);
            if (!outcome) return cell.status === 'running' ? { ...cell, status: 'idle' } : cell;
            return { ...cell, status: outcome.ok ? 'ok' : 'error', outputs: outcome.outputs, error: outcome.error };
          }),
          lastRun: {
            runId: result.runId, cellCount: result.results.length, fromTop: result.fromTop,
            completed: result.completed, finishedAt: new Date().toISOString(),
          },
        });
        return result.session;
      } catch {
        if (current()) publish(bucket, {
          cells: bucket.state.cells.map((cell) => cell.status === 'running'
            ? { ...cell, status: 'error', outputs: [], error: UNKNOWN_EXECUTION } : cell),
          runAllError: UNKNOWN_EXECUTION,
        });
        return null;
      } finally {
        owner.finish();
      }
    },
    refreshFiles,
    async uploadFile(sessionId: string, file: File): Promise<CloudCodeSession | null> {
      const owner = begin(sessionId, 'upload');
      if (!owner) return null;
      const { bucket, request, current } = owner;
      ++bucket.filesGeneration;
      let uploaded: CloudCodeSession | null = null;
      try {
        const result = await request.api.uploadFile(sessionId, file, file.name);
        if (!current()) return null;
        verifySession(sessionId, result.session);
        uploaded = result.session;
        publish(bucket, { filesError: null });
      } catch {
        if (current()) publish(bucket, {
          filesError: 'The upload result could not be confirmed. The file may have been written. Check the sandbox before uploading again.',
        });
      } finally {
        owner.finish();
      }
      if (uploaded && isCurrent()) await refreshFiles(sessionId);
      return isCurrent() ? uploaded : null;
    },
  };
}
export type NotebookWorkspace = ReturnType<typeof createNotebookWorkspace>;
