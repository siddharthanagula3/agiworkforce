import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_PLAN_PRICING,
  billingPlanCapabilityUpgradeMessage,
  billingPlanCapabilityWireTiers,
  canUseBillingPlanCapability,
  isFreeBillingPlanTier,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { onAppCommand, PLANS_PAGE_PATH } from '@shared/lib/app-commands';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { ApiKeysManager } from './ApiKeys';
import {
  admitWorkspace,
  observeWorkspaceOwner,
} from '@/features/workspaces/lib/workspace-admission';

const {
  RejectedError,
  createMutate,
  deleteMutate,
  mockApiKeysQuery,
  mockProjectsQuery,
  mockUsageQuery,
  resetCreate,
  routerPush,
  session,
} = vi.hoisted(() => ({
  RejectedError: class extends Error {
    readonly recovery: 'upgrade' | null;
    constructor(message: string, recovery: 'upgrade' | null = null) {
      super(message);
      this.recovery = recovery;
    }
  },
  routerPush: vi.fn(),
  resetCreate: vi.fn(),
  session: {
    userId: 'read-state-user',
    sessionId: 'read-state-session',
    isCurrent: () => true,
    getToken: async () => 'token',
  },
  createMutate: vi.fn(),
  deleteMutate: vi.fn(),
  mockApiKeysQuery: vi.fn(),
  mockProjectsQuery: vi.fn(),
  mockUsageQuery: vi.fn(),
}));

vi.mock('next/navigation', async (original) => ({
  ...(await original<ImportedModule2>()),
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}));

vi.mock('@features/settings/hooks/use-settings-queries', () => ({
  APIKeyMutationRejectedError: RejectedError,
  useAPIKeys: () => mockApiKeysQuery(),
  useCreateAPIKey: () => ({
    mutateAsync: createMutate,
    reset: resetCreate,
    isPending: false,
    stepUpDialog: null,
  }),
  useDeleteAPIKey: () => ({ mutateAsync: deleteMutate, isPending: false }),
}));

vi.mock('@/lib/identity/useSessionSnapshot', async (original) => ({
  ...(await original<ImportedModule0>()),
  useSessionSnapshot: () => () => session,
}));
vi.mock('@/features/workspaces/hooks/use-workspaces', async (original) => ({
  ...(await original<ImportedModule1>()),
  useAccountWorkspaces: () => ({
    data: { scope: 'personal', activeWorkspaceId: 'personal', activeOrganizationId: null },
  }),
}));

vi.mock('@/features/developers/hooks/use-developer-projects', () => ({
  readDeveloperApiError: vi.fn(async (_response: Response, fallback: string) => fallback),
  useDeveloperProjects: () => mockProjectsQuery(),
}));

vi.mock('@/features/developers/hooks/use-developer-usage', () => ({
  useDeveloperUsage: () => mockUsageQuery(),
}));

const PLAN_WITH_API = billingPlanCapabilityWireTiers('managed_api')[0] as BillingPlanTier;
const PAID_PLAN_WITHOUT_API = (Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[]).find(
  (plan) => !isFreeBillingPlanTier(plan) && !canUseBillingPlanCapability(plan, 'managed_api'),
) as BillingPlanTier;
const UPGRADE_MESSAGE = billingPlanCapabilityUpgradeMessage('managed_api');

function onPlan(tier: BillingPlanTier | null) {
  useBillingStore.setState({
    initialized: true,
    isLoading: false,
    error: null,
    subscription:
      tier === null
        ? null
        : {
            tier,
            status: 'active',
            display_name: tier,
            plan_name: tier,
            current_period_end: null,
          },
  });
}

describe('ApiKeysManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onPlan(PLAN_WITH_API);
    observeWorkspaceOwner(null);
    const owner = observeWorkspaceOwner(session)!;
    admitWorkspace(owner, owner.epoch, JSON.stringify(['personal', 'personal', null]));
    createMutate.mockResolvedValue({ apiKey: { id: 'created' }, fullKey: 'once-only-secret' });
    mockProjectsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn(),
    });
    mockUsageQuery.mockReturnValue({
      data: { from: '', to: '', keys: [], projects: [] },
      isLoading: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn(),
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

  afterEach(() => {
    useBillingStore.getState()._reset();
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
      expect(createMutate).toHaveBeenCalledWith({
        draft: {
          name: 'VS Code',
          scopes: ['inference:write'],
          expiresInDays: 'never',
          projectId: null,
        },
        scope: expect.objectContaining({ organizationId: null, request: expect.any(Object) }),
      }),
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
    mockProjectsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isSuccess: false,
    });
    mockUsageQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isSuccess: false,
    });

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
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new Error('Project choices could not be loaded.'),
      refetch: retryProjects,
    });
    mockUsageQuery.mockReturnValue({
      data: {
        keys: [{ apiKeyId: 'key-1', requests: 7, credits: 12, unsettledRequests: 0 }],
        projects: [],
      },
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new Error('Key usage could not be loaded.'),
      refetch: retryUsage,
    });
    const apiKeys = mockApiKeysQuery();
    mockApiKeysQuery.mockReturnValue({
      ...apiKeys,
      data: [{ ...apiKeys.data[0], project_id: 'project-1' }],
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

describe('ApiKeysManager on a plan without Cloud API access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    observeWorkspaceOwner(null);
    const owner = observeWorkspaceOwner(session)!;
    admitWorkspace(owner, owner.epoch, JSON.stringify(['personal', 'personal', null]));
    mockProjectsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn(),
    });
    mockUsageQuery.mockReturnValue({
      data: { from: '', to: '', keys: [], projects: [] },
      isLoading: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn(),
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

  afterEach(() => {
    useBillingStore.getState()._reset();
  });

  it.each([
    ['Free', null],
    ['a paid plan without it', PAID_PLAN_WITHOUT_API],
  ])('offers Upgrade instead of New Key on %s and keeps existing keys revocable', (_, tier) => {
    onPlan(tier);
    render(<ApiKeysManager />);

    expect(screen.queryByRole('button', { name: 'New Key' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeEnabled();
    expect(screen.getByText(UPGRADE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText('CLI')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete CLI' })).toBeEnabled();
  });

  const usageOfFirstKey = {
    data: {
      from: '',
      to: '',
      keys: [{ apiKeyId: 'key-1', requests: 7, credits: 12, unsettledRequests: 0 }],
      projects: [],
    },
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  };

  it('lists existing keys without a usage meter', () => {
    onPlan(null);
    mockUsageQuery.mockReturnValue(usageOfFirstKey);
    render(<ApiKeysManager />);

    expect(screen.getByText('CLI')).toBeInTheDocument();
    expect(screen.queryByText(/This month:/)).toBeNull();
    expect(screen.queryByText('No requests this month')).toBeNull();
  });

  it('keeps the usage meter on a plan that includes it', () => {
    onPlan(PLAN_WITH_API);
    mockUsageQuery.mockReturnValue(usageOfFirstKey);
    render(<ApiKeysManager />);

    expect(screen.getByText(/This month:/)).toBeInTheDocument();
  });

  it.each([
    ['loading', { isLoading: true, isError: false, error: null }],
    ['failing', { isLoading: false, isError: true, error: new Error('Unavailable.') }],
  ])('shows no key usage or project choice status while they are %s', (_, state) => {
    onPlan(null);
    const query = { data: undefined, isSuccess: false, refetch: vi.fn(), ...state };
    mockUsageQuery.mockReturnValue(query);
    mockProjectsQuery.mockReturnValue(query);
    render(<ApiKeysManager />);

    expect(screen.queryByText('Loading key usage')).toBeNull();
    expect(screen.queryByText('Loading project choices')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry key usage' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry project choices' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeEnabled();
  });

  it('replaces the first-key invitation with the plan line when there are no keys', () => {
    onPlan(null);
    mockApiKeysQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ApiKeysManager />);

    expect(screen.getByText('No API keys yet')).toBeInTheDocument();
    expect(screen.getByText(UPGRADE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('Generate your first API key to get started')).toBeNull();
  });

  it.each([
    ['while billing is still loading', undefined],
    ['on a plan that includes it', PLAN_WITH_API],
  ])('keeps New Key %s', (_, tier) => {
    if (tier === undefined)
      useBillingStore.setState({ initialized: false, isLoading: true, subscription: null });
    else onPlan(tier);
    render(<ApiKeysManager />);

    expect(screen.getByRole('button', { name: 'New Key' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
    expect(screen.queryByText(UPGRADE_MESSAGE)).toBeNull();
  });

  it('opens the in-app plan dialog from Upgrade without navigating', () => {
    onPlan(null);
    const openPlans = vi.fn();
    const stop = onAppCommand('open-upgrade', openPlans);
    try {
      render(<ApiKeysManager />);
      fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    } finally {
      stop();
    }

    expect(openPlans).toHaveBeenCalledOnce();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('falls back to the plans page when no surface hosts the plan dialog', () => {
    onPlan(null);
    render(<ApiKeysManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));

    expect(routerPush).toHaveBeenCalledWith(PLANS_PAGE_PATH);
  });

  it('turns a plan refusal from the server into Upgrade instead of a form to resubmit', async () => {
    const user = userEvent.setup();
    onPlan(PLAN_WITH_API);
    createMutate.mockRejectedValue(new RejectedError(UPGRADE_MESSAGE, 'upgrade'));
    render(<ApiKeysManager />);

    await user.click(screen.getByRole('button', { name: 'New Key' }));
    await user.type(screen.getByPlaceholderText('e.g., Production API'), 'VS Code');
    const generate = screen.getByRole('button', { name: 'Generate Key' });
    await waitFor(() => expect(generate).toBeEnabled());
    await user.click(generate);

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(createMutate).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Key' })).toBeNull();
    expect(screen.getByText(UPGRADE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete CLI' })).toBeEnabled();
  });

  it('offers New Key again once the plan behind a refusal changes', async () => {
    const user = userEvent.setup();
    onPlan(PLAN_WITH_API);
    createMutate.mockRejectedValue(new RejectedError(UPGRADE_MESSAGE, 'upgrade'));
    render(<ApiKeysManager />);
    await user.click(screen.getByRole('button', { name: 'New Key' }));
    await user.type(screen.getByPlaceholderText('e.g., Production API'), 'VS Code');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate Key' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Generate Key' }));
    await screen.findByRole('button', { name: 'Upgrade' });

    const otherPlan = billingPlanCapabilityWireTiers('managed_api').find(
      (plan) => plan !== PLAN_WITH_API,
    ) as BillingPlanTier;
    act(() => onPlan(otherPlan));

    expect(screen.getByRole('button', { name: 'New Key' })).toBeEnabled();
  });

  it('keeps the form and its reason for a refusal that an upgrade does not fix', async () => {
    const user = userEvent.setup();
    onPlan(PLAN_WITH_API);
    createMutate.mockRejectedValue(new RejectedError('You already have the most active keys.'));
    render(<ApiKeysManager />);

    await user.click(screen.getByRole('button', { name: 'New Key' }));
    await user.type(screen.getByPlaceholderText('e.g., Production API'), 'VS Code');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate Key' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Generate Key' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'You already have the most active keys.',
    );
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
  });
});

type ImportedModule0 = typeof import('@/lib/identity/useSessionSnapshot');
type ImportedModule1 = typeof import('@/features/workspaces/hooks/use-workspaces');
type ImportedModule2 = typeof import('next/navigation');
