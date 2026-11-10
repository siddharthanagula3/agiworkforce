import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/features/projects');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: 'project-1' }),
}));

vi.mock('@shared/components/layout/WebAppShell', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule3>()),
  WebAppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/features/projects', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    useManagedCloudProjects: () => ({
      accountId: 'user-1',
      projects: [
        {
          id: 'project-1',
          name: 'Marketing launch',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      status: 'ready' as const,
      error: null,
      isReady: true,
      retry: vi.fn(),
    }),
  };
});

vi.mock('@/lib/hooks/useConversations', async (importOriginal) => ({
  ...(await importOriginal()),
  useProjectConversations: () => ({
    conversations: [],
    isLoading: false,
    error: null,
    hasMore: false,
    isLoadingMore: false,
    retry: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

vi.mock('@/features/chat/components/Composer/ChatComposerNew', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  ChatComposerNew: () => <div data-testid="project-composer-stub" />,
}));

vi.mock('@/features/schedules', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  SchedulesPage: () => <div data-testid="project-schedules-section" />,
  SchedulesEntitlementLoading: () => <div aria-label="Loading schedule access" role="status" />,
}));

vi.mock('@/features/projects/components/SourcesPanel', () => ({
  SourcesPanel: () => <div data-testid="sources-panel" />,
}));

vi.mock('@/features/projects/services/project-knowledge-upload', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  listProjectKnowledgeFiles: async () => [],
  uploadProjectKnowledgeFile: async () => undefined,
}));

vi.mock('@features/chat/components/artifacts/ArtifactDocumentEditor', () => ({
  ArtifactDocumentEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Notes text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

import ProjectDetailPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
});

async function typeUnsavedNote(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('project-detail-tab-sources'));
  await user.click(screen.getByTestId('project-notes-toggle'));
  await user.type(await screen.findByLabelText('Notes text'), 'draft paragraph');
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
}

describe('unsaved project notes when the project tab changes', () => {
  it('asks before leaving Sources and keeps the draft when the reader keeps editing', async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage />);
    await typeUnsavedNote(user);

    await user.click(screen.getByTestId('project-detail-tab-chats'));

    expect(await screen.findByText('Discard unsaved changes?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));

    await waitFor(() => expect(screen.queryByText('Discard unsaved changes?')).toBeNull());
    expect(screen.getByTestId('project-detail-tab-sources').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect((screen.getByLabelText('Notes text') as HTMLTextAreaElement).value).toBe(
      'draft paragraph',
    );
  });

  it('leaves Sources once the reader explicitly discards the draft', async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage />);
    await typeUnsavedNote(user);

    await user.click(screen.getByTestId('project-detail-tab-chats'));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));

    await waitFor(() =>
      expect(screen.getByTestId('project-detail-tab-chats').getAttribute('aria-selected')).toBe(
        'true',
      ),
    );
    expect(screen.queryByLabelText('Notes text')).toBeNull();
  });

  it('changes tabs without a question when nothing is unsaved', async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage />);
    await user.click(screen.getByTestId('project-detail-tab-sources'));
    await user.click(screen.getByTestId('project-notes-toggle'));
    await screen.findByLabelText('Notes text');

    await user.click(screen.getByTestId('project-detail-tab-chats'));

    expect(screen.queryByText('Discard unsaved changes?')).toBeNull();
    expect(screen.getByTestId('project-detail-tab-chats').getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('keeps the draft when the notes are only collapsed and reopened', async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage />);
    await typeUnsavedNote(user);

    await user.click(screen.getByTestId('project-notes-toggle'));
    await user.click(screen.getByTestId('project-notes-toggle'));

    expect((screen.getByLabelText('Notes text') as HTMLTextAreaElement).value).toBe(
      'draft paragraph',
    );
  });
});

type ImportedModule3 = typeof import('@shared/components/layout/WebAppShell');
type ImportedModule2 = typeof import('@/features/chat/components/Composer/ChatComposerNew');
type ImportedModule1 = typeof import('@/features/schedules');
type ImportedModule0 = typeof import('@/features/projects/services/project-knowledge-upload');
