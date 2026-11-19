/**
 * AGI-27: a file attached to a code-execution turn never reached the sandbox,
 * so the model's first move was a write_file carrying the whole attachment back
 * in, which costs an approval and a full copy of the bytes before any analysis
 * could start. These cases pin the staging that removes that step: the bytes
 * land under the workspace root the sandbox starts in, at a path the prompt can
 * name, and the writer touches nothing but the executor it was handed.
 */
import { describe, it, expect, vi } from 'vitest';
import { createMemoryObjectStore } from '@agiworkforce/object-storage';
import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import type { E2BExecutor, ExecutionResult, StagedStorageRecord } from '../types';
import {
  resolveStagedAttachments,
  stageStorageFiles,
  stageTurnAttachments,
  stagedAttachmentPaths,
  storageNotStagedNote,
  SANDBOX_WORKSPACE_ROOT,
  type StorageStagingOptions,
  type StorageTurnFile,
  type TurnAttachment,
} from '../attachment-staging';

function attachment(filename: string, body = 'a,b\n1,2\n'): TurnAttachment {
  return {
    filename,
    mimeType: 'text/csv',
    base64: Buffer.from(body, 'utf8').toString('base64'),
  };
}

function makeExecutor(writeFile: E2BExecutor['writeFile']): E2BExecutor {
  return {
    runCode: vi.fn(),
    writeFile,
    createFolder: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('resolveStagedAttachments', () => {
  it('places an attachment at the workspace root the sandbox starts in', () => {
    expect(stagedAttachmentPaths([attachment('sales.csv')])).toEqual([
      `${SANDBOX_WORKSPACE_ROOT}/sales.csv`,
    ]);
  });

  it('keeps a user-supplied name from addressing anything but a workspace leaf', () => {
    const paths = stagedAttachmentPaths([
      attachment('../../etc/passwd'),
      attachment('/absolute/report.csv'),
      attachment('.hidden.csv'),
      attachment('quarter one (final).csv'),
    ]);

    expect(paths).toEqual([
      `${SANDBOX_WORKSPACE_ROOT}/passwd`,
      `${SANDBOX_WORKSPACE_ROOT}/report.csv`,
      `${SANDBOX_WORKSPACE_ROOT}/hidden.csv`,
      `${SANDBOX_WORKSPACE_ROOT}/quarter_one_final_.csv`,
    ]);
  });

  it('gives a repeated filename its own path so the second file is not lost', () => {
    const paths = stagedAttachmentPaths([
      attachment('data.csv'),
      attachment('data.csv'),
      attachment('data.csv'),
    ]);

    expect(paths).toEqual([
      `${SANDBOX_WORKSPACE_ROOT}/data.csv`,
      `${SANDBOX_WORKSPACE_ROOT}/data-2.csv`,
      `${SANDBOX_WORKSPACE_ROOT}/data-3.csv`,
    ]);
  });

  it('names an attachment whose filename sanitises to nothing', () => {
    expect(stagedAttachmentPaths([attachment('...')])).toEqual([
      `${SANDBOX_WORKSPACE_ROOT}/attachment-1`,
    ]);
  });

  it('skips an attachment with no bytes rather than writing an empty file', () => {
    expect(
      resolveStagedAttachments([{ filename: 'empty.csv', mimeType: 'text/csv', base64: '' }]),
    ).toEqual([]);
  });
});

describe('stageTurnAttachments', () => {
  it('writes the attachment bytes as base64 at the path the prompt names', async () => {
    const writeFile = vi.fn().mockResolvedValue({ ok: true, output: 'Wrote' });
    const staged = attachment('sales.csv');

    const outcome = await stageTurnAttachments(makeExecutor(writeFile), [staged]);

    expect(writeFile).toHaveBeenCalledWith({
      path: `${SANDBOX_WORKSPACE_ROOT}/sales.csv`,
      content: staged.base64,
      encoding: 'base64',
    });
    expect(outcome).toEqual({ staged: [`${SANDBOX_WORKSPACE_ROOT}/sales.csv`], failed: [] });
  });

  it('stages the rest when one file fails or throws', async () => {
    const writeFile = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, output: '', error: 'disk full' })
      .mockRejectedValueOnce(new Error('sandbox went away'))
      .mockResolvedValueOnce({ ok: true, output: 'Wrote' });

    const outcome = await stageTurnAttachments(makeExecutor(writeFile), [
      attachment('one.csv'),
      attachment('two.csv'),
      attachment('three.csv'),
    ]);

    expect(outcome.staged).toEqual([`${SANDBOX_WORKSPACE_ROOT}/three.csv`]);
    expect(outcome.failed).toEqual([
      `${SANDBOX_WORKSPACE_ROOT}/one.csv`,
      `${SANDBOX_WORKSPACE_ROOT}/two.csv`,
    ]);
  });

  /**
   * Sandbox slots are a small per-user quota that leaked sandboxes have
   * exhausted before, so staging may only ever use the executor it is given:
   * it must never reach for one of its own, and an empty manifest must not
   * touch the sandbox at all.
   */
  it('touches nothing when the turn carried no attachments', async () => {
    const writeFile = vi.fn();

    const outcome = await stageTurnAttachments(makeExecutor(writeFile), []);

    expect(writeFile).not.toHaveBeenCalled();
    expect(outcome).toEqual({ staged: [], failed: [] });
  });
});

const PRIVATE_BUCKET = 'private';
const REMOVE_TIMEOUT_MS = 5_000;

function turnOptions(extra: Partial<StorageStagingOptions> = {}): StorageStagingOptions {
  return {
    signal: new AbortController().signal,
    isAllowedKey: () => true,
    removeTimeoutMs: REMOVE_TIMEOUT_MS,
    ...extra,
  };
}

class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function storageFile(assetId: string, filename: string, bytes: Uint8Array): StorageTurnFile {
  return {
    assetId,
    filename,
    mimeType: 'text/csv',
    byteSize: bytes.byteLength,
    key: `chat-attachments/user-1/${assetId}.csv.scanned`,
  };
}

async function storeWith(files: Record<string, Uint8Array>) {
  const store = createMemoryObjectStore();
  for (const [key, body] of Object.entries(files)) {
    await store.put({
      bucket: PRIVATE_BUCKET,
      key,
      body: Buffer.from(body),
      contentType: 'text/csv',
    });
  }
  return {
    store,
    openStream: (key: string) => store.getStream(PRIVATE_BUCKET, key),
  };
}

function streamingExecutor(
  initial: StagedStorageRecord = {},
  existingNames: string[] = [],
  options: { listRemembered?: boolean; directories?: string[]; listingFails?: boolean } = {},
) {
  const written = new Map<string, Uint8Array>();
  let record: StagedStorageRecord = initial;
  const writeFileStream = vi.fn(
    async ({
      path,
      content,
    }: {
      path: string;
      content: ReadableStream<Uint8Array>;
      signal?: AbortSignal;
    }): Promise<ExecutionResult> => {
      if (
        (options.directories ?? []).some((name) => path === `${SANDBOX_WORKSPACE_ROOT}/${name}`)
      ) {
        return { ok: false, output: '', error: 'path is a directory' };
      }
      written.set(path, await readAll(content));
      return { ok: true, output: `Wrote ${path}` };
    },
  );
  const removeFile = vi.fn(async (path: string, _options?: unknown): Promise<ExecutionResult> => {
    if ((options.directories ?? []).some((name) => path === `${SANDBOX_WORKSPACE_ROOT}/${name}`)) {
      throw new Error('a directory would have been removed');
    }
    written.delete(path);
    return { ok: true, output: `Removed ${path}` };
  });
  const save = vi.fn(async (next: StagedStorageRecord, _forget?: readonly string[]) => {
    record = next;
  });
  const load = vi.fn(async () => record);
  const listFiles = vi.fn(async () =>
    options.listingFails
      ? null
      : [
          ...(options.directories ?? []).map((name) => ({
            path: `${SANDBOX_WORKSPACE_ROOT}/${name}`,
            name,
            isDir: true,
            byteSize: 0,
          })),
          ...existingNames.map((name) => ({
            path: `${SANDBOX_WORKSPACE_ROOT}/${name}`,
            name,
            isDir: false,
            byteSize: 1,
          })),
          ...(options.listRemembered === false
            ? []
            : Object.values(initial).map((entry) => ({
                path: entry.path,
                name: entry.path.slice(SANDBOX_WORKSPACE_ROOT.length + 1),
                isDir: false,
                byteSize: entry.byteSize,
              }))),
          ...[...written].map(([path, bytes]) => ({
            path,
            name: path.slice(SANDBOX_WORKSPACE_ROOT.length + 1),
            isDir: false,
            byteSize: bytes.byteLength,
          })),
        ],
  );
  const executor: E2BExecutor = {
    ...makeExecutor(vi.fn()),
    writeFileStream,
    removeFile,
    storageStaging: { load, save },
    listFiles,
  };
  return { executor, written, writeFileStream, removeFile, save, load, record: () => record };
}

describe('stageStorageFiles', () => {
  it('hands the sandbox exactly the bytes in storage, as a stream', async () => {
    const bytes = new Uint8Array(3 * 1024 + 7).map((_, index) => index % 251);
    const { store, openStream } = await storeWith({ 'k/one.scanned': bytes });
    const file = { ...storageFile('asset-1', 'big.csv', bytes), key: 'k/one.scanned' };
    const run = streamingExecutor();
    const receivedTypes: unknown[] = [];
    const inner = run.writeFileStream.getMockImplementation()!;
    run.writeFileStream.mockImplementation(async (input) => {
      receivedTypes.push(input.content);
      return inner(input);
    });

    const outcome = await stageStorageFiles(run.executor, [file], turnOptions({ openStream }));

    expect(outcome).toEqual({
      staged: [
        { assetId: 'asset-1', filename: 'big.csv', path: `${SANDBOX_WORKSPACE_ROOT}/big.csv` },
      ],
      notStaged: [],
    });
    expect(receivedTypes[0]).toBeInstanceOf(ReadableStream);
    expect(Buffer.from(run.written.get(`${SANDBOX_WORKSPACE_ROOT}/big.csv`)!)).toEqual(
      Buffer.from(bytes),
    );
    store.clear();
  });

  it('does not copy a file a second turn asks for again', async () => {
    const bytes = Buffer.from('a,b\n1,2\n');
    const { openStream } = await storeWith({ 'k/one.scanned': bytes });
    const file = { ...storageFile('asset-1', 'big.csv', bytes), key: 'k/one.scanned' };
    const first = streamingExecutor();
    await stageStorageFiles(first.executor, [file], turnOptions({ openStream }));
    expect(first.writeFileStream).toHaveBeenCalledTimes(1);
    expect(first.record()).toEqual({
      'asset-1': { path: `${SANDBOX_WORKSPACE_ROOT}/big.csv`, byteSize: bytes.byteLength },
    });

    const openAgain = vi.fn(openStream);
    const second = streamingExecutor(first.record());
    const outcome = await stageStorageFiles(
      second.executor,
      [file],
      turnOptions({ openStream: openAgain }),
    );

    expect(second.writeFileStream).not.toHaveBeenCalled();
    expect(openAgain).not.toHaveBeenCalled();
    expect(outcome.staged).toEqual([
      { assetId: 'asset-1', filename: 'big.csv', path: `${SANDBOX_WORKSPACE_ROOT}/big.csv` },
    ]);
  });

  it('keeps a new file off the name of a file already in the workspace', async () => {
    const bytes = Buffer.from('x');
    const { openStream } = await storeWith({ 'k/one.scanned': bytes });
    const file = { ...storageFile('asset-1', 'data.csv', bytes), key: 'k/one.scanned' };
    const run = streamingExecutor({}, ['data.csv']);

    const outcome = await stageStorageFiles(run.executor, [file], turnOptions({ openStream }));

    expect(outcome.staged[0]?.path).toBe(`${SANDBOX_WORKSPACE_ROOT}/data-2.csv`);
  });

  it('enforces the per-sandbox total across files and across turns', async () => {
    const six = Buffer.from('abcdef');
    const { openStream } = await storeWith({ 'k/a': six, 'k/b': six, 'k/c': six });
    const files = ['a', 'b', 'c'].map((id) => ({
      ...storageFile(`asset-${id}`, `${id}.csv`, six),
      key: `k/${id}`,
    }));
    const run = streamingExecutor();

    const first = await stageStorageFiles(
      run.executor,
      files.slice(0, 2),
      turnOptions({ openStream, maxStagedBytes: 10 }),
    );
    expect(first.staged.map((entry) => entry.assetId)).toEqual(['asset-a']);
    expect(first.notStaged).toEqual([
      { assetId: 'asset-b', filename: 'b.csv', reason: 'sandbox_full' },
    ]);

    const later = streamingExecutor(run.record());
    const second = await stageStorageFiles(
      later.executor,
      [files[2]!],
      turnOptions({ openStream, maxStagedBytes: 10 }),
    );
    expect(second.notStaged.map((entry) => entry.reason)).toEqual(['sandbox_full']);
    expect(later.writeFileStream).not.toHaveBeenCalled();
  });

  it('takes the total from the large-file policy when none is given', async () => {
    const openStream = vi.fn();
    const run = streamingExecutor();
    const file: StorageTurnFile = {
      assetId: 'asset-1',
      filename: 'huge.csv',
      mimeType: 'text/csv',
      byteSize: CHAT_LARGE_FILE_POLICY.largeFiles.sandboxStagedBytesMax + 1,
      key: 'k/huge',
    };

    const outcome = await stageStorageFiles(run.executor, [file], turnOptions({ openStream }));

    expect(outcome.notStaged).toEqual([
      { assetId: 'asset-1', filename: 'huge.csv', reason: 'sandbox_full' },
    ]);
    expect(openStream).not.toHaveBeenCalled();
  });

  it('reports a file as not staged when the sandbox image cannot take a stream', async () => {
    const bytes = Buffer.from('abc');
    const { openStream } = await storeWith({ 'k/one.scanned': bytes });
    const file = { ...storageFile('asset-1', 'big.csv', bytes), key: 'k/one.scanned' };
    const thrown = streamingExecutor();
    thrown.writeFileStream.mockRejectedValueOnce(new TemplateError('needs envd 0.5.7'));
    const refused = streamingExecutor();
    refused.writeFileStream.mockResolvedValueOnce({
      ok: false,
      output: '',
      error: 'needs envd 0.5.7',
      unavailable: true,
    });
    const without = streamingExecutor();
    delete without.executor.writeFileStream;

    for (const run of [thrown, refused, without]) {
      const outcome = await stageStorageFiles(run.executor, [file], turnOptions({ openStream }));
      expect(outcome.staged).toEqual([]);
      expect(outcome.notStaged).toEqual([
        { assetId: 'asset-1', filename: 'big.csv', reason: 'sandbox_unsupported' },
      ]);
      expect(run.save).not.toHaveBeenCalled();
    }
    expect(storageNotStagedNote('big.csv', 'sandbox_unsupported')).toContain('big.csv');
  });

  it('reports a file as not staged when copying fails, and stages the next one', async () => {
    const good = Buffer.from('good');
    const { openStream } = await storeWith({ 'k/a': Buffer.from('abcd'), 'k/b': good });
    const files = [
      { ...storageFile('asset-a', 'a.csv', Buffer.from('abcd')), key: 'k/a' },
      { ...storageFile('asset-b', 'b.csv', good), key: 'k/b' },
    ];
    const run = streamingExecutor();
    run.writeFileStream.mockRejectedValueOnce(new Error('connection reset'));

    const outcome = await stageStorageFiles(run.executor, files, turnOptions({ openStream }));

    expect(outcome.notStaged).toEqual([
      { assetId: 'asset-a', filename: 'a.csv', reason: 'stream_failed' },
    ]);
    expect(outcome.staged.map((entry) => entry.assetId)).toEqual(['asset-b']);
    expect(Object.keys(run.record())).toEqual(['asset-b']);
  });

  it('reports a stream that errors part way and a stored file that is gone', async () => {
    const failing = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
        controller.error(new Error('socket closed'));
      },
    });
    const run = streamingExecutor();
    const file: StorageTurnFile = {
      assetId: 'asset-1',
      filename: 'a.csv',
      mimeType: 'text/csv',
      byteSize: 8,
      key: 'k/a',
    };

    const broken = await stageStorageFiles(
      run.executor,
      [file],
      turnOptions({ openStream: async () => ({ body: failing }) }),
    );
    expect(broken.notStaged).toEqual([
      { assetId: 'asset-1', filename: 'a.csv', reason: 'stream_failed' },
    ]);

    const missing = await stageStorageFiles(
      run.executor,
      [file],
      turnOptions({ openStream: async () => null }),
    );
    expect(missing.notStaged).toEqual([
      { assetId: 'asset-1', filename: 'a.csv', reason: 'not_in_storage' },
    ]);
    expect(run.save).not.toHaveBeenCalled();
  });

  it('refuses bytes that disagree with the recorded size', async () => {
    const stored = Buffer.from('twelve bytes');
    const { openStream } = await storeWith({ 'k/a': stored });
    const longer = { ...storageFile('asset-1', 'a.csv', stored), key: 'k/a', byteSize: 5 };
    const shorter = { ...storageFile('asset-2', 'b.csv', stored), key: 'k/a', byteSize: 40 };
    const run = streamingExecutor();

    const outcome = await stageStorageFiles(
      run.executor,
      [longer, shorter],
      turnOptions({ openStream }),
    );

    expect(outcome.staged).toEqual([]);
    expect(outcome.notStaged.map((entry) => entry.reason)).toEqual([
      'stream_failed',
      'stream_failed',
    ]);
    expect(run.save).not.toHaveBeenCalled();
    expect(run.removeFile.mock.calls.map(([path]) => path)).toEqual([
      `${SANDBOX_WORKSPACE_ROOT}/a.csv`,
      `${SANDBOX_WORKSPACE_ROOT}/b.csv`,
    ]);
    expect([...run.written.keys()]).toEqual([]);
  });

  it('removes a failed copy so a retry takes the same name', async () => {
    const bytes = Buffer.from('twelve bytes');
    const { openStream } = await storeWith({ 'k/a': bytes });
    const short = { ...storageFile('asset-1', 'a.csv', bytes), key: 'k/a', byteSize: 40 };
    const right = { ...short, byteSize: bytes.byteLength };
    const run = streamingExecutor();

    const failed = await stageStorageFiles(run.executor, [short], turnOptions({ openStream }));
    const retried = await stageStorageFiles(run.executor, [right], turnOptions({ openStream }));

    expect(failed.notStaged).toHaveLength(1);
    expect(retried.staged[0]?.path).toBe(`${SANDBOX_WORKSPACE_ROOT}/a.csv`);
  });

  it('keeps a name taken when the failed copy could not be removed', async () => {
    const bytes = Buffer.from('twelve bytes');
    const { openStream } = await storeWith({ 'k/a': bytes, 'k/b': bytes });
    const short = { ...storageFile('asset-1', 'a.csv', bytes), key: 'k/a', byteSize: 40 };
    const right = { ...storageFile('asset-2', 'a.csv', bytes), key: 'k/b' };
    const run = streamingExecutor();
    run.removeFile.mockRejectedValueOnce(new Error('sandbox went away'));

    const outcome = await stageStorageFiles(
      run.executor,
      [short, right],
      turnOptions({ openStream }),
    );

    expect(outcome.staged[0]?.path).toBe(`${SANDBOX_WORKSPACE_ROOT}/a-2.csv`);
  });

  it('does not try to remove a copy the sandbox never started', async () => {
    const bytes = Buffer.from('abc');
    const { openStream } = await storeWith({ 'k/a': bytes });
    const file = { ...storageFile('asset-1', 'a.csv', bytes), key: 'k/a' };
    const run = streamingExecutor();
    run.writeFileStream.mockResolvedValueOnce({
      ok: false,
      output: '',
      error: 'needs envd 0.5.7',
      unavailable: true,
    });

    await stageStorageFiles(run.executor, [file], turnOptions({ openStream }));

    expect(run.removeFile).not.toHaveBeenCalled();
  });

  it('ends a copy that never settles when the signal aborts, and leaves the record unsaved', async () => {
    const bytes = Buffer.from('abcd');
    const { openStream } = await storeWith({ 'k/a': bytes });
    const file = { ...storageFile('asset-1', 'a.csv', bytes), key: 'k/a' };
    const run = streamingExecutor();
    run.writeFileStream.mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    );
    const turn = new AbortController();

    const pending = stageStorageFiles(
      run.executor,
      [file],
      turnOptions({ openStream, signal: turn.signal }),
    );
    await vi.waitFor(() => expect(run.writeFileStream).toHaveBeenCalledTimes(1));
    turn.abort();
    const outcome = await pending;

    expect(outcome.staged).toEqual([]);
    expect(outcome.notStaged).toEqual([
      { assetId: 'asset-1', filename: 'a.csv', reason: 'stream_failed' },
    ]);
    expect(run.save).not.toHaveBeenCalled();
    expect(run.removeFile).toHaveBeenCalledWith(`${SANDBOX_WORKSPACE_ROOT}/a.csv`, {
      requestTimeoutMs: REMOVE_TIMEOUT_MS,
    });
  });

  it('opens nothing once the signal has aborted', async () => {
    const openStream = vi.fn();
    const run = streamingExecutor();
    const turn = new AbortController();
    turn.abort();
    const files = ['a', 'b'].map((id) => ({
      assetId: `asset-${id}`,
      filename: `${id}.csv`,
      mimeType: 'text/csv',
      byteSize: 4,
      key: `k/${id}`,
    }));

    const outcome = await stageStorageFiles(
      run.executor,
      files,
      turnOptions({ openStream, signal: turn.signal }),
    );

    expect(outcome.notStaged.map((entry) => entry.reason)).toEqual([
      'stream_failed',
      'stream_failed',
    ]);
    expect(openStream).not.toHaveBeenCalled();
    expect(run.writeFileStream).not.toHaveBeenCalled();
    expect(run.load).not.toHaveBeenCalled();
    expect(run.executor.listFiles).not.toHaveBeenCalled();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'stages nothing when the removal bound is %s, since a failed copy could not be bounded',
    async (removeTimeoutMs) => {
      const openStream = vi.fn();
      const run = streamingExecutor();
      const file = {
        assetId: 'asset-a',
        filename: 'a.csv',
        mimeType: 'text/csv',
        byteSize: 4,
        key: 'k/a',
      };

      const outcome = await stageStorageFiles(
        run.executor,
        [file, file],
        turnOptions({ openStream, removeTimeoutMs }),
      );

      expect(outcome).toEqual({
        staged: [],
        notStaged: [{ assetId: 'asset-a', filename: 'a.csv', reason: 'stream_failed' }],
      });
      expect(openStream).not.toHaveBeenCalled();
      expect(run.writeFileStream).not.toHaveBeenCalled();
      expect(run.removeFile).not.toHaveBeenCalled();
    },
  );

  it('keeps counting a failed copy that could not be removed, and refuses the next file once the total is full', async () => {
    const bytes = Buffer.from('twelve bytes');
    const { openStream } = await storeWith({ 'k/a': bytes, 'k/b': bytes });
    const short = { ...storageFile('asset-1', 'a.csv', bytes), key: 'k/a', byteSize: 40 };
    const next = { ...storageFile('asset-2', 'b.csv', bytes), key: 'k/b' };
    const run = streamingExecutor();
    run.removeFile.mockRejectedValueOnce(new Error('sandbox went away'));

    await stageStorageFiles(run.executor, [short], turnOptions({ openStream }));
    const outcome = await stageStorageFiles(
      run.executor,
      [next],
      turnOptions({ openStream, maxStagedBytes: bytes.byteLength + 3 }),
    );

    expect(run.record()).toEqual({
      'displaced:a.csv': {
        path: `${SANDBOX_WORKSPACE_ROOT}/a.csv`,
        byteSize: bytes.byteLength,
      },
    });
    expect(outcome.notStaged).toEqual([
      { assetId: 'asset-2', filename: 'b.csv', reason: 'sandbox_full' },
    ]);
  });

  it('cancels the storage body when the copy fails', async () => {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(2));
      },
      cancel: cancelled,
    });
    const run = streamingExecutor();
    run.writeFileStream.mockRejectedValueOnce(new Error('connection reset'));
    const file: StorageTurnFile = {
      assetId: 'asset-1',
      filename: 'a.csv',
      mimeType: 'text/csv',
      byteSize: 100,
      key: 'k/a',
    };

    await stageStorageFiles(
      run.executor,
      [file],
      turnOptions({ openStream: async () => ({ body }) }),
    );

    await vi.waitFor(() => expect(cancelled).toHaveBeenCalled());
  });

  it('refuses a key the caller does not allow before opening anything', async () => {
    const openStream = vi.fn();
    const run = streamingExecutor();
    const file: StorageTurnFile = {
      assetId: 'asset-1',
      filename: 'a.csv',
      mimeType: 'text/csv',
      byteSize: 4,
      key: 'other-user/a',
    };

    const outcome = await stageStorageFiles(
      run.executor,
      [file],
      turnOptions({ openStream, isAllowedKey: (key) => key.startsWith('chat-attachments/') }),
    );

    expect(outcome.notStaged).toEqual([
      { assetId: 'asset-1', filename: 'a.csv', reason: 'not_in_storage' },
    ]);
    expect(openStream).not.toHaveBeenCalled();
  });

  it('copies a remembered file again when the workspace no longer holds it', async () => {
    const bytes = Buffer.from('a,b\n1,2\n');
    const { openStream } = await storeWith({ 'k/a': bytes });
    const file = { ...storageFile('asset-1', 'big.csv', bytes), key: 'k/a' };
    const remembered = {
      'asset-1': { path: `${SANDBOX_WORKSPACE_ROOT}/big.csv`, byteSize: bytes.byteLength },
    };
    const run = streamingExecutor(remembered, [], { listRemembered: false });

    const outcome = await stageStorageFiles(run.executor, [file], turnOptions({ openStream }));

    expect(run.save.mock.calls[0]?.[1]).toEqual(['asset-1']);
    expect(run.writeFileStream).toHaveBeenCalledTimes(1);
    expect(outcome.staged).toEqual([
      { assetId: 'asset-1', filename: 'big.csv', path: `${SANDBOX_WORKSPACE_ROOT}/big.csv` },
    ]);
    expect(run.record()).toEqual(remembered);
  });

  it('copies a remembered file again when the workspace holds other bytes under its name', async () => {
    const bytes = Buffer.from('a,b\n1,2\n');
    const { openStream } = await storeWith({ 'k/a': bytes });
    const file = { ...storageFile('asset-1', 'big.csv', bytes), key: 'k/a' };
    const remembered = {
      'asset-1': { path: `${SANDBOX_WORKSPACE_ROOT}/big.csv`, byteSize: bytes.byteLength },
    };
    const run = streamingExecutor(remembered, [], { listRemembered: false });
    run.executor.listFiles = vi.fn(async () => [
      { path: `${SANDBOX_WORKSPACE_ROOT}/big.csv`, name: 'big.csv', isDir: false, byteSize: 3 },
    ]);

    const outcome = await stageStorageFiles(run.executor, [file], turnOptions({ openStream }));

    expect(run.writeFileStream).toHaveBeenCalledTimes(1);
    expect(outcome.staged[0]?.path).toBe(`${SANDBOX_WORKSPACE_ROOT}/big-2.csv`);
  });

  it('lands a copy beside a workspace directory of the same name and never removes the directory', async () => {
    const bytes = Buffer.from('a,b\n1,2\n');
    const { openStream } = await storeWith({ 'k/a': bytes });
    const file = { ...storageFile('asset-1', 'data', bytes), key: 'k/a' };
    const run = streamingExecutor({}, [], { directories: ['data'] });

    const outcome = await stageStorageFiles(run.executor, [file], turnOptions({ openStream }));

    expect(outcome.staged[0]?.path).toBe(`${SANDBOX_WORKSPACE_ROOT}/data-2`);
    expect(run.removeFile).not.toHaveBeenCalled();
  });

  it('stages nothing new and removes nothing when the workspace listing fails', async () => {
    const bytes = Buffer.from('abc');
    const { openStream } = await storeWith({ 'k/a': bytes, 'k/b': bytes });
    const known = { ...storageFile('asset-known', 'known.csv', bytes), key: 'k/a' };
    const fresh = { ...storageFile('asset-fresh', 'fresh.csv', bytes), key: 'k/b' };
    const remembered = {
      'asset-known': { path: `${SANDBOX_WORKSPACE_ROOT}/known.csv`, byteSize: bytes.byteLength },
    };
    const run = streamingExecutor(remembered, [], { listingFails: true });
    const opened = vi.fn(openStream);

    const outcome = await stageStorageFiles(
      run.executor,
      [known, fresh],
      turnOptions({ openStream: opened }),
    );

    expect(outcome.staged.map((entry) => entry.assetId)).toEqual(['asset-known']);
    expect(outcome.notStaged).toEqual([
      { assetId: 'asset-fresh', filename: 'fresh.csv', reason: 'stream_failed' },
    ]);
    expect(opened).not.toHaveBeenCalled();
    expect(run.writeFileStream).not.toHaveBeenCalled();
    expect(run.removeFile).not.toHaveBeenCalled();
  });

  it('keeps counting a rewritten file against the sandbox total', async () => {
    const bytes = Buffer.from('a,b\n1,2\n');
    const { openStream } = await storeWith({ 'k/b': bytes });
    const again = { ...storageFile('asset-2', 'big.csv', bytes), key: 'k/b' };
    const remembered = {
      'asset-1': { path: `${SANDBOX_WORKSPACE_ROOT}/big.csv`, byteSize: bytes.byteLength },
    };
    const run = streamingExecutor(remembered, [], { listRemembered: false });
    run.executor.listFiles = vi.fn(async () => [
      { path: `${SANDBOX_WORKSPACE_ROOT}/big.csv`, name: 'big.csv', isDir: false, byteSize: 6 },
    ]);

    const outcome = await stageStorageFiles(
      run.executor,
      [again],
      turnOptions({ openStream, maxStagedBytes: 2 * bytes.byteLength - 3 }),
    );

    expect(outcome.notStaged).toEqual([
      { assetId: 'asset-2', filename: 'big.csv', reason: 'sandbox_full' },
    ]);
    expect(run.writeFileStream).not.toHaveBeenCalled();
    expect(run.record()).toEqual({
      'displaced:big.csv': { path: `${SANDBOX_WORKSPACE_ROOT}/big.csv`, byteSize: 6 },
    });
  });

  it('stops counting a rewritten file once it is gone from the workspace', async () => {
    const bytes = Buffer.from('a,b\n1,2\n');
    const { openStream } = await storeWith({ 'k/b': bytes });
    const again = { ...storageFile('asset-2', 'big.csv', bytes), key: 'k/b' };
    const displaced = {
      'displaced:big.csv': { path: `${SANDBOX_WORKSPACE_ROOT}/big.csv`, byteSize: 6 },
    };
    const run = streamingExecutor(displaced, [], { listRemembered: false });

    const outcome = await stageStorageFiles(
      run.executor,
      [again],
      turnOptions({ openStream, maxStagedBytes: bytes.byteLength }),
    );

    expect(run.save.mock.calls[0]?.[1]).toEqual(['displaced:big.csv']);
    expect(outcome.staged[0]?.path).toBe(`${SANDBOX_WORKSPACE_ROOT}/big.csv`);
    expect(Object.keys(run.record())).toEqual(['asset-2']);
  });

  it('trusts what it remembers when the workspace cannot be listed', async () => {
    const bytes = Buffer.from('abc');
    const file = { ...storageFile('asset-1', 'big.csv', bytes), key: 'k/a' };
    const remembered = {
      'asset-1': { path: `${SANDBOX_WORKSPACE_ROOT}/big.csv`, byteSize: bytes.byteLength },
    };
    const run = streamingExecutor(remembered);
    delete run.executor.listFiles;
    const openStream = vi.fn();

    const outcome = await stageStorageFiles(run.executor, [file], turnOptions({ openStream }));

    expect(openStream).not.toHaveBeenCalled();
    expect(outcome.staged).toHaveLength(1);
  });

  it('stages nothing new when the executor cannot list the workspace at all', async () => {
    const bytes = Buffer.from('abc');
    const { openStream } = await storeWith({ 'k/b': bytes });
    const fresh = { ...storageFile('asset-fresh', 'fresh.csv', bytes), key: 'k/b' };
    const run = streamingExecutor();
    delete run.executor.listFiles;
    const opened = vi.fn(openStream);

    const outcome = await stageStorageFiles(
      run.executor,
      [fresh],
      turnOptions({ openStream: opened }),
    );

    expect(outcome.notStaged).toEqual([
      { assetId: 'asset-fresh', filename: 'fresh.csv', reason: 'stream_failed' },
    ]);
    expect(opened).not.toHaveBeenCalled();
    expect(run.writeFileStream).not.toHaveBeenCalled();
    expect(run.removeFile).not.toHaveBeenCalled();
  });

  it('touches nothing when the turn carried no large files', async () => {
    const run = streamingExecutor();

    const outcome = await stageStorageFiles(run.executor, [], turnOptions());

    expect(outcome).toEqual({ staged: [], notStaged: [] });
    expect(run.load).not.toHaveBeenCalled();
    expect(run.writeFileStream).not.toHaveBeenCalled();
  });

  it('leaves inline staging on the base64 writer', async () => {
    const writeFile = vi.fn().mockResolvedValue({ ok: true, output: 'Wrote' });
    const run = streamingExecutor();
    run.executor.writeFile = writeFile;

    await stageTurnAttachments(run.executor, [attachment('sales.csv')]);

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(run.writeFileStream).not.toHaveBeenCalled();
  });
});
