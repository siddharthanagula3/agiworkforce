import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ProjectKnowledgeFile } from '@agiworkforce/types';
import { FilePreviewModal } from '../FilePreviewModal';

const file: ProjectKnowledgeFile = {
  id: 'deck-1',
  projectId: 'project-1',
  fileName: 'Quarterly review.pptx',
  mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  byteCount: 2048,
  checksumSha256: 'b'.repeat(64),
  sourceSurface: 'web',
  addedByUserId: null,
  addedAt: '2026-10-19T00:00:00Z',
  storageUri: '/api/projects/project-1/knowledge-files/deck-1',
  textPreview: true,
};

async function deckBytes(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const slide = (title: string) =>
    `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  zip.file('ppt/slides/slide1.xml', slide('Q3 results'));
  zip.file('ppt/slides/slide2.xml', slide('Next quarter'));
  return zip.generateAsync({ type: 'arraybuffer' });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FilePreviewModal · PowerPoint', () => {
  it('previews a pptx source as slides instead of its extracted text', async () => {
    const bytes = await deckBytes();
    const fetchMock = vi.fn(async () => new Response(bytes));
    vi.stubGlobal('fetch', fetchMock);

    render(<FilePreviewModal file={file} onClose={vi.fn()} />);

    const preview = await screen.findByTestId('pptx-file-preview');
    expect(within(screen.getByTestId('deck-thumbnails')).getAllByRole('button')).toHaveLength(2);
    expect(within(preview).getAllByText('Q3 results').length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(file.storageUri, expect.anything());
    expect(screen.queryByText('Preview is not available for this file type.')).toBeNull();
  });
});
