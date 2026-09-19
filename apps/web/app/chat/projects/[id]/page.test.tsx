import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const schedulePageProps = vi.fn();
const billing = vi.hoisted(() => ({
  state: {
    subscription: { tier: 'enterprise' },
    isLoading: false,
    initialized: true,
  },
}));
const projectFixture = {
  id: 'project-1',
  name: 'Marketing launch',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};
const projectApi = vi.hoisted(() => ({
  getProject: vi.fn(),
  updateProject: vi.fn().mockResolvedValue(undefined),
  deleteProject: vi.fn(),
}));
const retryProjects = vi.hoisted(() => vi.fn());
const projectsSession = vi.hoisted(() => ({
  accountId: 'user-1',
  projects: [] as Array<typeof projectFixture>,
  status: 'ready' as 'idle' | 'loading' | 'ready' | 'error' | 'signed-out',
  error: null as string | null,
  isReady: true,
  hasMore: false,
  isLoadingMore: false,
  loadMore: vi.fn(),
  retry: retryProjects,
}));

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
      ...projectsSession,
      projects: actual.useProjectStore((state) => state.projects),
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
  SchedulesPage: (props: {
    scope: { projectId: string; projectName: string };
    subscriptionTier: string;
  }) => {
    schedulePageProps(props);
    return (
      <div data-testid="project-schedules-section">
        Scheduled for {props.scope.projectName} ({props.scope.projectId})
      </div>
    );
  },
  SchedulesEntitlementLoading: () => <div role="status" aria-label="Loading schedule access" />,
}));

vi.mock('@/shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: typeof billing.state) => unknown) => selector(billing.state),
}));

vi.mock('@/features/projects/services/managed-cloud-projects', () => ({
  webManagedCloudProjects: projectApi,
}));

import ProjectDetailPage from './page';
import { useChatProjectStore } from '@agiworkforce/unified-chat';

beforeEach(() => {
  projectsSession.accountId = 'user-1';
  projectsSession.status = 'ready';
  projectsSession.error = null;
  projectsSession.isReady = true;
  projectsSession.hasMore = false;
  projectsSession.isLoadingMore = false;
  projectApi.getProject.mockReset();
  projectApi.updateProject.mockClear();
  projectApi.deleteProject.mockClear();
  retryProjects.mockClear();
  billing.state = {
    subscription: { tier: 'enterprise' },
    isLoading: false,
    initialized: true,
  };
  schedulePageProps.mockClear();
  useChatProjectStore.setState({ projects: [projectFixture], activeProjectId: null });
});

describe('project detail hydration', () => {
  it('resolves a project omitted from the first list page before presenting not found', async () => {
    useChatProjectStore.setState({ projects: [], activeProjectId: null });
    projectApi.getProject.mockResolvedValue(projectFixture);
    render(<ProjectDetailPage />);

    expect(screen.getByRole('status', { name: 'Loading project' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Project not found' })).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Marketing launch' })).toBeInTheDocument();
    expect(projectApi.getProject).toHaveBeenCalledWith('project-1');
  });

  it('presents not found only after the project detail endpoint confirms it', async () => {
    useChatProjectStore.setState({ projects: [], activeProjectId: null });
    projectApi.getProject.mockRejectedValue({ status: 404 });
    render(<ProjectDetailPage />);

    expect(screen.getByRole('status', { name: 'Loading project' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Project not found' })).toBeInTheDocument();
  });

  it('retries a failed project detail lookup without exposing the raw error', async () => {
    const user = userEvent.setup();
    useChatProjectStore.setState({ projects: [], activeProjectId: null });
    projectApi.getProject
      .mockRejectedValueOnce(new Error('connect ECONNRESET db.internal.example'))
      .mockResolvedValueOnce(projectFixture);
    render(<ProjectDetailPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Project could not be loaded.');
    expect(screen.queryByText(/ECONNRESET|internal\.example/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Marketing launch' })).toBeInTheDocument();
    expect(projectApi.getProject).toHaveBeenCalledTimes(2);
  });
});

describe('project detail page scheduled tab', () => {
  it('opens a project-scoped schedules section preselected to this project', async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage />);

    await user.click(screen.getByTestId('project-detail-tab-scheduled'));

    const section = await screen.findByTestId('project-schedules-section');
    expect(section).toHaveTextContent('Scheduled for Marketing launch (project-1)');
    expect(schedulePageProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ subscriptionTier: 'enterprise' }),
    );
  });

  it('waits for billing hydration before rendering project schedule entitlements', async () => {
    billing.state = {
      subscription: { tier: 'enterprise' },
      isLoading: true,
      initialized: false,
    };
    const user = userEvent.setup();
    render(<ProjectDetailPage />);

    await user.click(screen.getByTestId('project-detail-tab-scheduled'));

    expect(screen.getByRole('status', { name: 'Loading schedule access' })).toBeInTheDocument();
    expect(screen.queryByTestId('project-schedules-section')).toBeNull();
    expect(schedulePageProps).not.toHaveBeenCalled();
  });
});

describe('project detail page header', () => {
  it('keeps the folder glyph and title without a provenance chip cluster', () => {
    render(<ProjectDetailPage />);

    expect(screen.getByRole('heading', { name: 'Marketing launch' })).toBeInTheDocument();
    expect(screen.queryByTestId('project-header-imported-from')).toBeNull();
    expect(screen.queryByTestId('project-header-privacy-chip')).toBeNull();
    expect(screen.queryByTestId('project-header-provider-chip')).toBeNull();
    expect(screen.queryByTestId('project-header-surface-chips')).toBeNull();
  });

  it('marks the selected tab with the warm page primary token, not the retired amber alias', async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage />);

    const chatsTab = screen.getByTestId('project-detail-tab-chats');
    expect(chatsTab).toHaveStyle({ borderBottom: '2px solid hsl(var(--primary))' });

    await user.click(screen.getByTestId('project-detail-tab-scheduled'));
    expect(screen.getByTestId('project-detail-tab-scheduled')).toHaveStyle({
      borderBottom: '2px solid hsl(var(--primary))',
    });
    expect(chatsTab).toHaveStyle({ borderBottom: '2px solid transparent' });
  });
});

describe('project detail page icon and colour picker', () => {
  it('opens the picker from the title, colour first, then a line-icon grid of at least 24', async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage />);

    await user.click(screen.getByTestId('project-appearance-trigger'));

    const picker = await screen.findByTestId('project-appearance-picker');
    const colourList = within(picker).getByRole('listbox', { name: 'Project colour' });
    const iconList = within(picker).getByRole('listbox', { name: 'Project icon' });
    expect(
      colourList.compareDocumentPosition(iconList) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(colourList).getAllByRole('option').length).toBe(6);
    expect(within(picker).getByLabelText('Custom colour')).toBeInTheDocument();
    expect(within(iconList).getAllByRole('option').length).toBeGreaterThanOrEqual(24);
    expect(within(iconList).getByRole('option', { name: 'Folder' })).toBeInTheDocument();
  });

  it('has no uppercase-tracked section labels', async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage />);

    await user.click(screen.getByTestId('project-appearance-trigger'));
    const picker = await screen.findByTestId('project-appearance-picker');

    expect(within(picker).getByText('Colour')).toBeInTheDocument();
    expect(within(picker).getByText('Icon')).toBeInTheDocument();
    expect(within(picker).queryByText('COLOUR')).toBeNull();
    expect(within(picker).queryByText('ICON')).toBeNull();
  });

  it('persists the chosen icon and keeps the picker open for further choices', async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage />);

    await user.click(screen.getByTestId('project-appearance-trigger'));
    const picker = await screen.findByTestId('project-appearance-picker');
    await user.click(within(picker).getByRole('option', { name: 'Terminal' }));

    await waitFor(() =>
      expect(projectApi.updateProject).toHaveBeenCalledWith('project-1', {
        iconEmoji: 'terminal',
      }),
    );
    expect(screen.getByTestId('project-appearance-picker')).toBeInTheDocument();
  });

  it('persists the chosen colour', async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage />);

    await user.click(screen.getByTestId('project-appearance-trigger'));
    const picker = await screen.findByTestId('project-appearance-picker');
    await user.click(within(picker).getByRole('option', { name: 'Sky' }));

    await waitFor(() =>
      expect(projectApi.updateProject).toHaveBeenCalledWith('project-1', { accentColor: 'sky' }),
    );
  });

  it('closes via the Close row and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage />);

    const trigger = screen.getByTestId('project-appearance-trigger');
    await user.click(trigger);
    await screen.findByTestId('project-appearance-picker');

    await user.click(screen.getByTestId('project-appearance-close'));
    expect(screen.queryByTestId('project-appearance-picker')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage />);

    const trigger = screen.getByTestId('project-appearance-trigger');
    await user.click(trigger);
    await screen.findByTestId('project-appearance-picker');

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('project-appearance-picker')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
