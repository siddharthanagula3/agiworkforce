import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectsPanel } from '../components/ProjectsPanel';

const { mockProjects, mockUsage } = vi.hoisted(() => ({
  mockProjects: vi.fn(), mockUsage: vi.fn(),
}));
vi.mock('../hooks/use-developer-projects', () => ({
  useDeveloperProjects: () => mockProjects(),
  useCreateDeveloperProject: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateDeveloperProject: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveDeveloperProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/use-developer-usage', () => ({ useDeveloperUsage: () => mockUsage() }));
vi.mock('@features/settings/hooks/use-settings-queries', () => ({
  useAPIKeys: () => ({ data: [] }),
}));

const project = { id: 'p', name: 'Production', archivedAt: null, monthlyCreditLimit: null,
  createdAt: '2026-10-20T00:00:00.000Z' };
beforeEach(() => {
  vi.clearAllMocks();
  mockProjects.mockReturnValue({ data: [project], isLoading: false, isError: false,
    isSuccess: true, error: null, refetch: vi.fn() });
  mockUsage.mockReturnValue({ data: { from: '', to: '', keys: [], projects: [] },
    isLoading: false, isError: false, isSuccess: true, error: null, refetch: vi.fn() });
});

describe('ProjectsPanel read states', () => {
  it('labels pending usage without inventing zero spend', () => {
    mockUsage.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<ProjectsPanel />);
    expect(screen.getAllByText(/Loading usage/)).toHaveLength(2);
    expect(screen.queryByText(/this month/)).not.toBeInTheDocument();
  });

  it('reports unavailable usage even when a failed refetch retains cached figures', () => {
    const refetch = vi.fn();
    mockUsage.mockReturnValue({
      data: { projects: [{ projectId: 'p', requests: 7, credits: 12, unsettledRequests: 0 }] },
      isLoading: false, isError: true, error: new Error('Usage could not be loaded.'), refetch,
    });
    render(<ProjectsPanel />);
    expect(screen.getAllByText(/Usage unavailable/)).toHaveLength(2);
    expect(screen.queryByText(/this month/)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Usage could not be loaded.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry usage' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('renders a successful empty usage response as zero spend', () => {
    render(<ProjectsPanel />);
    expect(screen.getAllByText(/0.*this month, no monthly limit/)).toHaveLength(2);
    expect(screen.queryByText(/Usage unavailable/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not render retained project rows on project refetch failure', () => {
    const refetch = vi.fn();
    mockProjects.mockReturnValue({ data: [project], isLoading: false, isError: true,
      error: new Error('Projects could not be loaded.'), refetch });
    render(<ProjectsPanel />);
    expect(screen.queryByText('Production')).not.toBeInTheDocument();
    expect(screen.queryByText('Default project')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New project' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
