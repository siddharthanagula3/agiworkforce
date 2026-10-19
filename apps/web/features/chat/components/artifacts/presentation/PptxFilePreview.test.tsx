import JSZip from 'jszip';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PptxFilePreview, isPptxFile } from './PptxFilePreview';

async function pptx(): Promise<Blob> {
  const zip = new JSZip();
  const slide = (title: string, body: string) =>
    `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:txBody><a:p><a:r><a:t>${body}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  zip.file('ppt/slides/slide1.xml', slide('Kickoff', 'Goals'));
  zip.file('ppt/slides/slide2.xml', slide('Timeline', 'Six weeks'));
  return zip.generateAsync({ type: 'blob' });
}

describe('PptxFilePreview', () => {
  it('recognises PowerPoint files by type or name', () => {
    expect(isPptxFile('deck.PPTX', 'application/octet-stream')).toBe(true);
    expect(
      isPptxFile('x', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
    ).toBe(true);
    expect(isPptxFile('notes.pdf', 'application/pdf')).toBe(false);
  });

  it('shows each slide of a PowerPoint file read-only', async () => {
    render(<PptxFilePreview source={await pptx()} fileName="Kickoff.pptx" />);
    const preview = await screen.findByTestId('pptx-file-preview');
    expect(within(preview).getAllByText('Kickoff').length).toBeGreaterThan(0);
    expect(within(screen.getByTestId('deck-thumbnails')).getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByTestId('deck-edit-slide')).not.toBeInTheDocument();
  });

  it('says so when the file is not a presentation', async () => {
    render(<PptxFilePreview source={new Blob(['not a zip'])} fileName="bad.pptx" />);
    expect(
      await screen.findByText('This presentation could not be opened for preview.'),
    ).toBeInTheDocument();
  });
});
