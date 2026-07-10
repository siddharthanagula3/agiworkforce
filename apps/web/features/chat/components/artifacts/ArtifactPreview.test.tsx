import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ArtifactPreview, type ArtifactData } from './ArtifactPreview';

// The renderable-artifact path drags in the cross-origin sandbox iframe; these
// tests only exercise the PDF (document) path, which never mounts it. No mock
// needed — a `document`/`pdf` artifact has canPreview === false.

function pdfArtifact(overrides: Partial<ArtifactData> = {}): ArtifactData {
  return {
    id: 'pdf-1',
    type: 'document',
    language: 'pdf',
    title: 'Trip.pdf',
    content: '',
    ...overrides,
  };
}

/** Stub fetch(blobUrl) → a Blob with the given MIME (for blob verification). */
function mockBlobFetch(type: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ blob: async () => new Blob(['%PDF-1.4'], { type }) })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ArtifactPreview · PDF viewer', () => {
  it('renders the inline PDF iframe for a data:application/pdf source', () => {
    render(
      <ArtifactPreview
        artifact={pdfArtifact({ content: 'data:application/pdf;base64,JVBERi0=' })}
      />,
    );
    const iframe = screen.getByTitle('Trip.pdf') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('data:application/pdf;base64,JVBERi0=');
    // The native PDF viewer is blocked in a sandboxed frame — assert it is not sandboxed.
    expect(iframe.getAttribute('sandbox')).toBeNull();
    expect(screen.queryByTestId('artifact-pdf-fallback')).toBeNull();
  });

  it('renders a blob: source only after verifying its MIME is application/pdf', async () => {
    mockBlobFetch('application/pdf');
    render(<ArtifactPreview artifact={pdfArtifact({ content: 'blob:https://app.local/ok' })} />);
    const iframe = (await screen.findByTitle('Trip.pdf')) as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('blob:https://app.local/ok');
  });

  it('rejects a blob: source whose bytes are NOT a PDF (no HTML-blob XSS)', async () => {
    mockBlobFetch('text/html');
    render(<ArtifactPreview artifact={pdfArtifact({ content: 'blob:https://app.local/evil' })} />);
    await waitFor(() => expect(screen.getByTestId('artifact-pdf-fallback')).toBeTruthy());
    expect(screen.queryByTitle('Trip.pdf')).toBeNull();
  });

  it('shows an honest fallback (no fake preview) when content is model text, not PDF bytes', () => {
    // Generated-document case: artifact.content is the model's markdown, which
    // must NOT be piped into <iframe src> as if it were a PDF.
    render(
      <ArtifactPreview
        artifact={pdfArtifact({ content: '# Trip plan\n\nOption A — The Grand Tour...' })}
      />,
    );
    expect(screen.getByTestId('artifact-pdf-fallback')).toBeTruthy();
    expect(screen.getByText('Inline preview unavailable')).toBeTruthy();
    expect(screen.queryByTitle('Trip.pdf')).toBeNull();
  });

  it('does not accept an off-origin https URL as a PDF source (no SSRF vector)', () => {
    render(
      <ArtifactPreview artifact={pdfArtifact({ content: 'https://evil.example.com/leak.pdf' })} />,
    );
    // Off-origin https is rejected → fallback, never an iframe pointing off-origin.
    expect(screen.getByTestId('artifact-pdf-fallback')).toBeTruthy();
    expect(screen.queryByTitle('Trip.pdf')).toBeNull();
  });
});
