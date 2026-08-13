/**
 * Unit tests for the cloud-turn finalization helpers in chatExecutionStore:
 *
 *  - generatedFileArtifactsFromWire: x_generated_files wire descriptors →
 *    generated-file artifacts (GeneratedFileCard / InlineArtifactCard input).
 *  - citationsFromToolCalls: the turn's web-search tool results → inline
 *    answer citations (CitationChip / CollapsibleSources input).
 */

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

import {
  generatedFileArtifactsFromWire,
  citationsFromToolCalls,
} from '../stores/chat/chatExecutionStore';
import {
  dedupeGeneratedFileWire,
  generatedFileMetadataFromWire,
  generatedFileWireFromMetadata,
  mergeDerivedAndGeneratedFileArtifacts,
} from '../src/features/chat/utils/generatedFileArtifacts';
import { API_URL } from '../lib/constants';
import type { ToolCall } from '../types/chat';

const T = '2026-07-06T00:00:00.000Z';

describe('generatedFileArtifactsFromWire', () => {
  it('dedupes replayed descriptors by id with the last validated descriptor winning', () => {
    const files = dedupeGeneratedFileWire([
      {
        id: 'asset-replayed',
        file_name: 'draft.pdf',
        mime_type: 'application/pdf',
        uri: '/api/files/asset-replayed?revision=1',
        byte_count: 100,
        kind: 'pdf',
        surface: 'file',
        previewable: false,
      },
      {
        id: 'asset-replayed',
        file_name: 'final.pdf',
        mime_type: 'application/pdf',
        uri: '/api/files/asset-replayed?revision=2',
        byte_count: 240,
        kind: 'pdf',
        checksum_sha256: 'd'.repeat(64),
        surface: 'artifact',
        previewable: true,
      },
    ]);

    expect(files).toEqual([
      expect.objectContaining({
        id: 'asset-replayed',
        file_name: 'final.pdf',
        uri: '/api/files/asset-replayed?revision=2',
        byte_count: 240,
        checksum_sha256: 'd'.repeat(64),
        surface: 'artifact',
        previewable: true,
      }),
    ]);
  });

  it('round-trips persisted metadata through the shared wire validator and drops invalid rows', () => {
    const metadata = generatedFileMetadataFromWire([
      {
        id: 'asset-roundtrip',
        file_name: 'analysis.xlsx',
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        uri: '/api/files/asset-roundtrip',
        byte_count: 8192,
        kind: 'xlsx',
        checksum_sha256: 'e'.repeat(64),
        surface: 'artifact',
        previewable: true,
      },
    ]);

    expect(generatedFileWireFromMetadata([...metadata, { id: '', fileName: '' }])).toEqual([
      {
        id: 'asset-roundtrip',
        file_name: 'analysis.xlsx',
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        uri: '/api/files/asset-roundtrip',
        byte_count: 8192,
        kind: 'xlsx',
        checksum_sha256: 'e'.repeat(64),
        surface: 'artifact',
        previewable: true,
      },
    ]);
  });

  it('maps a wire file to a document artifact with a populated generatedFile', () => {
    const artifacts = generatedFileArtifactsFromWire(
      [
        {
          id: 'asset-1',
          file_name: 'report.pdf',
          mime_type: 'application/pdf',
          uri: 'https://media.example/report.pdf',
          byte_count: 2048,
          kind: 'pdf',
          checksum_sha256: 'c'.repeat(64),
        },
      ],
      T,
    );

    expect(artifacts).toHaveLength(1);
    const a = artifacts[0]!;
    expect(a.type).toBe('document');
    expect(a.title).toBe('report.pdf');
    expect(a.generatedFile).toMatchObject({
      id: 'asset-1',
      kind: 'pdf',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      uri: 'https://media.example/report.pdf',
      byteCount: 2048,
      checksumSha256: 'c'.repeat(64),
      sourceSurface: 'mobile',
      privacyMode: 'managed',
      createdAt: T,
    });
    expect(a.metadata).toMatchObject({ status: 'completed' });
  });

  it('resolves relative /api/files uris against the cloud API base (Bearer-authed route)', () => {
    const artifacts = generatedFileArtifactsFromWire(
      [
        {
          id: 'asset-2',
          file_name: 'data.csv',
          mime_type: 'text/csv',
          uri: '/api/files/asset-2',
          byte_count: 128,
          kind: 'csv',
        },
      ],
      T,
    );
    expect(artifacts[0]!.generatedFile?.uri).toBe(`${API_URL}/api/files/asset-2`);
  });

  it('maps image kind to an image artifact and unknown kinds to other', () => {
    const artifacts = generatedFileArtifactsFromWire(
      [
        {
          id: 'a',
          file_name: 'chart.png',
          mime_type: 'image/png',
          uri: 'u',
          byte_count: 1,
          kind: 'image',
        },
        {
          id: 'b',
          file_name: 'x.bin',
          mime_type: 'application/octet-stream',
          uri: 'u',
          byte_count: 1,
          kind: 'mystery-kind',
        },
      ],
      T,
    );
    expect(artifacts[0]!.type).toBe('image');
    expect(artifacts[1]!.generatedFile?.kind).toBe('other');
  });

  it('prefers the downloadable CSV filename over a duplicate raw fenced-data card', () => {
    const generated = generatedFileArtifactsFromWire(
      [
        {
          id: 'csv-file',
          file_name: 'sales-report.csv',
          mime_type: 'text/csv',
          uri: '/api/files/csv-file',
          byte_count: 128,
          kind: 'csv',
        },
      ],
      T,
    );

    const merged = mergeDerivedAndGeneratedFileArtifacts(
      [
        {
          id: 'derived-csv',
          type: 'code',
          title: 'Date,Product,Units,Price,Total Sales',
          content: 'Date,Product,Units,Price,Total Sales',
          language: 'csv',
        },
        {
          id: 'derived-python',
          type: 'code',
          title: 'Analysis script',
          content: 'print("done")',
          language: 'python',
        },
      ],
      generated,
    );

    expect(merged.map((artifact) => artifact.title)).toEqual([
      'Analysis script',
      'sales-report.csv',
    ]);
  });
});

describe('citationsFromToolCalls', () => {
  const search = (results: Array<{ url: string; title: string; snippet?: string }>): ToolCall => ({
    id: 't1',
    name: 'web_search',
    status: 'completed',
    searchResults: results,
  });

  it('flattens search results into citations, deduped by url', () => {
    const citations = citationsFromToolCalls([
      search([
        { url: 'https://a.com', title: 'A' },
        { url: 'https://b.com', title: 'B', snippet: 'about b' },
        { url: 'https://a.com', title: 'A again' },
      ]),
    ]);
    expect(citations).toEqual([
      { url: 'https://a.com', title: 'A' },
      { url: 'https://b.com', title: 'B', snippet: 'about b' },
    ]);
  });

  it('caps at 8 citations across tools', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      url: `https://site${i}.com`,
      title: `S${i}`,
    }));
    expect(citationsFromToolCalls([search(many)])).toHaveLength(8);
  });

  it('returns [] for tools without search results (code execution, MCP)', () => {
    expect(
      citationsFromToolCalls([{ id: 'c', name: 'code_execution', status: 'completed' }]),
    ).toEqual([]);
  });
});
