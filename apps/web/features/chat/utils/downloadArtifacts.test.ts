import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createArtifactsZip,
  downloadGeneratedFile,
  type DownloadableArtifact,
} from './downloadArtifacts';

function generatedArtifact(overrides: Partial<DownloadableArtifact> = {}): DownloadableArtifact {
  return {
    title: 'Quarterly report.pdf',
    content: '',
    language: 'pdf',
    type: 'document',
    generatedFile: {
      uri: '/api/files/11111111-2222-4333-8444-555555555555',
      fileName: 'Quarterly report.pdf',
      mimeType: 'application/pdf',
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('artifact downloads', () => {
  it('stores persisted generated-file bytes in the ZIP while preserving text artifacts', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => pdfBytes.buffer,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const archiveBytes = await createArtifactsZip([
      generatedArtifact(),
      {
        title: 'notes',
        content: '# Findings\n\nEverything is durable.',
        language: 'md',
        type: 'document',
      },
    ]);
    const archive = await JSZip.loadAsync(archiveBytes);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/files/11111111-2222-4333-8444-555555555555',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    expect(Object.keys(archive.files).sort()).toEqual(['Quarterly report.pdf', 'notes.md']);
    expect(await archive.file('Quarterly report.pdf')!.async('uint8array')).toEqual(pdfBytes);
    expect(await archive.file('notes.md')!.async('string')).toBe(
      '# Findings\n\nEverything is durable.',
    );
  });

  it('does not append a duplicate extension and disambiguates duplicate filenames', async () => {
    const archiveBytes = await createArtifactsZip([
      { title: 'report.csv', content: 'a,b\n1,2', language: 'csv' },
      { title: 'report.csv', content: 'a,b\n3,4', language: 'csv' },
    ]);
    const archive = await JSZip.loadAsync(archiveBytes);

    expect(Object.keys(archive.files).sort()).toEqual(['report (2).csv', 'report.csv']);
  });

  it('fails honestly when persisted generated-file bytes cannot be retrieved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) })),
    );

    await expect(createArtifactsZip([generatedArtifact()])).rejects.toThrow(
      'Could not download Quarterly report.pdf (HTTP 403)',
    );
  });

  it('downloads a relative authenticated generated-file URI as bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.buffer,
      blob: async () => new Blob([bytes], { type: 'application/octet-stream' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const createObjectURL = vi.fn(() => 'blob:https://app.local/generated');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await downloadGeneratedFile('/api/files/11111111-2222-4333-8444-555555555555', 'report.pdf');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/files/11111111-2222-4333-8444-555555555555',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });
});
