import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { summarizeGeneratedFileBundle, type GeneratedFile } from '@agiworkforce/types';
import { GeneratedFileCard } from '../GeneratedFileCard';

function libraryAsset(overrides: Partial<GeneratedFile> = {}): GeneratedFile {
  return {
    id: 'asset-1',
    computeSessionId: '',
    ownerUserId: '',
    sourceSurface: 'web',
    privacyMode: 'managed',
    providerMode: 'ManagedGateway',
    kind: 'other',
    fileName: 'clip.mp4',
    mimeType: 'video/mp4',
    uri: '/api/files/asset-1',
    byteCount: 2048,
    checksumSha256: '',
    previewDerivatives: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('GeneratedFileCard video thumbnails', () => {
  it('marks a video asset that has no thumbnail, which is how the Library grid renders it', () => {
    const presentation = summarizeGeneratedFileBundle({
      generatedFile: libraryAsset(),
      fallbackStatus: 'completed',
    });
    expect(presentation.previewUri).toBeUndefined();
    expect(presentation.kindLabel).toBe('File');

    render(<GeneratedFileCard presentation={{ ...presentation, canPreview: true }} />);

    expect(screen.getByTestId('generated-file-video-marker')).toBeDefined();
    expect(screen.getByLabelText('Video')).toBeDefined();
  });

  it('overlays the marker on a video poster instead of replacing it', () => {
    const presentation = summarizeGeneratedFileBundle({
      generatedFile: libraryAsset({
        previewDerivatives: [{ kind: 'thumbnail', uri: 'https://cdn.test/poster.jpg' }],
      }),
      fallbackStatus: 'completed',
    });

    render(<GeneratedFileCard presentation={presentation} />);

    const poster = screen.getByAltText(`${presentation.title} preview`) as HTMLImageElement;
    expect(poster.getAttribute('src')).toBe('https://cdn.test/poster.jpg');
    expect(screen.getByTestId('generated-file-video-marker')).toBeDefined();
  });

  it('leaves image thumbnails unmarked', () => {
    const presentation = summarizeGeneratedFileBundle({
      generatedFile: libraryAsset({
        kind: 'image',
        fileName: 'render.png',
        mimeType: 'image/png',
        previewDerivatives: [{ kind: 'thumbnail', uri: 'https://cdn.test/render.png' }],
      }),
      fallbackStatus: 'completed',
    });

    render(<GeneratedFileCard presentation={presentation} />);

    expect(screen.queryByTestId('generated-file-video-marker')).toBeNull();
  });
});
