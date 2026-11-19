import { describe, expect, it, vi } from 'vitest';
import type { CloudCodeSession } from '@agiworkforce/types';
import type {
  NotebookApi,
  NotebookCellExecuteResult,
  NotebookListFilesResult,
  NotebookUploadResult,
} from '../services/notebook-api';
import { NotebookApiError } from '../services/notebook-api';
import { createNotebookWorkspace } from '../services/notebook-workspace';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
function session(id: string): CloudCodeSession {
  return {
    id,
    title: id,
    repositoryUrl: null,
    repositoryBranch: null,
    networkAccess: 'none',
    runtimeId: null,
    extraHosts: [],
    state: 'ready',
    workspacePath: '/home/user',
    workingBranch: null,
    baseBranch: null,
    pullRequestUrl: null,
    pullRequestNumber: null,
    archivedAt: null,
    contextInputTokens: 0,
    contextOutputTokens: 0,
    lastError: null,
    createdAt: '',
    updatedAt: '',
    closedAt: null,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function setup(overrides: Partial<NotebookApi> = {}) {
  let current = true;
  const api: NotebookApi = {
    execute: vi.fn<NotebookApi['execute']>(async (id) => ({
      session: session(id),
      ok: true,
      outputs: [],
    })),
    runAll: vi.fn<NotebookApi['runAll']>(async (id, input) => ({
      session: session(id),
      runId: 'run',
      fromTop: true,
      networkAccess: 'none',
      completed: true,
      results: input.cells.map((cell) => ({ cellId: cell.id, ok: true, outputs: [] })),
    })),
    listFiles: vi.fn(async (id) => ({ session: session(id), files: [] })),
    uploadFile: vi.fn(async (id, file) => ({
      session: session(id),
      file: { path: file.name, name: file.name, isDir: false, byteSize: file.size },
    })),
    downloadUrl: (id, path) => `/api/code/sessions/${id}/notebook/files/${path}`,
    ...overrides,
  };
  const retire = vi.fn();
  const workspace = createNotebookWorkspace(
    () => ({ api, isCurrent: () => current, retire }),
    () => current,
  );
  const cell = workspace.getSnapshot(A).cells[0]!;
  workspace.setCellCode(A, cell.id, 'print("a")');
  return {
    workspace,
    api,
    cellId: cell.id,
    retire,
    expire: () => {
      current = false;
    },
  };
}

describe('notebook workspace ownership', () => {
  it('retains independent drafts and settles background results only into their original notebook', async () => {
    const execution = deferred<NotebookCellExecuteResult>();
    const { workspace, cellId, api } = setup({ execute: vi.fn(() => execution.promise) });
    const pending = workspace.runCell(A, cellId);
    const b = workspace.getSnapshot(B).cells[0]!;
    expect(b.code).toBe('');
    workspace.setCellCode(B, b.id, 'print("b")');
    workspace.setCellCode(A, cellId, 'unexpected edit');
    execution.resolve({ session: session(A), ok: true, outputs: [{ kind: 'stream', data: 'a' }] });
    await pending;
    expect(workspace.getSnapshot(A).cells[0]).toMatchObject({
      code: 'print("a")',
      status: 'ok',
      outputs: [{ kind: 'stream', data: 'a' }],
    });
    expect(workspace.getSnapshot(B).cells[0]).toMatchObject({ code: 'print("b")', outputs: [] });
    expect(api.execute).toHaveBeenCalledWith(A, { cellId, code: 'print("a")', language: 'python' });
  });

  it('synchronously gates sandbox requests but preserves editing while listing files', async () => {
    const listing = deferred<NotebookListFilesResult>();
    const { workspace, api, cellId } = setup({ listFiles: vi.fn(() => listing.promise) });
    const pending = workspace.refreshFiles(A);
    await workspace.runCell(A, cellId);
    await workspace.runAll(A);
    await workspace.uploadFile(A, new File(['a'], 'a.txt'));
    await workspace.refreshFiles(A);
    workspace.setCellCode(A, cellId, 'edited during file listing');
    expect(workspace.getSnapshot(A).cells[0]?.code).toBe('edited during file listing');
    expect(workspace.addCell(A)).not.toBeNull();
    expect(api.execute).not.toHaveBeenCalled();
    expect(api.runAll).not.toHaveBeenCalled();
    expect(api.uploadFile).not.toHaveBeenCalled();
    expect(api.listFiles).toHaveBeenCalledTimes(1);
    listing.resolve({ session: session(A), files: [] });
    await pending;
    expect(workspace.getSnapshot(A).operation).toBeNull();
  });

  it('shares a run lock between run-all and individual cells across subscriber unmounts', async () => {
    const run = deferred<Awaited<ReturnType<NotebookApi['runAll']>>>();
    const { workspace, api, cellId } = setup({ runAll: vi.fn(() => run.promise) });
    const unsubscribe = workspace.subscribe(A, vi.fn());
    const pending = workspace.runAll(A);
    unsubscribe();
    await workspace.runCell(A, cellId);
    await workspace.runAll(A);
    await workspace.refreshFiles(A);
    expect(api.execute).not.toHaveBeenCalled();
    expect(api.listFiles).not.toHaveBeenCalled();
    expect(api.runAll).toHaveBeenCalledTimes(1);
    run.resolve({
      session: session(A),
      runId: 'run',
      fromTop: true,
      networkAccess: 'none',
      completed: true,
      results: [{ cellId, ok: true, outputs: [] }],
    });
    await pending;
    expect(workspace.getSnapshot(A).operation).toBeNull();
  });

  it('refreshes only the original notebook after a confirmed upload', async () => {
    const upload = deferred<NotebookUploadResult>();
    const { workspace, api } = setup({
      uploadFile: vi.fn(() => upload.promise),
      listFiles: vi.fn(async (id) => ({
        session: session(id),
        files: [{ path: `${id}.txt`, name: `${id}.txt`, isDir: false, byteSize: 1 }],
      })),
    });
    const pending = workspace.uploadFile(A, new File(['a'], 'a.txt'));
    await workspace.refreshFiles(A);
    await workspace.refreshFiles(B);
    expect(api.listFiles).toHaveBeenCalledTimes(1);
    upload.resolve({
      session: session(A),
      file: { path: 'a.txt', name: 'a.txt', isDir: false, byteSize: 1 },
    });
    await pending;
    expect(api.listFiles).toHaveBeenCalledTimes(2);
    expect(workspace.getSnapshot(A).files[0]?.path).toBe(`${A}.txt`);
    expect(workspace.getSnapshot(B).files[0]?.path).toBe(`${B}.txt`);
  });

  it('does not refresh or retry an uncertain upload', async () => {
    const { workspace, api } = setup({
      uploadFile: vi.fn(async () => {
        throw new Error('connection lost');
      }),
    });
    await workspace.uploadFile(A, new File(['a'], 'a.txt'));
    expect(api.uploadFile).toHaveBeenCalledTimes(1);
    expect(api.listFiles).not.toHaveBeenCalled();
    expect(workspace.getSnapshot(A).filesError).toContain('may have been written');
  });

  it('clears prior output on replacement and shows uncertain execution without retry', async () => {
    const { workspace, api, cellId } = setup();
    vi.mocked(api.execute).mockResolvedValueOnce({
      session: session(A),
      ok: true,
      outputs: [{ kind: 'stream', data: 'old' }],
    });
    await workspace.runCell(A, cellId);
    vi.mocked(api.execute).mockRejectedValueOnce(new Error('connection lost'));
    await workspace.runCell(A, cellId);
    expect(workspace.getSnapshot(A).cells[0]).toMatchObject({
      code: 'print("a")',
      outputs: [],
      status: 'error',
    });
    expect(workspace.getSnapshot(A).cells[0]?.error).toContain('Code may have run');
    expect(api.execute).toHaveBeenCalledTimes(2);
  });

  it('shows the server validation message and keeps prior output when a run is rejected before any cell ran', async () => {
    const rejection = new NotebookApiError(
      'Cell 2: Cell code must be 1–50000 characters and contain no null bytes',
      400,
    );
    const { workspace, api, cellId } = setup();
    vi.mocked(api.runAll).mockResolvedValueOnce({
      session: session(A),
      runId: 'run',
      fromTop: true,
      networkAccess: 'none',
      completed: true,
      results: [{ cellId, ok: true, outputs: [{ kind: 'stream', data: 'kept' }] }],
    });
    await workspace.runAll(A);
    vi.mocked(api.runAll).mockRejectedValueOnce(rejection);
    await workspace.runAll(A);
    const snapshot = workspace.getSnapshot(A);
    expect(snapshot.runAllError).toContain('Cell 2');
    expect(snapshot.runAllError).not.toContain('Code may have run');
    expect(snapshot.cells[0]).toMatchObject({
      status: 'ok',
      outputs: [{ kind: 'stream', data: 'kept' }],
    });

    vi.mocked(api.execute).mockRejectedValueOnce(rejection);
    await workspace.runCell(A, cellId);
    expect(workspace.getSnapshot(A).cells[0]?.error).toContain('Cell 2');
  });

  it('invalidates whole-run provenance and output when input changes', async () => {
    const { workspace, cellId } = setup();
    await workspace.runAll(A);
    expect(workspace.getSnapshot(A).lastRun?.completed).toBe(true);
    workspace.setCellLanguage(A, cellId, 'javascript');
    expect(workspace.getSnapshot(A).lastRun).toBeNull();
    expect(workspace.getSnapshot(A).cells[0]).toMatchObject({
      status: 'idle',
      outputs: [],
      language: 'javascript',
    });
  });

  it('rejects response sessions or cell identities that do not match the request', async () => {
    const { workspace, cellId } = setup({
      execute: vi.fn<NotebookApi['execute']>(async () => ({
        session: session(B),
        ok: true,
        outputs: [{ kind: 'stream', data: 'wrong' }],
      })),
      runAll: vi.fn<NotebookApi['runAll']>(async () => ({
        session: session(A),
        runId: 'run',
        fromTop: true,
        networkAccess: 'none',
        completed: true,
        results: [{ cellId: 'different', ok: true, outputs: [] }],
      })),
    });
    expect(await workspace.runCell(A, cellId)).toBeNull();
    expect(workspace.getSnapshot(A).cells[0]?.outputs).toEqual([]);
    expect(await workspace.runAll(A)).toBeNull();
    expect(workspace.getSnapshot(A).lastRun).toBeNull();
  });

  it('suppresses identity-expired execution results', async () => {
    const execution = deferred<NotebookCellExecuteResult>();
    const { workspace, expire, cellId, retire } = setup({
      execute: vi.fn(() => execution.promise),
    });
    const pending = workspace.runCell(A, cellId);
    expire();
    execution.resolve({
      session: session(A),
      ok: true,
      outputs: [{ kind: 'stream', data: 'private' }],
    });
    expect(await pending).toBeNull();
    expect(workspace.getSnapshot(A).cells[0]?.outputs).toEqual([]);
    expect(retire).toHaveBeenCalledTimes(1);
  });

  it('releases only the retired operation lock when the workspace lifetime resumes', async () => {
    const execution = deferred<NotebookCellExecuteResult>();
    const { api } = setup({ execute: vi.fn(() => execution.promise) });
    let generation = 1;
    const workspace = createNotebookWorkspace(
      () => {
        const captured = generation;
        return { api, isCurrent: () => captured === generation, retire: () => undefined };
      },
      () => true,
    );
    const cellId = workspace.getSnapshot(A).cells[0]!.id;
    workspace.setCellCode(A, cellId, 'work()');
    const pending = workspace.runCell(A, cellId);
    generation += 1;
    execution.resolve({
      session: session(A),
      ok: true,
      outputs: [{ kind: 'stream', data: 'stale' }],
    });
    expect(await pending).toBeNull();
    expect(workspace.getSnapshot(A).operation).toBeNull();
    expect(workspace.getSnapshot(A).cells[0]).toMatchObject({
      status: 'error',
      outputs: [],
      code: 'work()',
    });
    expect(workspace.getSnapshot(A).cells[0]?.error).toContain('Code may have run');
    workspace.setCellCode(A, cellId, 'updated()');
    expect(workspace.getSnapshot(A).cells[0]?.code).toBe('updated()');
  });

  it('does not let an interrupted list finalizer release a newly started refresh', async () => {
    const initial = deferred<NotebookListFilesResult>();
    const refreshed = deferred<NotebookListFilesResult>();
    const { api } = setup({
      listFiles: vi
        .fn()
        .mockImplementationOnce(() => initial.promise)
        .mockImplementationOnce(() => refreshed.promise),
    });
    let generation = 1;
    const workspace = createNotebookWorkspace(
      () => {
        const captured = generation;
        return { api, isCurrent: () => captured === generation, retire: () => undefined };
      },
      () => true,
    );
    const pending = workspace.refreshFiles(A);
    generation += 1;
    let replacement: Promise<CloudCodeSession | null> | undefined;
    let requested = false;
    const unsubscribe = workspace.subscribe(A, () => {
      if (!requested && workspace.getSnapshot(A).operation === null) {
        requested = true;
        replacement = workspace.refreshFiles(A);
      }
    });
    initial.resolve({ session: session(A), files: [] });
    await pending;
    expect(workspace.getSnapshot(A).operation).toBe('list');
    expect(api.listFiles).toHaveBeenCalledTimes(2);
    refreshed.resolve({
      session: session(A),
      files: [{ path: 'new.txt', name: 'new.txt', byteSize: 1, isDir: false }],
    });
    await replacement;
    expect(workspace.getSnapshot(A).operation).toBeNull();
    expect(workspace.getSnapshot(A).files[0]?.path).toBe('new.txt');
    unsubscribe();
  });
});
