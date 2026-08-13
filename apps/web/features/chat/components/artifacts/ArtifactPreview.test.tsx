import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SharedArtifact } from '@agiworkforce/types';
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

function imageArtifact(overrides: Partial<ArtifactData> = {}): ArtifactData {
  return {
    id: 'image-1',
    type: 'image',
    language: 'png',
    title: 'Launch visual',
    content: '/api/files/generated-image',
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

  it('ACCEPTS a same-origin relative /api/files/{id} uri when the generated file is a PDF', () => {
    // The generated-file byte pipeline serves persisted bytes from the
    // authenticated same-origin route — this is the url shape it emits.
    render(
      <ArtifactPreview
        artifact={pdfArtifact({
          content: '',
          generatedFile: {
            id: 'gf-1',
            computeSessionId: 'cs-1',
            ownerUserId: 'u1',
            sourceSurface: 'web',
            privacyMode: 'managed',
            providerMode: 'ManagedGateway',
            kind: 'pdf',
            fileName: 'Trip.pdf',
            mimeType: 'application/pdf',
            uri: '/api/files/11111111-2222-4333-8444-555555555555',
            byteCount: 2048,
            checksumSha256: 'a'.repeat(64),
            previewDerivatives: [],
            createdAt: '2026-07-10T00:00:00Z',
          },
        })}
      />,
    );
    const iframe = screen.getByTitle('Trip.pdf') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe(
      '/api/files/11111111-2222-4333-8444-555555555555?preview=pdf',
    );
    expect(screen.queryByTestId('artifact-pdf-fallback')).toBeNull();
  });

  it('downloads a generated PDF from its authenticated byte route', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.buffer,
    }));
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn(() => 'blob:https://app.local/generated-pdf');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <ArtifactPreview
        variant="panel"
        artifact={pdfArtifact({
          generatedFile: {
            id: 'gf-download',
            computeSessionId: 'cs-1',
            ownerUserId: 'u1',
            sourceSurface: 'web',
            privacyMode: 'managed',
            providerMode: 'ManagedGateway',
            kind: 'pdf',
            fileName: 'Trip.pdf',
            mimeType: 'application/pdf',
            uri: '/api/files/11111111-2222-4333-8444-555555555555',
            byteCount: bytes.byteLength,
            checksumSha256: 'c'.repeat(64),
            previewDerivatives: [],
            createdAt: '2026-07-10T00:00:00Z',
          },
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download file' }));

    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/files/11111111-2222-4333-8444-555555555555',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    expect(createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ size: bytes.byteLength, type: 'application/pdf' }),
    );
  });

  it('shows the generated artifact version even before any edits exist', () => {
    const artifact = pdfArtifact();
    const initialVersion: SharedArtifact = {
      id: artifact.id,
      type: 'document',
      language: 'pdf',
      title: 'Trip.pdf',
      content: artifact.content,
      version: 1,
      createdAt: '2026-07-25T00:00:00.000Z',
    };

    render(
      <ArtifactPreview variant="panel" artifact={artifact} versionHistory={[initialVersion]} />,
    );

    expect(screen.getByTestId('artifact-version-chip')).toHaveTextContent('v1/1');
    expect(screen.getByRole('button', { name: 'Previous version' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next version' })).toBeDisabled();
  });

  it('REJECTS a cross-origin storage url on a generated file (fallback, no off-origin iframe)', () => {
    render(
      <ArtifactPreview
        artifact={pdfArtifact({
          content: '',
          generatedFile: {
            id: 'gf-2',
            computeSessionId: 'cs-1',
            ownerUserId: 'u1',
            sourceSurface: 'web',
            privacyMode: 'managed',
            providerMode: 'ManagedGateway',
            kind: 'pdf',
            fileName: 'Trip.pdf',
            mimeType: 'application/pdf',
            uri: 'https://r2.example.com/media/file/u1/x.pdf',
            byteCount: 2048,
            checksumSha256: 'b'.repeat(64),
            previewDerivatives: [],
            createdAt: '2026-07-10T00:00:00Z',
          },
        })}
      />,
    );
    expect(screen.getByTestId('artifact-pdf-fallback')).toBeTruthy();
    expect(screen.queryByTitle('Trip.pdf')).toBeNull();
  });
});

describe('ArtifactPreview · generated image viewer', () => {
  it('navigates persisted artifact revisions in both directions', () => {
    const artifact = imageArtifact({ content: '/api/files/image-v2' });
    const versionHistory: SharedArtifact[] = [
      {
        id: artifact.id,
        type: 'image',
        language: 'png',
        title: 'Launch visual',
        content: '/api/files/image-v1',
        version: 1,
        createdAt: '2026-07-25T00:00:00.000Z',
      },
      {
        id: artifact.id,
        type: 'image',
        language: 'png',
        title: 'Launch visual',
        content: '/api/files/image-v2',
        version: 2,
        createdAt: '2026-07-25T00:01:00.000Z',
      },
    ];

    render(<ArtifactPreview variant="panel" artifact={artifact} versionHistory={versionHistory} />);

    expect(screen.getByTestId('artifact-version-chip')).toHaveTextContent('v2/2');
    expect(screen.getByRole('img', { name: 'Launch visual' })).toHaveAttribute(
      'src',
      '/api/files/image-v2',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Previous version' }));
    expect(screen.getByTestId('artifact-version-chip')).toHaveTextContent('v1/2');
    expect(screen.getByRole('img', { name: 'Launch visual' })).toHaveAttribute(
      'src',
      '/api/files/image-v1',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next version' }));
    expect(screen.getByTestId('artifact-version-chip')).toHaveTextContent('v2/2');
    expect(screen.getByRole('img', { name: 'Launch visual' })).toHaveAttribute(
      'src',
      '/api/files/image-v2',
    );
  });

  it('renders the generated image as the panel preview with a direct download action', () => {
    render(<ArtifactPreview variant="panel" artifact={imageArtifact()} />);

    const image = screen.getByRole('img', { name: 'Launch visual' }) as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('/api/files/generated-image');
    expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(screen.getByRole('button', { name: 'Download image' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy artifact' })).toBeNull();
  });

  it('rejects a non-image executable URL instead of handing it to the browser', () => {
    render(
      <ArtifactPreview
        variant="panel"
        artifact={imageArtifact({ content: 'javascript:alert(document.domain)' })}
      />,
    );

    expect(screen.queryByRole('img', { name: 'Launch visual' })).toBeNull();
    expect(screen.getByText('Image preview unavailable')).toBeInTheDocument();
  });
});

describe('ArtifactPreview · Markdown documents', () => {
  function markdownArtifact(overrides: Partial<ArtifactData> = {}): ArtifactData {
    return {
      id: 'md-1',
      type: 'document',
      language: 'md',
      title: 'ExecutionPlan.md',
      content: '# ExecutionPlan\n\nStatus: Current\n',
      ...overrides,
    };
  }

  it('renders the markdown instead of its source', () => {
    render(<ArtifactPreview variant="panel" artifact={markdownArtifact()} />);

    expect(screen.getByTestId('artifact-markdown-preview')).toBeInTheDocument();
    // The heading is a real <h1>, not the literal "# ExecutionPlan" the panel
    // used to print because `document` had no preview branch at all.
    expect(screen.getByRole('heading', { name: 'ExecutionPlan' })).toBeInTheDocument();
  });

  it('still offers the source view behind the toggle', () => {
    render(<ArtifactPreview variant="panel" artifact={markdownArtifact()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    expect(screen.queryByTestId('artifact-markdown-preview')).toBeNull();
  });

  it('leaves PDF and DOCX documents on their own viewers', () => {
    const { rerender } = render(
      <ArtifactPreview
        variant="panel"
        artifact={pdfArtifact({ content: 'data:application/pdf;base64,JVBERi0=' })}
      />,
    );
    expect(screen.queryByTestId('artifact-markdown-preview')).toBeNull();

    rerender(
      <ArtifactPreview
        variant="panel"
        artifact={markdownArtifact({
          id: 'docx-1',
          language: 'docx',
          title: 'Brief.docx',
          // This assertion is about renderer selection, not Mammoth's ZIP
          // parser. Do not feed the Markdown fixture bytes to the DOCX path.
          content: '',
        })}
      />,
    );
    expect(screen.queryByTestId('artifact-markdown-preview')).toBeNull();
  });
});
