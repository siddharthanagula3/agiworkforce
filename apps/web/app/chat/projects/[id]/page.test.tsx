import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
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
        },
      ],
      status: 'ready' as const,
      error: null,
      isReady: true,
      retry: vi.fn(),
    }),
  };
});

vi.mock('@/lib/hooks/useConversations', () => ({
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
  SchedulesPage: ({ scope }: { scope: { projectId: string; projectName: string } }) => (
    <div data-testid="project-schedules-section">
      Scheduled for {scope.projectName} ({scope.projectId})
    </div>
  ),
}));

import ProjectDetailPage from './page';

describe('project detail page scheduled tab', () => {
  it('opens a project-scoped schedules section preselected to this project', async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage />);

    await user.click(screen.getByTestId('project-detail-tab-scheduled'));

    const section = await screen.findByTestId('project-schedules-section');
    expect(section).toHaveTextContent('Scheduled for Marketing launch (project-1)');
  });
});
