import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => headers),
  getCsrfToken: vi.fn(async () => 'csrf-token'),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../FilePreviewModal', () => ({ FilePreviewModal: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const service = vi.hoisted(() => ({
  list: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  upload: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
}));

vi.mock('../../services/project-knowledge-upload', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listProjectKnowledgeFiles: (...args: unknown[]) => service.list(...args),
  removeProjectKnowledgeFile: vi.fn(),
  uploadProjectKnowledgeFile: (...args: unknown[]) => service.upload(...args),
}));

vi.mock('@features/chat/components/artifacts/ArtifactDocumentEditor', () => ({
  ArtifactDocumentEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea aria-label="Notes text" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { SourcesPanel } from '../SourcesPanel';
import { ProjectNotes } from '../ProjectNotes';
import { ProjectStudio } from '../ProjectStudio';

function file(id: string, fileName: string, summary?: string) {
  return {
    id,
    projectId: 'project-1',
    fileName,
    mimeType: 'text/plain',
    byteCount: 1024,
    checksumSha256: 'a'.repeat(64),
    sourceSurface: 'web',
    addedAt: '2026-01-01T00:00:00.000Z',
    storageUri: `/api/projects/project-1/knowledge-files/${id}`,
    ...(summary ? { summary } : {}),
  };
}

const DRIVE_ID = '66666666-6666-4666-8666-666666666666';

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('notebook sources', () => {
  it('searches sources by name or summary', async () => {
    service.list.mockResolvedValue([
      file('a', 'Q3 board memo.txt', 'Revenue and hiring plan'),
      file('b', 'Interview notes.txt', 'Customer pains'),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ origins: [] }))),
    );
    render(<SourcesPanel projectId="project-1" readOnly={false} />);
    const search = await screen.findByTestId('sources-search');
    fireEvent.change(search, { target: { value: 'hiring' } });
    const list = screen.getByTestId('sources-file-list');
    expect(within(list).getByText('Q3 board memo.txt')).toBeInTheDocument();
    expect(within(list).queryByText('Interview notes.txt')).toBeNull();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('No sources match “zzz”.')).toBeInTheDocument();
  });

  it('refreshes a source added from Google Drive and only offers it there', async () => {
    service.list.mockResolvedValue([file(DRIVE_ID, 'Roadmap.docx'), file('local', 'local.txt')]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/origins')) {
        return new Response(JSON.stringify({ origins: [{ fileId: DRIVE_ID, refreshable: true }] }));
      }
      return new Response(JSON.stringify({ status: 'refreshed' }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SourcesPanel projectId="project-1" readOnly={false} />);
    const refresh = await screen.findByRole('button', {
      name: 'Refresh Roadmap.docx from Google Drive',
    });
    expect(screen.getAllByTestId('sources-refresh')).toHaveLength(1);
    fireEvent.click(refresh);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/projects/project-1/knowledge-files/${DRIVE_ID}/refresh`,
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('keeps notes beside the sources and saves them as the Notes source', async () => {
    service.list.mockResolvedValue([file('n', 'Notes.md')]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('# Ideas\n\nFirst idea')),
    );
    const onSaved = vi.fn();
    render(<ProjectNotes projectId="project-1" readOnly={false} onSaved={onSaved} />);
    fireEvent.click(screen.getByTestId('project-notes-toggle'));
    const editor = await screen.findByLabelText('Notes text');
    expect(editor).toHaveValue('# Ideas\n\nFirst idea');
    fireEvent.change(editor, { target: { value: '# Ideas\n\nSecond idea' } });
    fireEvent.click(screen.getByTestId('project-notes-save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const uploaded = (service.upload.mock.calls[0]![0] as { file: File }).file;
    expect(uploaded.name).toBe('Notes.md');
    expect(await uploaded.text()).toBe('# Ideas\n\nSecond idea');
  });

  it('offers one-click quiz, flashcards, learning overview and infographic outputs', () => {
    const onCreate = vi.fn();
    render(<ProjectStudio onCreate={onCreate} />);
    fireEvent.click(screen.getByTestId('project-studio-quiz'));
    expect(onCreate.mock.calls[0]![0].prompt).toContain('~~~quiz');
    fireEvent.click(screen.getByTestId('project-studio-flashcards'));
    expect(onCreate.mock.calls[1]![0].prompt).toContain('~~~flashcards');
    fireEvent.click(screen.getByTestId('project-studio-learning-overview'));
    expect(onCreate.mock.calls[2]![0].prompt).toContain('worked example');
    fireEvent.click(screen.getByTestId('project-studio-infographic'));
    expect(onCreate.mock.calls[3]![0].prompt).toContain(
      '```html fenced block whose first line is <!-- @artifact -->',
    );
    for (const call of onCreate.mock.calls) {
      expect((call[0] as { prompt: string }).prompt).toContain("Use only this project's sources");
    }
  });
});
