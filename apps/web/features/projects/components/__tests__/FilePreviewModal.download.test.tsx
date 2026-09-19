import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import type { ProjectKnowledgeFile } from '@agiworkforce/types';
import { FilePreviewModal } from '../FilePreviewModal';

vi.mock('@agiworkforce/unified-chat', () => ({ MarkdownContent: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const file: ProjectKnowledgeFile = {
  id: 'source-1',
  projectId: 'project-1',
  fileName: 'source.bin',
  mimeType: 'application/octet-stream',
  byteCount: 3,
  checksumSha256: 'a'.repeat(64),
  sourceSurface: 'web',
  addedByUserId: null,
  addedAt: '2026-09-19T00:00:00Z',
  storageUri: '/api/projects/project-1/knowledge-files/source-1',
};

const fetchMock = vi.fn();
const createObjectURL = vi.fn(() => 'blob:source');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = createObjectURL;
      static override revokeObjectURL = revokeObjectURL;
    },
  );
  vi.spyOn(window, 'open').mockImplementation(() => null);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('project source download', () => {
  it.each([403, 500])('does not save an HTTP %s error as the source file', async (status) => {
    const blob = vi.fn(async () => new Blob(['error']));
    fetchMock.mockResolvedValue({ ok: false, status, blob });
    render(<FilePreviewModal file={file} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Download source.bin' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(blob).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('reports a network failure and allows a successful retry', async () => {
    const content = new Blob(['abc']);
    fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable'));
    fetchMock.mockResolvedValueOnce({ ok: true, blob: async () => content });
    render(<FilePreviewModal file={file} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Download source.bin' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(window.open).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Download source.bin' }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(content));
    const anchor = vi.mocked(HTMLAnchorElement.prototype.click).mock.instances[0];
    if (!(anchor instanceof HTMLAnchorElement)) throw new Error('Download anchor was not clicked');
    expect(anchor.download).toBe(file.fileName);
    expect(anchor.href).toBe('blob:source');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:source');
  });
});
