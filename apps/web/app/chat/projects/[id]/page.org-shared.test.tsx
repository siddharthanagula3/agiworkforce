import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({ isOrgShared: false }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: 'project-1' }),
}));

vi.mock('@shared/components/layout/WebAppShell', () => ({
  WebAppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/features/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/projects')>();
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
          isOrgShared: shared.isOrgShared,
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

vi.mock('@/features/chat/components/Composer/ChatComposerNew', () => ({
  ChatComposerNew: () => <div data-testid="project-composer-stub" />,
}));

vi.mock('@/features/schedules', () => ({
  SchedulesPage: () => <div data-testid="project-schedules-section" />,
}));

vi.mock('@/features/projects/components/SourcesPanel', () => ({
  SourcesPanel: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="sources-panel" data-read-only={String(Boolean(readOnly))} />
  ),
}));

const updateProjectRemote = vi.fn().mockResolvedValue(undefined);
vi.mock('@/features/projects/services/managed-cloud-projects', () => ({
  webManagedCloudProjects: {
    updateProject: (id: string, input: unknown) => updateProjectRemote(id, input),
    deleteProject: vi.fn(),
  },
}));

import ProjectDetailPage from './page';

beforeEach(() => {
  shared.isOrgShared = false;
  vi.clearAllMocks();
});

/**
 * Every project write route enforces ownership and answers 404 for a member who
 * reaches the project through an organisation share. The page used to render
 * the same controls to both, so a shared member was offered four controls that
 * could only fail.
 */
describe('project detail page on a project shared with the caller', () => {
  it('says the project is shared rather than leaving the missing controls unexplained', () => {
    shared.isOrgShared = true;
    render(<ProjectDetailPage />);

    expect(screen.getByTestId('project-shared-badge')).toBeTruthy();
  });

  it('offers neither project settings nor pin in the overflow menu', async () => {
    shared.isOrgShared = true;
    const user = userEvent.setup();
    render(<ProjectDetailPage />);

    await user.click(screen.getByTestId('project-detail-menu-btn'));

    expect(screen.queryByTestId('project-detail-menu-settings')).toBeNull();
    expect(screen.queryByTestId('project-detail-menu-pin')).toBeNull();
  });

  it('renders the project glyph without making it a picker trigger', () => {
    shared.isOrgShared = true;
    render(<ProjectDetailPage />);

    expect(screen.queryByTestId('project-appearance-trigger')).toBeNull();
    expect(screen.getByTestId('project-appearance-static')).toBeTruthy();
  });

  it('puts the sources panel in its read-only state', async () => {
    shared.isOrgShared = true;
    const user = userEvent.setup();
    render(<ProjectDetailPage />);

    await user.click(screen.getByTestId('project-detail-tab-sources'));

    expect(screen.getByTestId('sources-panel').getAttribute('data-read-only')).toBe('true');
  });

  it('never writes to the project while rendering a shared one', () => {
    shared.isOrgShared = true;
    render(<ProjectDetailPage />);

    expect(updateProjectRemote).not.toHaveBeenCalled();
  });

  it('keeps every control, and no badge, on a project the caller owns', async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage />);

    expect(screen.queryByTestId('project-shared-badge')).toBeNull();
    expect(screen.getByTestId('project-appearance-trigger')).toBeTruthy();

    await user.click(screen.getByTestId('project-detail-tab-sources'));
    expect(screen.getByTestId('sources-panel').getAttribute('data-read-only')).toBe('false');

    await user.click(screen.getByTestId('project-detail-menu-btn'));
    expect(screen.getByTestId('project-detail-menu-settings')).toBeTruthy();
    expect(screen.getByTestId('project-detail-menu-pin')).toBeTruthy();
  });
});
