import { describe, expect, it } from 'vitest';
import {
  buildLibraryEntries,
  createIngestionPipeline,
  deriveManagedFile,
  fileLineageGraph,
  fileVersionChain,
  derivedFromFile,
  generatedWireFromManagedFile,
  ingestionRouteFor,
  managedFileFromDeviceExport,
  managedFileFromGeneratedWire,
  managedFileFromLocalDocument,
  managedFileFromUpload,
  IngestionFailure,
  INGESTION_FAILURE_REASONS,
  ingestionFailureMessage,
  isTerminalParseStatus,
  libraryEntryCursor,
  listLibraryPage,
  deletableByOwner,
  readableByOwner,
  DOCUMENT_CLASSES,
  MAX_INGESTED_TEXT_CHARS,
  nextFileVersion,
  type GeneratedFileWireLike,
  type ManagedFile,
} from '../index';
import { createManagedFile } from '@agiworkforce/types';

const WIRE: GeneratedFileWireLike = {
  id: 'asset-1',
  file_name: 'report.pdf',
  mime_type: 'application/pdf',
  uri: '/api/files/asset-1',
  byte_count: 5120,
  kind: 'pdf',
  checksum_sha256: 'c'.repeat(64),
  surface: 'file',
  previewable: true,
};

/**
 * The three call sites the surfaces actually use: the web route hands back a
 * generated-file wire, the desktop document layer hands back a path on disk,
 * and the mobile exporter hands back a sandbox uri.
 */
const webFile = managedFileFromGeneratedWire(WIRE, { sourceSurface: 'web' });
const desktopFile = managedFileFromLocalDocument(
  { file_path: '/Users/q/Documents/report.pdf', file_name: 'report.pdf', file_size: 5120 },
  { sourceSurface: 'desktop' },
);
const mobileFile = managedFileFromDeviceExport(
  { uri: 'file:///data/exports/report.pdf', fileName: 'report.pdf' },
  { sourceSurface: 'mobile', byteCount: 5120 },
);

describe('one File model on all three surfaces', () => {
  it('produces the identical set of fields whichever surface built it', () => {
    const keys = (file: ManagedFile) => Object.keys(file).sort();
    expect(keys(desktopFile)).toEqual(keys(webFile));
    expect(keys(mobileFile)).toEqual(keys(webFile));
    expect(Object.keys(desktopFile.lineage).sort()).toEqual(Object.keys(webFile.lineage).sort());
  });

  it('agrees on name, media type, size, version and lineage for the same bytes', () => {
    for (const file of [webFile, desktopFile, mobileFile]) {
      expect(file.name).toBe('report.pdf');
      expect(file.mediaType).toBe('application/pdf');
      expect(file.byteCount).toBe(5120);
      expect(file.version).toBe(1);
      expect(file.parentVersionId).toBeNull();
      expect(file.lineage.derivedFromFileId).toBeNull();
    }
  });

  it('records where the bytes live so no surface tries to fetch a local path', () => {
    expect(webFile.storage).toBe('managed_cloud');
    expect(desktopFile.storage).toBe('local_device');
    expect(mobileFile.storage).toBe('local_device');
  });

  it('round trips a generated file through the wire shape without losing identity', () => {
    const round = managedFileFromGeneratedWire(generatedWireFromManagedFile(webFile), {
      sourceSurface: 'web',
    });
    expect(round).toEqual(webFile);
  });

  it('keeps an uploaded attachment on the same type as a generated one', () => {
    const upload = managedFileFromUpload({
      id: 'up-1',
      name: 'notes.md',
      mimeType: 'text/markdown',
      byteCount: 12,
      url: '/api/files/up-1',
    });
    expect(Object.keys(upload).sort()).toEqual(Object.keys(webFile).sort());
    expect(upload.origin).toBe('upload');
    expect(upload.parseStatus).toBe('pending');
  });
});

describe('versions', () => {
  it('walks a revision chain back from its newest member', () => {
    const v2 = nextFileVersion(webFile, { id: 'asset-2', uri: '/api/files/asset-2' });
    const v3 = nextFileVersion(v2, { id: 'asset-3', uri: '/api/files/asset-3' });
    expect(fileVersionChain([webFile, v2, v3], 'asset-3').map((file) => file.version)).toEqual([
      3, 2, 1,
    ]);
  });

  it('shows one Library row per file, not one per revision', () => {
    const v2 = nextFileVersion(webFile, { id: 'asset-2', uri: '/api/files/asset-2' });
    const entries = buildLibraryEntries([webFile, v2]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.file.id).toBe('asset-2');
    expect(entries[0]?.versions.map((file) => file.version)).toEqual([2, 1]);
  });
});

describe('lineage', () => {
  const edited = deriveManagedFile(webFile, {
    id: 'asset-edit',
    name: 'report-edited.pdf',
    mediaType: 'application/pdf',
    byteCount: 5200,
    uri: '/api/files/asset-edit',
    origin: 'generated',
    derivation: 'edit',
  });
  const exported = deriveManagedFile(edited, {
    id: 'asset-export',
    name: 'report-edited.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    byteCount: 3300,
    uri: '/api/files/asset-export',
    origin: 'generated',
    derivation: 'export',
  });

  it('orders source, then edit, then export', () => {
    const graph = fileLineageGraph([exported, webFile, edited], 'asset-export');
    expect(graph.map((node) => node.file.id)).toEqual(['asset-1', 'asset-edit', 'asset-export']);
    expect(graph.map((node) => node.depth)).toEqual([0, 1, 2]);
  });

  it('resolves the derived-from link a Library row renders', () => {
    expect(derivedFromFile([webFile, edited], edited)?.id).toBe('asset-1');
    expect(derivedFromFile([webFile], webFile)).toBeNull();
  });

  it('survives a lineage cycle rather than hanging on it', () => {
    const left: ManagedFile = {
      ...webFile,
      id: 'a',
      lineage: { ...webFile.lineage, derivedFromFileId: 'b' },
    };
    const right: ManagedFile = {
      ...webFile,
      id: 'b',
      lineage: { ...webFile.lineage, derivedFromFileId: 'a' },
    };
    expect(fileLineageGraph([left, right], 'a').length).toBeGreaterThan(0);
  });
});

describe('ingestion', () => {
  it('routes each family the same way on every surface', () => {
    expect(ingestionRouteFor('a.docx', 'application/octet-stream')).toBe('office');
    expect(ingestionRouteFor('a.pdf', 'application/pdf')).toBe('pdf');
    expect(ingestionRouteFor('a.md', 'text/markdown')).toBe('text');
    expect(ingestionRouteFor('a.zip', 'application/zip')).toBe('opaque');
  });

  it('marks a file parsed and truncates past the shared cap', async () => {
    const pipeline = createIngestionPipeline({
      text: async () => 'x'.repeat(MAX_INGESTED_TEXT_CHARS + 10),
    });
    const result = await pipeline.ingest(
      managedFileFromUpload({
        id: 'u',
        name: 'a.md',
        mimeType: 'text/markdown',
        byteCount: 1,
        url: '/u',
      }),
    );
    expect(result.file.parseStatus).toBe('parsed');
    expect(result.truncated).toBe(true);
    expect(result.text).toHaveLength(MAX_INGESTED_TEXT_CHARS);
  });

  it('leaves a route this surface cannot decode pending, not failed', async () => {
    const result = await createIngestionPipeline({}).ingest(
      managedFileFromUpload({
        id: 'u',
        name: 'a.docx',
        mimeType: 'application/octet-stream',
        byteCount: 1,
        url: '/u',
      }),
    );
    expect(result.file.parseStatus).toBe('pending');
    expect(result.failure).toBeNull();
  });

  it('reports an extractor failure on the file itself', async () => {
    const result = await createIngestionPipeline({
      pdf: async () => {
        throw new Error('ENOENT: /var/tmp/parser-7 offset 0x41');
      },
    }).ingest(webFile);
    expect(result.file.parseStatus).toBe('failed');
    expect(result.failure?.reason).toBe('corrupt');
    expect(result.failure?.message).not.toContain('/var/tmp');
  });
});

describe('ingestion states', () => {
  const file = (name: string, mimeType: string, byteCount = 10) =>
    managedFileFromUpload({ id: `u-${name}`, name, mimeType, byteCount, url: `/u/${name}` });

  it('settles every declared class in exactly one terminal state', async () => {
    const pipeline = createIngestionPipeline({
      text: async () => 'read',
      office: async () => 'read',
      pdf: async () => 'read',
    });
    for (const documentClass of DOCUMENT_CLASSES) {
      const extension = documentClass.extensions[0] ?? documentClass.id;
      const result = await pipeline.ingest(
        file(`sample.${extension}`, documentClass.mediaTypes[0] ?? 'application/octet-stream'),
      );
      expect(result.route).toBe(documentClass.extractor);
      expect(isTerminalParseStatus(result.file.parseStatus)).toBe(true);
      expect(result.file.parseStatus).toBe('parsed');
    }
  });

  it('reaches the same terminal state and the same text when a retry repeats it', async () => {
    let calls = 0;
    const pipeline = createIngestionPipeline({
      text: async () => {
        calls += 1;
        return 'stable text';
      },
    });
    const first = await pipeline.ingest(file('notes.md', 'text/markdown'));
    const second = await pipeline.ingest(first.file);
    expect(calls).toBe(2);
    expect(second.file.parseStatus).toBe(first.file.parseStatus);
    expect(second.text).toBe(first.text);
  });

  it('leaves no partial text behind when an extractor fails halfway', async () => {
    const result = await createIngestionPipeline({
      text: async () => {
        throw new IngestionFailure('encrypted');
      },
    }).ingest(file('locked.csv', 'text/csv'));
    expect(result.text).toBeNull();
    expect(result.truncated).toBe(false);
    expect(result.file.parseStatus).toBe('failed');
    expect(result.failure?.reason).toBe('encrypted');
  });

  it('refuses bytes past the memory cap without opening them', async () => {
    let opened = false;
    const result = await createIngestionPipeline(
      {
        text: async () => {
          opened = true;
          return 'x';
        },
      },
      { maxBytes: 16 },
    ).ingest(file('huge.csv', 'text/csv', 64));
    expect(opened).toBe(false);
    expect(result.failure?.reason).toBe('too_large');
  });

  it('stops an extractor that never returns rather than hanging the file', async () => {
    const result = await createIngestionPipeline(
      { text: () => new Promise<string>(() => {}) },
      { timeoutMs: 5 },
    ).ingest(file('slow.csv', 'text/csv'));
    expect(result.failure?.reason).toBe('timeout');
    expect(result.file.parseStatus).toBe('failed');
  });

  it('gives every failure reason a message a reader can act on', () => {
    for (const reason of INGESTION_FAILURE_REASONS) {
      const message = ingestionFailureMessage(reason);
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toContain(reason);
    }
  });
});

describe('the Library lists one owner at a time', () => {
  const owned = (id: string, owner: { workspaceId?: string; userId?: string }, createdAt: string) =>
    createManagedFile({
      id,
      name: `${id}.csv`,
      mediaType: 'text/csv',
      byteCount: 10,
      uri: `/api/files/${id}`,
      origin: 'upload',
      owner,
      createdAt,
    });

  const mine = owned('mine-a', { workspaceId: 'ws-1' }, '2026-09-01T00:00:00Z');
  const alsoMine = owned('mine-b', { workspaceId: 'ws-1' }, '2026-09-02T00:00:00Z');
  const theirs = owned('theirs', { workspaceId: 'ws-2' }, '2026-09-03T00:00:00Z');
  const orphan = createManagedFile({
    id: 'orphan',
    name: 'orphan.csv',
    mediaType: 'text/csv',
    byteCount: 10,
    uri: '/api/files/orphan',
    origin: 'upload',
  });
  const all = [mine, alsoMine, theirs, orphan];

  it('hides rows another tenant owns and rows that name no tenant', () => {
    expect(readableByOwner(all, { workspaceId: 'ws-1' }).map((f) => f.id)).toEqual([
      'mine-a',
      'mine-b',
    ]);
  });

  it('refuses to hand a delete a row the caller does not own', () => {
    expect(
      deletableByOwner(all, { workspaceId: 'ws-1' }, ['mine-a', 'theirs', 'orphan']).map(
        (f) => f.id,
      ),
    ).toEqual(['mine-a']);
  });

  it('pages by cursor without repeating or skipping a row when one is added', () => {
    const first = listLibraryPage(all, { reader: { workspaceId: 'ws-1' }, limit: 1 });
    expect(first.entries.map((e) => e.file.id)).toEqual(['mine-b']);
    expect(first.hasMore).toBe(true);

    const inserted = owned('mine-c', { workspaceId: 'ws-1' }, '2026-09-04T00:00:00Z');
    const second = listLibraryPage([...all, inserted], {
      reader: { workspaceId: 'ws-1' },
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(second.entries.map((e) => e.file.id)).toEqual(['mine-a']);
    expect(second.hasMore).toBe(false);
  });

  it('filters to a declared document class', () => {
    const page = listLibraryPage(all, {
      reader: { workspaceId: 'ws-1' },
      documentClassIds: ['json'],
    });
    expect(page.entries).toEqual([]);
    expect(
      listLibraryPage(all, { reader: { workspaceId: 'ws-1' }, documentClassIds: ['csv'] }).entries,
    ).toHaveLength(2);
  });

  it('orders newest first and carries the cursor it paged from', () => {
    const page = listLibraryPage(all, { reader: { workspaceId: 'ws-1' } });
    expect(page.entries.map((e) => libraryEntryCursor(e))).toEqual([
      '2026-09-02T00:00:00Z|mine-b',
      '2026-09-01T00:00:00Z|mine-a',
    ]);
  });
});
