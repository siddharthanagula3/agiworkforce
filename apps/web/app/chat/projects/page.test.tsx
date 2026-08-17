import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@shared/components/layout/WebAppShell', () => ({
  WebAppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@features/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@features/projects')>();
  return {
    ...actual,
    useManagedCloudProjects: () => ({
      projects: [],
      status: 'ready' as const,
      error: null,
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
