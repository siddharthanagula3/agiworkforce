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
  classifyGeneratedFile,
  MAX_GENERATED_FILE_BYTES,
} from './generated-file-persist';

describe('persistGeneratedFileBytes', () => {
  const organizationId = '11111111-1111-4111-8111-111111111111';

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
      organizationId,
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
      surface: 'file',
      previewable: true,
    });
    expect(insertMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        organizationId,
        provider: 'e2b',
        metadata: expect.objectContaining({
          filename: 'table.csv',
          origin: 'e2b-execution',
          checksumSha256: expectedHash,
          // Classification persisted for library filtering (Wave D).
          surface: 'file',
          previewable: true,
        }),
      }),
    );
  });

  it('keeps admitted organization provenance across an async storage completion', async () => {
    const admittedOrganizationId = '11111111-1111-4111-8111-111111111111';
    const laterOrganizationId = '22222222-2222-4222-8222-222222222222';
    let finishStorage!: (value: {
      url: string;
      pathname: string;
      byteSize: number;
      contentType: string;
    }) => void;
    storeMedia.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishStorage = resolve;
        }),
    );
    const params = {
      userId: 'user_1',
      organizationId: admittedOrganizationId,
      data: Buffer.from('async result'),
      mimeType: 'text/plain',
      filename: 'result.txt',
      provider: 'e2b',
      origin: 'e2b-execution',
    };

    const completion = persistGeneratedFileBytes(params);
    expect(storeMedia).toHaveBeenCalledOnce();
    params.organizationId = laterOrganizationId;
    finishStorage({
      url: 'https://media.example.com/media/file/u/result.txt',
      pathname: 'media/file/u/result.txt',
      byteSize: params.data.byteLength,
      contentType: params.mimeType,
    });
    await expect(completion).resolves.toMatchObject({ ok: true });

    expect(insertMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: admittedOrganizationId }),
    );
  });

  it('classifies artifact outputs on both the wire and the catalog metadata', async () => {
    const outcome = await persistGeneratedFileBytes({
      userId: 'user_1',
      organizationId: null,
      data: Buffer.from('<html><body>hi</body></html>', 'utf8'),
      mimeType: 'text/html',
      filename: 'page.html',
      provider: 'e2b',
      origin: 'e2b-execution',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.file.surface).toBe('artifact');
    expect(outcome.file.previewable).toBe(true);
    expect(insertMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ surface: 'artifact', previewable: true }),
      }),
    );
  });

  it('falls back to the storage URL when the catalog row cannot be written', async () => {
    insertMediaAsset.mockResolvedValue(null);
    const outcome = await persistGeneratedFileBytes({
      userId: 'u',
      organizationId: null,
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
      organizationId: null,
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
      organizationId: null,
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
      organizationId: null,
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

describe('classifyGeneratedFile', () => {
  it('classifies renderable/editable source text as artifact (always previewable)', () => {
    for (const [name, mime] of [
      ['page.html', 'text/html'],
      ['diagram.svg', 'image/svg+xml'],
      ['notes.md', 'text/markdown'],
      ['flow.mmd', 'text/plain'],
      ['flow.mermaid', 'text/plain'],
      ['data.json', 'application/json'],
      ['script.py', 'text/x-python'],
      ['app.tsx', 'application/octet-stream'],
      ['readme.txt', 'text/plain'],
      ['config.yaml', 'application/yaml'],
    ] as const) {
      expect(classifyGeneratedFile(name, mime)).toEqual({
        surface: 'artifact',
        previewable: true,
      });
    }
  });

  it('classifies download deliverables with inline renderers as previewable files', () => {
    for (const [name, mime] of [
      ['report.pdf', 'application/pdf'],
      ['doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      ['deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      ['table.csv', 'text/csv'],
    ] as const) {
      expect(classifyGeneratedFile(name, mime)).toEqual({ surface: 'file', previewable: true });
    }
  });

  it('classifies raster images/charts as previewable files, not artifacts (ChatGPT/Claude parity)', () => {
    expect(classifyGeneratedFile('chart.png', 'image/png')).toEqual({
      surface: 'file',
      previewable: true,
    });
    expect(classifyGeneratedFile('photo.jpg', 'image/jpeg')).toEqual({
      surface: 'file',
      previewable: true,
    });
  });

  it('classifies svg as artifact even though its mime is image/*', () => {
    expect(classifyGeneratedFile('logo.svg', 'image/svg+xml').surface).toBe('artifact');
    expect(classifyGeneratedFile('noext-svg', 'image/svg+xml').surface).toBe('artifact');
  });

  it('classifies archives and unknown binaries as non-previewable files', () => {
    expect(classifyGeneratedFile('bundle.zip', 'application/zip')).toEqual({
      surface: 'file',
      previewable: false,
    });
    expect(classifyGeneratedFile('mystery.bin', 'application/octet-stream')).toEqual({
      surface: 'file',
      previewable: false,
    });
  });

  it('falls back to mime for extension-less names (csv beats generic text)', () => {
    expect(classifyGeneratedFile('output', 'text/csv')).toEqual({
      surface: 'file',
      previewable: true,
    });
    expect(classifyGeneratedFile('output', 'text/plain').surface).toBe('artifact');
    expect(classifyGeneratedFile('output', 'application/pdf')).toEqual({
      surface: 'file',
      previewable: true,
    });
  });
});
