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
  MAX_INGESTED_TEXT_CHARS,
  nextFileVersion,
  type GeneratedFileWireLike,
  type ManagedFile,
} from '../index';

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
    expect(result.error).toBeNull();
  });

  it('reports an extractor failure on the file itself', async () => {
    const result = await createIngestionPipeline({
      pdf: async () => {
        throw new Error('encrypted');
      },
    }).ingest(webFile);
    expect(result.file.parseStatus).toBe('failed');
    expect(result.error).toBe('encrypted');
  });
});
