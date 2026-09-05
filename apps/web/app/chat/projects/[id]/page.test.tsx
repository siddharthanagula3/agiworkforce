import { render, screen, waitFor, within } from '@testing-library/react';
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
  SchedulesPage: ({ scope }: { scope: { projectId: string; projectName: string } }) => (
    <div data-testid="project-schedules-section">
      Scheduled for {scope.projectName} ({scope.projectId})
    </div>
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

describe('project detail page scheduled tab', () => {
  it('opens a project-scoped schedules section preselected to this project', async () => {
    const user = userEvent.setup();
    render(<ProjectDetailPage />);

    await user.click(screen.getByTestId('project-detail-tab-scheduled'));

    const section = await screen.findByTestId('project-schedules-section');
    expect(section).toHaveTextContent('Scheduled for Marketing launch (project-1)');
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
      expect(updateProjectRemote).toHaveBeenCalledWith('project-1', { iconEmoji: 'terminal' }),
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
      expect(updateProjectRemote).toHaveBeenCalledWith('project-1', { accentColor: 'sky' }),
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
