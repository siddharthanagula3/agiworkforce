import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { ProjectKnowledgeFile } from '@agiworkforce/types';
import { KnowledgeFilesPanel } from './KnowledgeFilesPanel';

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf-token') }));
vi.mock('./FilePreviewModal', () => ({
  FilePreviewModal: ({ file }: { file: ProjectKnowledgeFile | null }) =>
    file ? <div data-testid="preview-open">{file.fileName}</div> : null,
}));

const FILE: ProjectKnowledgeFile = {
  id: 'file-1',
  projectId: 'project-1',
  fileName: 'notes.txt',
  mimeType: 'text/plain',
  byteCount: 2048,
  checksumSha256: 'abc',
  sourceSurface: 'web',
} as ProjectKnowledgeFile;

function stubFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (init?.method === 'DELETE') {
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }
    if (url.includes('/knowledge-files')) {
      return { ok: true, json: async () => ({ files: [FILE] }) } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('KnowledgeFilesPanel delete', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes a knowledge file via the DELETE endpoint and drops it from the list', async () => {
    const fetchMock = stubFetch();
    render(<KnowledgeFilesPanel projectId="project-1" />);

    const del = await screen.findByTestId('knowledge-files-delete');
    expect(screen.getByText('notes.txt')).toBeTruthy();

    fireEvent.click(del);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove file' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/project-1/knowledge-files/file-1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    await waitFor(() => expect(screen.queryByText('notes.txt')).toBeNull());
  });

  it('does not open the file preview when the remove button is activated by keyboard', async () => {
    stubFetch();
    render(<KnowledgeFilesPanel projectId="project-1" />);

    const del = await screen.findByTestId('knowledge-files-delete');
    fireEvent.keyDown(del, { key: 'Enter' });

    expect(screen.queryByTestId('preview-open')).toBeNull();
  });
});
