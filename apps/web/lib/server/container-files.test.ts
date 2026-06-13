import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { persistGeneratedFile, persistGeneratedFiles } from './container-files';

function fetchOk(body = 'bytes', contentType = 'application/pdf') {
  return {
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => Buffer.from(body),
  };
}

describe('persistGeneratedFile', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    configured = true;
    storeMedia.mockReset();
    insertMediaAsset.mockReset();
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);
    process.env['OPENAI_API_KEY'] = 'sk-test';
    process.env['ANTHROPIC_API_KEY'] = 'ak-test';
    storeMedia.mockResolvedValue({
      url: 'https://blob.example/media/file/u/x.pdf',
      pathname: 'media/file/u/x.pdf',
      byteSize: 5,
      contentType: 'application/pdf',
    });
    insertMediaAsset.mockResolvedValue('asset_1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches an OpenAI container file, persists it, and classifies a pdf as kind "file"', async () => {
    fetchSpy.mockResolvedValueOnce(fetchOk('pdf-bytes', 'application/pdf'));
    const result = await persistGeneratedFile({
      userId: 'user_1',
      ref: { provider: 'openai', filename: 'report.pdf', containerId: 'cntr_1', fileId: 'file_1' },
      model: 'gpt-5.4-mini',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.openai.com/v1/containers/cntr_1/files/file_1/content',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      }),
    );
    expect(storeMedia).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user_1', kind: 'file', contentType: 'application/pdf' }),
    );
    expect(insertMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'file', mimeType: 'application/pdf', provider: 'openai' }),
    );
    expect(result).toMatchObject({
      assetId: 'asset_1',
      url: 'https://blob.example/media/file/u/x.pdf',
      filename: 'report.pdf',
    });
  });

  it('fetches an Anthropic file via the Files API with the beta header', async () => {
    fetchSpy.mockResolvedValueOnce(fetchOk('csv', 'text/csv'));
    await persistGeneratedFile({
      userId: 'u',
      ref: { provider: 'anthropic', filename: 'data.csv', fileId: 'file_a' },
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/files/file_a/content',
      expect.objectContaining({
        headers: expect.objectContaining({ 'anthropic-beta': 'files-api-2025-04-14' }),
      }),
    );
    expect(insertMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'text/csv' }),
    );
  });

  it('returns null when storage is not configured (best-effort)', async () => {
    configured = false;
    const result = await persistGeneratedFile({
      userId: 'u',
      ref: { provider: 'openai', filename: 'x.pdf', containerId: 'c', fileId: 'f' },
    });
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null (does not throw) when the provider fetch fails', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500, headers: { get: () => null } });
    const result = await persistGeneratedFile({
      userId: 'u',
      ref: { provider: 'openai', filename: 'x.pdf', containerId: 'c', fileId: 'f' },
    });
    expect(result).toBeNull();
    expect(insertMediaAsset).not.toHaveBeenCalled();
  });

  it('returns null for a ref without a fileId', async () => {
    const result = await persistGeneratedFile({
      userId: 'u',
      ref: { provider: 'openai', filename: 'x.pdf', containerId: 'c' },
    });
    expect(result).toBeNull();
  });
});

describe('persistGeneratedFiles', () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    configured = true;
    storeMedia.mockReset().mockResolvedValue({
      url: 'https://blob.example/f.pdf',
      pathname: 'p',
      byteSize: 1,
      contentType: 'application/pdf',
    });
    insertMediaAsset.mockReset().mockResolvedValue('a');
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);
    process.env['OPENAI_API_KEY'] = 'sk-test';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('persists the successes and drops the failures', async () => {
    fetchSpy
      .mockResolvedValueOnce(fetchOk('ok', 'application/pdf'))
      .mockResolvedValueOnce({ ok: false, status: 404, headers: { get: () => null } });
    const out = await persistGeneratedFiles({
      userId: 'u',
      refs: [
        { provider: 'openai', filename: 'a.pdf', containerId: 'c', fileId: 'f1' },
        { provider: 'openai', filename: 'b.pdf', containerId: 'c', fileId: 'f2' },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.filename).toBe('a.pdf');
  });
});
