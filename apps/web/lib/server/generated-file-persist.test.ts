import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';

const storeMedia = vi.fn();
const insertMediaAsset = vi.fn();
let configured = true;

vi.mock('@/lib/server/media-storage', () => ({
  isMediaStorageConfigured: () => configured,
  storeMedia: (...args: unknown[]) => storeMedia(...args),
}));
vi.mock('@/lib/server/media-assets', () => ({
  insertMediaAsset: (...args: unknown[]) => insertMediaAsset(...args),
}));

import {
  persistGeneratedFileBytes,
  generatedFileKind,
  MAX_GENERATED_FILE_BYTES,
} from './generated-file-persist';

describe('persistGeneratedFileBytes', () => {
  beforeEach(() => {
    configured = true;
    storeMedia.mockReset().mockImplementation(async (p: { data: Buffer }) => ({
      url: 'https://media.example.com/media/file/u/x.bin',
      pathname: 'media/file/u/x.bin',
      byteSize: p.data.byteLength,
      contentType: 'application/octet-stream',
    }));
    insertMediaAsset.mockReset().mockResolvedValue('asset_9');
  });

  it('persists bytes, catalogs them, and returns a same-origin wire uri + true sha256', async () => {
    const data = Buffer.from('col_a,col_b\n1,2\n3,4\n', 'utf8');
    const expectedHash = createHash('sha256').update(data).digest('hex');

    const outcome = await persistGeneratedFileBytes({
      userId: 'user_1',
      data,
      mimeType: 'text/csv',
      filename: 'table.csv',
      provider: 'e2b',
      origin: 'e2b-execution',
      model: 'test-model',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.file).toMatchObject({
      id: 'asset_9',
      file_name: 'table.csv',
      mime_type: 'text/csv',
      uri: '/api/files/asset_9',
      byte_count: data.byteLength,
      kind: 'csv',
      checksum_sha256: expectedHash,
    });
    expect(insertMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        provider: 'e2b',
        metadata: expect.objectContaining({
          filename: 'table.csv',
          origin: 'e2b-execution',
          checksumSha256: expectedHash,
        }),
      }),
    );
  });

  it('falls back to the storage URL when the catalog row cannot be written', async () => {
    insertMediaAsset.mockResolvedValue(null);
    const outcome = await persistGeneratedFileBytes({
      userId: 'u',
      data: Buffer.from('x'),
      mimeType: 'image/png',
      filename: 'chart.png',
      provider: 'e2b',
      origin: 'e2b-execution',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.file.uri).toBe('https://media.example.com/media/file/u/x.bin');
  });

  it('rejects oversized payloads with a typed reason (no storage call)', async () => {
    const outcome = await persistGeneratedFileBytes({
      userId: 'u',
      data: Buffer.alloc(MAX_GENERATED_FILE_BYTES + 1),
      mimeType: 'application/pdf',
      filename: 'huge.pdf',
      provider: 'openai',
      origin: 'code-execution',
    });
    expect(outcome).toEqual({ ok: false, reason: 'too_large' });
    expect(storeMedia).not.toHaveBeenCalled();
  });

  it('reports not_configured without touching storage', async () => {
    configured = false;
    const outcome = await persistGeneratedFileBytes({
      userId: 'u',
      data: Buffer.from('x'),
      mimeType: 'text/plain',
      filename: 'a.txt',
      provider: 'e2b',
      origin: 'e2b-execution',
    });
    expect(outcome).toEqual({ ok: false, reason: 'not_configured' });
    expect(storeMedia).not.toHaveBeenCalled();
  });

  it('reports storage_error when the upload throws (never rejects)', async () => {
    storeMedia.mockRejectedValue(new Error('r2 down'));
    const outcome = await persistGeneratedFileBytes({
      userId: 'u',
      data: Buffer.from('x'),
      mimeType: 'text/plain',
      filename: 'a.txt',
      provider: 'anthropic',
      origin: 'code-execution',
    });
    expect(outcome).toEqual({ ok: false, reason: 'storage_error' });
  });
});

describe('generatedFileKind', () => {
  it('classifies by extension first, then mime', () => {
    expect(generatedFileKind('report.pdf', 'application/pdf')).toBe('pdf');
    expect(generatedFileKind('data.csv', 'text/csv')).toBe('csv');
    expect(generatedFileKind('chart.png', 'image/png')).toBe('image');
    expect(generatedFileKind('notes.md', 'text/markdown')).toBe('markdown');
    expect(generatedFileKind('bundle.zip', 'application/zip')).toBe('archive');
    expect(generatedFileKind('mystery.bin', 'application/octet-stream')).toBe('other');
  });
});
