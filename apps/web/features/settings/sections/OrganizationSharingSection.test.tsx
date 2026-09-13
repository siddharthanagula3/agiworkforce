import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const {
  mockOverview,
  mockShareProject,
  mockUnshareProject,
  mockSetAccess,
  mockShareConnector,
  mockUnshareConnector,
  mockUnshareArtifact,
} = vi.hoisted(() => ({
  mockOverview: vi.fn(),
  mockShareProject: vi.fn(),
  mockUnshareProject: vi.fn(),
  mockSetAccess: vi.fn(),
  mockShareConnector: vi.fn(),
  mockUnshareConnector: vi.fn(),
  mockUnshareArtifact: vi.fn(),
}));

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'token') }));

vi.mock('../hooks/use-settings-queries', () => ({
  useOrganizationSharedOverview: () => mockOverview(),
  useShareProjectWithOrganization: () => ({ mutate: mockShareProject, isPending: false }),
  useUnshareProjectFromOrganization: () => ({ mutate: mockUnshareProject, isPending: false }),
  useSetSharedProjectMemberAccess: () => ({ mutate: mockSetAccess, isPending: false }),
  useShareConnectorWithOrganization: () => ({ mutate: mockShareConnector, isPending: false }),
  useUnshareConnectorFromOrganization: () => ({ mutate: mockUnshareConnector, isPending: false }),
  useUnshareArtifactFromOrganization: () => ({ mutate: mockUnshareArtifact, isPending: false }),
}));

import { OrganizationSharingSection } from './OrganizationSharingSection';

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const ARTIFACT = '55555555-5555-4555-8555-555555555555';

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrganizationSharingSection />
    </QueryClientProvider>,
  );
}

function overview(overrides: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isError: false,
    error: null,
    data: {
      organizationId: ORG,
      currentUserId: 'user-owner',
      currentUserRole: 'admin',
      canManageSharing: true,
      members: [
        { userId: 'user-owner', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' },
        { userId: 'user-member', role: 'member', joinedAt: '2026-01-02T00:00:00.000Z' },
      ],
      sharedProjects: [
        {
          projectId: PROJECT,
          organizationId: ORG,
          name: 'Roadmap',
          ownerUserId: 'user-owner',
          sharedByUserId: 'user-owner',
          defaultAccess: 'read',
          createdAt: '2026-01-03T00:00:00.000Z',
          memberGrants: [],
        },
      ],
      sharedConnectors: [
        {
          organizationId: ORG,
          connectorRowId: '44444444-4444-4444-8444-444444444444',
          orgShortId: 'a1b2c3d4e5',
          name: 'Jira',
          url: 'https://mcp.example.com/sse',
          transport: 'sse',
          ownerUserId: 'user-owner',
          sharedByUserId: 'user-owner',
          createdAt: '2026-01-03T00:00:00.000Z',
        },
      ],
      sharedArtifacts: [
        {
          organizationId: ORG,
          publishedArtifactId: ARTIFACT,
          token: 'AAAAAAAAAAAAAAAAAAAAAAAA',
          artifactId: 'artifact-1',
          title: 'Quarterly plan',
          kind: 'markdown',
          visibility: 'organization',
          ownerUserId: 'user-owner',
          sharedByUserId: 'user-owner',
          createdAt: '2026-01-03T00:00:00.000Z',
        },
      ],
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/projects')) {
      return new Response(
        JSON.stringify({
          projects: [
            { id: 'own-project', name: 'My notes', isOrgShared: false },
            { id: PROJECT, name: 'Roadmap', isOrgShared: true },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ connectors: [{ id: 'own-connector', name: 'Linear' }] }), {
      status: 200,
    });
  }) as unknown as typeof fetch;
});

describe('OrganizationSharingSection', () => {
  it('tells a personal account how to get an organization instead of showing an error', () => {
    mockOverview.mockReturnValue({ isLoading: false, isError: false, error: null, data: null });
    renderSection();
    expect(screen.getByText(/not in an organization yet/i)).toBeInTheDocument();
  });

  it('lists what is shared and states that sharing is read-only', () => {
    mockOverview.mockReturnValue(overview());
    renderSection();

    expect(screen.getByText('Roadmap')).toBeInTheDocument();
    expect(screen.getByText(/Read-only · visible to 2 of 2 members/)).toBeInTheDocument();
    expect(screen.getByText(/orgmcp-a1b2c3d4e5/)).toBeInTheDocument();
  });

  it('counts an explicitly denied member as NOT able to see the project', () => {
    mockOverview.mockReturnValue(
      overview({
        sharedProjects: [
          {
            projectId: PROJECT,
            organizationId: ORG,
            name: 'Roadmap',
            ownerUserId: 'user-owner',
            sharedByUserId: 'user-owner',
            defaultAccess: 'read',
            createdAt: '2026-01-03T00:00:00.000Z',
            memberGrants: [{ userId: 'user-member', access: 'none' }],
          },
        ],
      }),
    );
    renderSection();
    expect(screen.getByText(/visible to 1 of 2 members/)).toBeInTheDocument();
  });

  it('hides every mutation control from a member who cannot manage sharing', () => {
    mockOverview.mockReturnValue(
      overview({
        currentUserId: 'user-member',
        currentUserRole: 'member',
        canManageSharing: false,
      }),
    );
    renderSection();

    expect(screen.queryByRole('button', { name: /stop sharing/i })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /project to share/i })).toBeNull();
    expect(
      screen.getByText(/Only an owner or admin can change what is shared/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Roadmap')).toBeInTheDocument();
  });

  it('offers only projects the caller owns and has not already shared', async () => {
    mockOverview.mockReturnValue(overview());
    renderSection();

    const picker = await screen.findByRole('combobox', { name: /project to share/i });
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'My notes' })).toBeInTheDocument(),
    );

    expect(screen.queryByRole('option', { name: 'Roadmap' })).toBeNull();
    expect(picker).toBeInTheDocument();
  });

  it('shares the selected project through the mutation', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue(overview());
    renderSection();

    const picker = await screen.findByRole('combobox', { name: /project to share/i });
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'My notes' })).toBeInTheDocument(),
    );
    await user.selectOptions(picker, 'own-project');
    await user.click(screen.getByRole('button', { name: /share project with organization/i }));

    expect(mockShareProject).toHaveBeenCalledWith('own-project', expect.anything());
  });

  it('denies one member with an explicit `none`, not by un-sharing for everyone', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue(overview());
    renderSection();

    const control = await screen.findByLabelText('user-member (member)');
    await user.selectOptions(control, 'none');

    expect(mockSetAccess).toHaveBeenCalledWith({
      projectId: PROJECT,
      userId: 'user-member',
      access: 'none',
    });
    expect(mockUnshareProject).not.toHaveBeenCalled();
  });

  it('asks before un-sharing a project, naming the members who lose access', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue(overview());
    renderSection();

    const [stopProject] = screen.getAllByRole('button', { name: /stop sharing/i });
    await user.click(stopProject!);

    expect(mockUnshareProject).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Stop sharing Roadmap?');
    expect(dialog).toHaveTextContent('Everyone in this organization (2 members) loses access');

    await user.click(screen.getByRole('button', { name: 'Stop sharing' }));
    await waitFor(() => expect(mockUnshareProject).toHaveBeenCalledWith(PROJECT));
  });

  it('asks before un-sharing a connector, naming what stops working', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue(overview());
    renderSection();

    const stopConnector = screen.getAllByRole('button', { name: /stop sharing/i }).at(-1);
    await user.click(stopConnector!);

    expect(mockUnshareConnector).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Stop sharing Jira?');
    expect(dialog).toHaveTextContent('loses orgmcp-a1b2c3d4e5 in chat');

    await user.click(screen.getByRole('button', { name: 'Stop sharing' }));
    await waitFor(() =>
      expect(mockUnshareConnector).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444'),
    );
  });

  it('leaves the sharing untouched when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue(overview());
    renderSection();

    const [stopProject] = screen.getAllByRole('button', { name: /stop sharing/i });
    await user.click(stopProject!);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(mockUnshareProject).not.toHaveBeenCalled();
  });

  it('never renders a stored connector credential', () => {
    mockOverview.mockReturnValue(overview());
    const { container } = renderSection();
    expect(container.textContent).not.toMatch(/auth|token|secret/i);
  });
});

describe('shared artifacts', () => {
  it('lists what the workspace can open and says the public link is closed', async () => {
    mockOverview.mockReturnValue(overview());

    renderSection();

    expect(await screen.findByText('Quarterly plan')).toBeInTheDocument();
    expect(screen.getByText(/Workspace only/)).toBeInTheDocument();
  });

  it('names who loses access before it stops sharing, and does not promise a public link', async () => {
    mockOverview.mockReturnValue(overview());
    const user = userEvent.setup();

    renderSection();

    const card = (await screen.findByText('Quarterly plan')).closest('li') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Stop sharing' }));

    expect(await screen.findByText(/Stop sharing Quarterly plan\?/)).toBeInTheDocument();
    expect(screen.getByText(/loses access to this artifact/)).toBeInTheDocument();
    expect(screen.getByText(/not made public in its place/)).toBeInTheDocument();
    expect(mockUnshareArtifact).not.toHaveBeenCalled();
  });

  it('withdraws the share only after the confirmation is accepted', async () => {
    mockOverview.mockReturnValue(overview());
    const user = userEvent.setup();

    renderSection();

    const card = (await screen.findByText('Quarterly plan')).closest('li') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Stop sharing' }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Stop sharing' }));

    await waitFor(() => expect(mockUnshareArtifact).toHaveBeenCalledWith(ARTIFACT));
  });

  it('lets a plain member withdraw an artifact they published themselves', async () => {
    mockOverview.mockReturnValue(
      overview({
        currentUserId: 'user-owner',
        currentUserRole: 'member',
        canManageSharing: false,
      }),
    );

    renderSection();

    const card = (await screen.findByText('Quarterly plan')).closest('li') as HTMLElement;
    expect(within(card).getByRole('button', { name: 'Stop sharing' })).toBeInTheDocument();
  });

  it('tells a workspace with nothing shared where artifacts come from', async () => {
    mockOverview.mockReturnValue(overview({ sharedArtifacts: [] }));

    renderSection();

    expect(await screen.findByText(/No artifacts are shared yet/)).toBeInTheDocument();
  });
});
