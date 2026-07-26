import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  organization: null as null | {
    id: string;
    name: string;
    slug: string;
    plan: string;
    memberCount: number;
    maxMembers: number | null;
    currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  },
  access: {
    plan: 'team',
    canManageTeam: true,
    maxMembers: null as number | null,
  },
  members: [] as Array<{
    id: string;
    userId: string;
    organizationId: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    role: 'owner' | 'admin' | 'member' | 'viewer';
    status: 'active';
    provisionedAt: string | null;
    joinedAt: string | null;
    lastActiveAt: string | null;
    permissions: string[];
    isCurrentUser: boolean;
  }>,
  create: vi.fn(),
  updateOrganization: vi.fn(),
  addMember: vi.fn(),
  updateRole: vi.fn(),
  removeMember: vi.fn(),
  inviteError: null as Error | null,
}));

vi.mock('../hooks/use-settings-queries', () => ({
  useOrganizationOverview: () => ({
    data: { organization: state.organization, access: state.access },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useTeamMembers: () => ({
    data: state.members,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateOrganization: () => ({
    mutate: state.create,
    isPending: false,
    error: null,
  }),
  useUpdateOrganizationSettings: () => ({
    mutate: state.updateOrganization,
    isPending: false,
    error: null,
  }),
  useInviteTeamMember: () => ({
    mutate: state.addMember,
    isPending: false,
    error: state.inviteError,
  }),
  useUpdateTeamMemberRole: () => ({
    mutate: state.updateRole,
    isPending: false,
    error: null,
  }),
  useRemoveTeamMember: () => ({
    mutate: state.removeMember,
    isPending: false,
    error: null,
  }),
}));

import { TeamSection } from './TeamSection';

describe('TeamSection', () => {
  beforeEach(() => {
    state.organization = null;
    state.access = { plan: 'team', canManageTeam: true, maxMembers: null };
    state.members = [];
    state.inviteError = null;
    vi.clearAllMocks();
  });

  it('lets an entitled user create their one real workspace', () => {
    render(<TeamSection />);

    fireEvent.change(screen.getByLabelText('Workspace name'), {
      target: { value: 'Demo Team' },
    });
    fireEvent.change(screen.getByLabelText('Workspace slug'), {
      target: { value: 'demo-team' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(state.create).toHaveBeenCalledWith({
      name: 'Demo Team',
      slug: 'demo-team',
    });
    expect(screen.queryByText(/SSO|SCIM/)).toBeNull();
  });

  it('shows an honest gated empty state to plans without team_admin', () => {
    state.access = { plan: 'max_15x', canManageTeam: false, maxMembers: null };

    render(<TeamSection />);

    expect(screen.getByText(/requires a provisioned Team or Enterprise plan/i)).toBeVisible();
    expect(screen.getByText(/Your current plan is Max 15x\./i)).toBeVisible();
    expect(screen.queryByText(/Max_15x/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create workspace' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Contact sales' })).toHaveAttribute(
      'href',
      '/contact-sales',
    );
  });

  it('renders real members and adds an existing AGI account without claiming email delivery', () => {
    state.organization = {
      id: 'org-1',
      name: 'Demo Team',
      slug: 'demo-team',
      plan: 'team',
      memberCount: 2,
      maxMembers: null,
      currentUserRole: 'owner',
    };
    state.members = [
      {
        id: 'org-1:owner',
        userId: 'owner',
        organizationId: 'org-1',
        email: 'owner@example.com',
        name: 'Owner',
        avatarUrl: null,
        role: 'owner',
        status: 'active',
        provisionedAt: null,
        joinedAt: '2026-07-25T00:00:00.000Z',
        lastActiveAt: null,
        permissions: [],
        isCurrentUser: true,
      },
    ];

    render(<TeamSection />);

    expect(screen.getByText('Owner')).toBeVisible();
    fireEvent.change(screen.getByLabelText('AGI account email'), {
      target: { value: 'member@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));

    expect(state.addMember).toHaveBeenCalledWith({
      organizationId: 'org-1',
      email: 'member@example.com',
      role: 'member',
    });
    expect(screen.getByText(/No invitation email is sent/i)).toBeVisible();
  });

  it('surfaces the actionable unknown-account error inline', () => {
    state.organization = {
      id: 'org-1',
      name: 'Demo Team',
      slug: 'demo-team',
      plan: 'team',
      memberCount: 1,
      maxMembers: null,
      currentUserRole: 'owner',
    };
    state.inviteError = new Error(
      'No AGI account uses that email. Ask them to create an AGI account, then try again. No invitation was sent.',
    );

    render(<TeamSection />);

    expect(screen.getByRole('alert')).toHaveTextContent('No invitation was sent');
  });

  it('uses wrapping form layouts that stay usable in a narrow settings dialog', () => {
    state.organization = {
      id: 'org-1',
      name: 'Demo Team',
      slug: 'demo-team',
      plan: 'team',
      memberCount: 1,
      maxMembers: null,
      currentUserRole: 'owner',
    };

    render(<TeamSection />);

    const detailsForm = screen.getByLabelText('Workspace name').closest('form');
    const addMemberForm = screen.getByLabelText('AGI account email').closest('form');

    expect(detailsForm?.style.gridTemplateColumns).toContain('auto-fit');
    expect(addMemberForm?.style.flexWrap).toBe('wrap');
  });
});
