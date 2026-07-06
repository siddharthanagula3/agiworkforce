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
import type { ToolCall } from '../types/chat';

const T = '2026-07-06T00:00:00.000Z';

describe('generatedFileArtifactsFromWire', () => {
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
      privacyMode: 'managed',
      createdAt: T,
    });
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
