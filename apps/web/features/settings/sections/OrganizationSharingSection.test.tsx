/**
 * OrganizationSharingSection — the org admin view of what is shared.
 *
 * The claims this file guards are honesty claims. A sharing screen that shows
 * mutation controls to a member who cannot use them, or that says a project is
 * "visible to N members" while N of them are explicitly denied, is the class of
 * dead-control / false-availability defect that must be caught here rather than
 * in production.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const {
  mockOverview,
  mockShareProject,
  mockUnshareProject,
  mockSetAccess,
  mockShareConnector,
  mockUnshareConnector,
} = vi.hoisted(() => ({
  mockOverview: vi.fn(),
  mockShareProject: vi.fn(),
  mockUnshareProject: vi.fn(),
  mockSetAccess: vi.fn(),
  mockShareConnector: vi.fn(),
  mockUnshareConnector: vi.fn(),
}));

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'token') }));

vi.mock('../hooks/use-settings-queries', () => ({
  useOrganizationSharedOverview: () => mockOverview(),
  useShareProjectWithOrganization: () => ({ mutate: mockShareProject, isPending: false }),
  useUnshareProjectFromOrganization: () => ({ mutate: mockUnshareProject, isPending: false }),
  useSetSharedProjectMemberAccess: () => ({ mutate: mockSetAccess, isPending: false }),
  useShareConnectorWithOrganization: () => ({ mutate: mockShareConnector, isPending: false }),
  useUnshareConnectorFromOrganization: () => ({ mutate: mockUnshareConnector, isPending: false }),
}));

import { OrganizationSharingSection } from './OrganizationSharingSection';

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '33333333-3333-4333-8333-333333333333';

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
            // A project reached THROUGH a share is not the caller's to re-share.
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
    // The connector's chat-facing id is surfaced so an admin can recognise it
    // in a transcript.
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
    mockOverview.mockReturnValue(overview({ currentUserRole: 'member', canManageSharing: false }));
    renderSection();

    // A dead control is worse than no control: a member who clicks "Stop
    // sharing" would get a 403 from a button the product offered them.
    expect(screen.queryByRole('button', { name: /stop sharing/i })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /project to share/i })).toBeNull();
    expect(
      screen.getByText(/Only an owner or admin can change what is shared/i),
    ).toBeInTheDocument();
    // The read view still renders — that is the point of a shared surface.
    expect(screen.getByText('Roadmap')).toBeInTheDocument();
  });

  it('offers only projects the caller owns and has not already shared', async () => {
    mockOverview.mockReturnValue(overview());
    renderSection();

    const picker = await screen.findByRole('combobox', { name: /project to share/i });
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'My notes' })).toBeInTheDocument(),
    );

    // 'Roadmap' is already shared AND is not the caller's own row.
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

  it('never renders a stored connector credential', () => {
    mockOverview.mockReturnValue(overview());
    const { container } = renderSection();
    expect(container.textContent).not.toMatch(/auth|token|secret/i);
  });
});
