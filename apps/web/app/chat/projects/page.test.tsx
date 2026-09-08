import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();

const searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  // The page opens its create dialog for ?new=1, which is how "New project"
  // keeps its meaning when the sidebar is rendered by WebAppShell.
  useSearchParams: () => searchParams,
}));

vi.mock('@shared/components/layout/WebAppShell', () => ({
  WebAppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const listState = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
  hasMore: false,
  isLoadingMore: false,
  loadMore: vi.fn(),
}));

vi.mock('@features/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@features/projects')>();
  return {
    ...actual,
    useManagedCloudProjects: () => ({
      projects: listState.projects,
      status: 'ready' as const,
      error: null,
      hasMore: listState.hasMore,
      isLoadingMore: listState.isLoadingMore,
      loadMore: listState.loadMore,
      retry: vi.fn(),
    }),
  };
});

vi.mock('@/features/projects/services/managed-cloud-projects', () => ({
  webManagedCloudProjects: {
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
  },
}));

import ProjectsPage from './page';

describe('Projects page create path', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it('keeps a create control after the sort changes away from Updated (newest)', async () => {
    const user = userEvent.setup();
    render(<ProjectsPage />);

    await user.click(screen.getByTestId('projects-sort-btn'));
    await user.click(screen.getByTestId('projects-sort-name'));

    expect(screen.queryByText(/Switch to/i)).toBeNull();

    await user.click(screen.getByTestId('projects-new-btn'));
    expect(await screen.findByRole('button', { name: 'Create project' })).toBeInTheDocument();
  });

  it('offers a create button in the empty state instead of sort instructions', async () => {
    const user = userEvent.setup();
    render(<ProjectsPage />);

    await user.click(screen.getByTestId('projects-sort-btn'));
    await user.click(screen.getByTestId('projects-sort-created'));

    await user.click(screen.getByTestId('projects-empty-new-btn'));
    expect(await screen.findByRole('button', { name: 'Create project' })).toBeInTheDocument();
  });
});

describe('Projects page paging', () => {
  const someProject = {
    id: 'p-1',
    name: 'Roadmap',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    listState.projects = [];
    listState.hasMore = false;
    listState.isLoadingMore = false;
    listState.loadMore.mockReset();
  });

  it('offers no control when the server has nothing beyond the loaded page', () => {
    listState.projects = [someProject];
    render(<ProjectsPage />);

    expect(screen.queryByTestId('projects-load-more')).toBeNull();
  });

  it('reaches the projects past the first page', async () => {
    listState.projects = [someProject];
    listState.hasMore = true;
    const user = userEvent.setup();
    render(<ProjectsPage />);

    await user.click(screen.getByTestId('projects-load-more'));

    expect(listState.loadMore).toHaveBeenCalledTimes(1);
  });

  it('never offers the control over an empty list, where it would page nothing', () => {
    listState.hasMore = true;
    render(<ProjectsPage />);

    expect(screen.queryByTestId('projects-load-more')).toBeNull();
  });

  it('refuses a second request while one is in flight and says it is working', () => {
    listState.projects = [someProject];
    listState.hasMore = true;
    listState.isLoadingMore = true;
    render(<ProjectsPage />);

    const control = screen.getByTestId('projects-load-more');
    expect(control).toBeDisabled();
    expect(control).toHaveTextContent('Loading projects');
  });
});
