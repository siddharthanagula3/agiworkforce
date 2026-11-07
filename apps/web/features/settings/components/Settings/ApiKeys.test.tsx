import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeysManager } from './ApiKeys';
import { admitWorkspace, observeWorkspaceOwner } from '@/features/workspaces/lib/workspace-admission';

const { createMutate, deleteMutate, mockApiKeysQuery, mockProjectsQuery, mockUsageQuery, resetCreate, session } = vi.hoisted(() => ({
  resetCreate: vi.fn(),
  session: { userId: 'read-state-user', sessionId: 'read-state-session', isCurrent: () => true, getToken: async () => 'token' },
  createMutate: vi.fn(),
  deleteMutate: vi.fn(),
  mockApiKeysQuery: vi.fn(),
  mockProjectsQuery: vi.fn(),
  mockUsageQuery: vi.fn(),
}));

vi.mock('@features/settings/hooks/use-settings-queries', () => ({
  APIKeyMutationRejectedError: class extends Error {},
  useAPIKeys: () => mockApiKeysQuery(),
  useCreateAPIKey: () => ({ mutateAsync: createMutate, reset: resetCreate, isPending: false, stepUpDialog: null }),
  useDeleteAPIKey: () => ({ mutateAsync: deleteMutate, isPending: false }),
}));

vi.mock('@/lib/identity/useSessionSnapshot', async (original) => ({
  ...await original<typeof import('@/lib/identity/useSessionSnapshot')>(), useSessionSnapshot: () => () => session,
}));
vi.mock('@/features/workspaces/hooks/use-workspaces', async (original) => ({
  ...await original<typeof import('@/features/workspaces/hooks/use-workspaces')>(),
  useAccountWorkspaces: () => ({ data: { scope: 'personal', activeWorkspaceId: 'personal', activeOrganizationId: null } }),
}));

vi.mock('@/features/developers/hooks/use-developer-projects', () => ({
  readDeveloperApiError: vi.fn(async (_response: Response, fallback: string) => fallback),
  useDeveloperProjects: () => mockProjectsQuery(),
}));

vi.mock('@/features/developers/hooks/use-developer-usage', () => ({
  useDeveloperUsage: () => mockUsageQuery(),
}));

describe('ApiKeysManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    observeWorkspaceOwner(null);
    const owner = observeWorkspaceOwner(session)!;
    admitWorkspace(owner, owner.epoch, JSON.stringify(['personal', 'personal', null]));
    createMutate.mockResolvedValue({ apiKey: { id: 'created' }, fullKey: 'once-only-secret' });
    mockProjectsQuery.mockReturnValue({
      data: [], isLoading: false, isError: false, isSuccess: true, error: null, refetch: vi.fn(),
    });
    mockUsageQuery.mockReturnValue({
      data: { from: '', to: '', keys: [], projects: [] },
      isLoading: false, isError: false, isSuccess: true, error: null, refetch: vi.fn(),
    });
    mockApiKeysQuery.mockReturnValue({
      data: [
        {
          id: 'key-1',
          name: 'CLI',
          key_prefix: '0123456789abcdef',
          scopes: ['inference:write'],
          created_at: '2026-07-30T00:00:00.000Z',
          last_used_at: null,
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('shows persisted scopes and submits the selected least-privilege contract', async () => {
    const user = userEvent.setup();
    render(<ApiKeysManager />);

    expect(screen.getByText('Run inference')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New Key' }));

    const modelsScope = screen.getByRole('checkbox', { name: /Read model catalog/ });
    const inferenceScope = screen.getByRole('checkbox', { name: /Run inference/ });
    const usageScope = screen.getByRole('checkbox', { name: /Read usage/ });
    expect(modelsScope).toBeChecked();
    expect(inferenceScope).toBeChecked();
    expect(usageScope).not.toBeChecked();

    await user.click(modelsScope);
    await user.type(screen.getByPlaceholderText('e.g., Production API'), 'VS Code');
    const generateButton = screen.getByRole('button', { name: 'Generate Key' });
    await waitFor(() => expect(generateButton).toBeEnabled());
    await user.click(generateButton);

    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith(
        { draft: { name: 'VS Code', scopes: ['inference:write'], expiresInDays: 'never', projectId: null },
          scope: expect.objectContaining({ organizationId: null, request: expect.any(Object) }) },
      ),
    );
  });

  it('does not allow a key with no selected scope', async () => {
    render(<ApiKeysManager />);
    fireEvent.click(screen.getByRole('button', { name: 'New Key' }));
    fireEvent.change(screen.getByPlaceholderText('e.g., Production API'), {
      target: { value: 'No permissions' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Read model catalog/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Run inference/ }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Generate Key' })).toBeDisabled(),
    );
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('shows an honest retry state instead of an empty key list after a load failure', async () => {
    const refetch = vi.fn();
    mockApiKeysQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('API keys took too long to load. Please try again.'),
      refetch,
    });

    render(<ApiKeysManager />);

    expect(screen.getByRole('alert')).toHaveTextContent('API keys took too long to load');
    expect(screen.queryByText('No API keys yet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Key' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('does not expose a raw HTTP status when loading keys fails', () => {
    mockApiKeysQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('HTTP 500'),
      refetch: vi.fn(),
    });

    render(<ApiKeysManager />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on our side');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/HTTP\s+\d/i);
  });

  it('opens the create form without render-phase updates and stays bounded on narrow screens', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();

    render(<ApiKeysManager />);
    await user.click(screen.getByRole('button', { name: 'New Key' }));

    expect(screen.getByRole('alertdialog')).toHaveClass('max-w-[calc(100vw-2rem)]');
    expect(
      consoleError.mock.calls.some(([message]) =>
        /Cannot update a component.*while rendering a different component/.test(String(message)),
      ),
    ).toBe(false);

    consoleError.mockRestore();
  });
  it('labels supplementary loading instead of reporting zero usage', () => {
    mockProjectsQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false, isSuccess: false });
    mockUsageQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false, isSuccess: false });

    render(<ApiKeysManager />);

    expect(screen.getByText('Loading project choices')).toHaveAttribute('role', 'status');
    expect(screen.getByText('Loading key usage')).toHaveAttribute('role', 'status');
    expect(screen.queryByText('No requests this month')).not.toBeInTheDocument();
    expect(screen.getByText('CLI')).toBeInTheDocument();
  });

  it('shows successful empty usage as no requests', () => {
    render(<ApiKeysManager />);
    expect(screen.getByText('No requests this month')).toBeInTheDocument();
  });

  it('hides cached supplementary data on refetch failure and exposes separate retries', () => {
    const retryProjects = vi.fn();
    const retryUsage = vi.fn();
    mockProjectsQuery.mockReturnValue({
      data: [{ id: 'project-1', name: 'Cached project', archivedAt: null }],
      isLoading: false, isError: true, isSuccess: false,
      error: new Error('Project choices could not be loaded.'), refetch: retryProjects,
    });
    mockUsageQuery.mockReturnValue({
      data: { keys: [{ apiKeyId: 'key-1', requests: 7, credits: 12, unsettledRequests: 0 }], projects: [] },
      isLoading: false, isError: true, isSuccess: false,
      error: new Error('Key usage could not be loaded.'), refetch: retryUsage,
    });
    const apiKeys = mockApiKeysQuery();
    mockApiKeysQuery.mockReturnValue({
      ...apiKeys, data: [{ ...apiKeys.data[0], project_id: 'project-1' }],
    });

    render(<ApiKeysManager />);

    expect(screen.queryByText('Cached project')).not.toBeInTheDocument();
    expect(screen.queryByText(/This month:/)).not.toBeInTheDocument();
    expect(screen.queryByText('No requests this month')).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Retry project choices' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry key usage' }));
    expect(retryProjects).toHaveBeenCalledOnce();
    expect(retryUsage).toHaveBeenCalledOnce();
  });

});
