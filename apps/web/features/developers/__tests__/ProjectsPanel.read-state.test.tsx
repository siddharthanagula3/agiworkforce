import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectsPanel } from '../components/ProjectsPanel';
type UseDeveloperProjectsModule = typeof import('../hooks/use-developer-projects');
type UseDeveloperUsageModule = typeof import('../hooks/use-developer-usage');
type UseSettingsQueriesModule = typeof import('@features/settings/hooks/use-settings-queries');
type UseSessionSnapshotModule = typeof import('@/lib/identity/useSessionSnapshot');
type UseWorkspacesModule = typeof import('@/features/workspaces/hooks/use-workspaces');
type WorkspaceAdmissionModule = typeof import('@/features/workspaces/lib/workspace-admission');

const { mockProjects, mockUsage, mockKeys } = vi.hoisted(() => ({
  mockProjects: vi.fn(),
  mockUsage: vi.fn(),
  mockKeys: vi.fn(),
}));
vi.mock('../hooks/use-developer-projects', async () => ({
  ...(await vi.importActual<UseDeveloperProjectsModule>('../hooks/use-developer-projects')),

  ProjectMutationRejectedError: class ProjectMutationRejectedError extends Error {},
  useDeveloperProjects: () => mockProjects(),
  useCreateDeveloperProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateDeveloperProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveDeveloperProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/use-developer-usage', async () => ({
  ...(await vi.importActual<UseDeveloperUsageModule>('../hooks/use-developer-usage')),
  useDeveloperUsage: () => mockUsage(),
}));
vi.mock('@features/settings/hooks/use-settings-queries', async () => ({
  ...(await vi.importActual<UseSettingsQueriesModule>(
    '@features/settings/hooks/use-settings-queries',
  )),

  useAPIKeys: () => mockKeys(),
}));

const admission = vi.hoisted(() => {
  const data = { scope: 'personal', activeWorkspaceId: 'personal', activeOrganizationId: null };
  const session = {
    userId: 'a',
    sessionId: 'a',
    isCurrent: () => true,
    getToken: async () => 'token',
  };
  const owner = {
    session,
    incarnation: 1,
    epoch: 0,
    phase: 'admitted',
    scopeKey: JSON.stringify([data.scope, data.activeWorkspaceId, data.activeOrganizationId]),
  };
  return { data, session, owner };
});
vi.mock('@/lib/identity/useSessionSnapshot', async () => ({
  ...(await vi.importActual<UseSessionSnapshotModule>('@/lib/identity/useSessionSnapshot')),

  useSessionSnapshot: () => () => admission.session,
}));
vi.mock('@/features/workspaces/hooks/use-workspaces', async () => ({
  ...(await vi.importActual<UseWorkspacesModule>('@/features/workspaces/hooks/use-workspaces')),

  useAccountWorkspaces: () => ({ data: admission.data }),
}));
vi.mock('@/features/workspaces/lib/workspace-admission', async () => ({
  ...(await vi.importActual<WorkspaceAdmissionModule>(
    '@/features/workspaces/lib/workspace-admission',
  )),

  observeWorkspaceOwner: () => admission.owner,
  workspaceOwnerIsCurrent: () => true,
  subscribeWorkspaceAdmission: () => () => undefined,
}));

const project = {
  id: 'p',
  name: 'Production',
  archivedAt: null,
  monthlyCreditLimit: null,
  createdAt: '2026-10-20T00:00:00.000Z',
};
beforeEach(() => {
  vi.clearAllMocks();
  mockKeys.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  });
  mockProjects.mockReturnValue({
    data: [project],
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  });
  mockUsage.mockReturnValue({
    data: { from: '', to: '', keys: [], projects: [] },
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  });
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
      isLoading: false,
      isError: true,
      error: new Error('Usage could not be loaded.'),
      refetch,
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
    mockProjects.mockReturnValue({
      data: [project],
      isLoading: false,
      isError: true,
      error: new Error('Projects could not be loaded.'),
      refetch,
    });
    render(<ProjectsPanel />);
    expect(screen.queryByText('Production')).not.toBeInTheDocument();
    expect(screen.queryByText('Default project')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New project' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
  it('labels pending key counts and prevents a zero-key archive confirmation', () => {
    mockKeys.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<ProjectsPanel />);
    expect(screen.getAllByText(/Loading key count/)).toHaveLength(2);
    expect(screen.queryByText(/0 keys/)).not.toBeInTheDocument();
    const archive = screen.getByRole('button', { name: 'Archive' });
    expect(archive).toBeDisabled();
    fireEvent.click(archive);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('withholds cached key counts after a refetch failure and offers retry', () => {
    const refetch = vi.fn();
    mockKeys.mockReturnValue({
      data: [{ id: 'key-1', project_id: 'p' }],
      isLoading: false,
      isError: true,
      error: new Error('Key counts could not be loaded.'),
      refetch,
    });
    render(<ProjectsPanel />);
    expect(screen.getAllByText(/Key count unavailable/)).toHaveLength(2);
    expect(screen.queryByText(/1 key/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 keys/)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Key counts could not be loaded.');
    expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry key counts' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('treats a successful empty key list as zero and keeps archive available', () => {
    render(<ProjectsPanel />);
    expect(screen.getAllByText(/0 keys/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Archive' })).toBeEnabled();
    expect(screen.queryByText(/Key count unavailable/)).not.toBeInTheDocument();
  });
});
