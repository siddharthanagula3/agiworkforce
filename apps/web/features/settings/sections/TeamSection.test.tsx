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
  activeOrganizationId: null as string | null,
  workspaces: [] as Array<{
    id: string;
    name: string;
    slug: string;
    role: 'owner' | 'admin' | 'member' | 'viewer';
    joinedAt: string;
  }>,
  access: {
    plan: 'team',
    canManageTeam: true,
    maxMembers: null as number | null,
    seatsConsumed: null as number | null,
    seatsAvailable: null as number | null,
    seatSource: 'unknown' as 'billing' | 'unprovisioned' | 'unknown',
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
  switchWorkspace: vi.fn(),
  updateOrganization: vi.fn(),
  createInvitation: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  leaveOrganization: vi.fn(),
  updateRole: vi.fn(),
  removeMember: vi.fn(),
  inviteError: null as Error | null,
  invitations: [] as Array<{
    id: string;
    organizationId: string;
    email: string;
    role: 'admin' | 'member' | 'viewer';
    status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
    invitedByUserId: string;
    acceptedByUserId: string | null;
    expiresAt: string;
    resentAt: string | null;
    resendCount: number;
    createdAt: string;
    updatedAt: string;
  }>,
}));

vi.mock('../hooks/use-settings-queries', () => ({
  useOrganizationOverview: () => ({
    data: {
      organization: state.organization,
      activeOrganizationId: state.activeOrganizationId,
      workspaces: state.workspaces,
      access: state.access,
    },
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
  useTeamInvitations: () => ({
    data: {
      invitations: state.invitations,
      seats: {
        organizationId: 'org-1',
        licensedSeats: state.access.maxMembers ?? 2,
        seatsConsumed: state.access.seatsConsumed ?? 1,
        seatsAvailable: state.access.seatsAvailable ?? 1,
        seatSource: state.access.seatSource === 'billing' ? 'billing' : 'unprovisioned',
        ownerUserId: 'owner',
      },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateOrganization: () => ({
    mutate: state.create,
    isPending: false,
    error: null,
  }),
  useSwitchWorkspace: () => ({
    mutate: state.switchWorkspace,
    isPending: false,
    error: null,
  }),
  useUpdateOrganizationSettings: () => ({
    mutate: state.updateOrganization,
    isPending: false,
    error: null,
  }),
  useCreateTeamInvitation: () => ({
    mutate: state.createInvitation,
    isPending: false,
    error: state.inviteError,
  }),
  useResendTeamInvitation: () => ({
    mutate: state.resendInvitation,
    isPending: false,
    error: null,
  }),
  useRevokeTeamInvitation: () => ({
    mutate: state.revokeInvitation,
    isPending: false,
    error: null,
  }),
  useLeaveOrganization: () => ({
    mutate: state.leaveOrganization,
    isPending: false,
    error: null,
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

vi.mock('./team/SSOPanel', () => ({ SSOPanel: () => null }));

import { TeamSection } from './TeamSection';
import { SettingsSectionNavigationProvider } from '../components/SettingsSectionLink';

describe('TeamSection', () => {
  beforeEach(() => {
    state.organization = null;
    state.activeOrganizationId = null;
    state.workspaces = [];
    state.access = {
      plan: 'team',
      canManageTeam: true,
      maxMembers: null,
      seatsConsumed: null,
      seatsAvailable: null,
      seatSource: 'unknown',
    };
    state.members = [];
    state.invitations = [];
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

  it('switches among Personal and every membership without conflating membership with ownership', () => {
    state.workspaces = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Invited Team',
        slug: 'invited-team',
        role: 'member',
        joinedAt: '2026-08-11T00:00:00.000Z',
      },
    ];

    render(<TeamSection />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Active workspace' }), {
      target: { value: '11111111-1111-4111-8111-111111111111' },
    });

    expect(state.switchWorkspace).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(screen.getByRole('option', { name: 'Invited Team · Member' })).toBeVisible();
  });

  it('renders the workspace picker as a label-left row, not a titled card', () => {
    state.workspaces = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Invited Team',
        slug: 'invited-team',
        role: 'member',
        joinedAt: '2026-08-11T00:00:00.000Z',
      },
    ];

    render(<TeamSection />);

    expect(screen.getByText('Workspace')).toBeVisible();
    expect(screen.queryByText('Active workspace')).toBeNull();
    expect(screen.queryByText(/Switching reloads tenant-owned/)).toBeNull();
  });

  it('shows the plan gate as one muted line instead of a bordered notice', () => {
    state.organization = {
      id: 'org-1',
      name: 'Demo Team',
      slug: 'demo-team',
      plan: 'free',
      memberCount: 1,
      maxMembers: null,
      currentUserRole: 'owner',
    };
    state.access = {
      plan: 'free',
      canManageTeam: false,
      maxMembers: null,
      seatsConsumed: null,
      seatsAvailable: null,
      seatSource: 'unknown',
    };

    render(<TeamSection />);

    const notice = screen.getByText(/This workspace is on the Free plan/i);
    expect(notice.tagName).toBe('P');
    expect(notice.closest('[role="alert"]')).toBe(notice);
  });

  it('shows an honest gated empty state to plans without team_admin', () => {
    state.access = {
      plan: 'max_15x',
      canManageTeam: false,
      maxMembers: null,
      seatsConsumed: null,
      seatsAvailable: null,
      seatSource: 'unknown',
    };

    const onExit = vi.fn();
    render(
      <SettingsSectionNavigationProvider onNavigate={vi.fn()} onExit={onExit}>
        <TeamSection />
      </SettingsSectionNavigationProvider>,
    );

    expect(screen.getByText(/requires a Team or Enterprise plan/i)).toBeVisible();
    expect(screen.getByText(/Choose at least 2 Team seats/i)).toBeVisible();
    expect(screen.getByText(/Your current plan is Max 15x\./i)).toBeVisible();
    expect(screen.queryByText(/Max_15x/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create workspace' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Choose Team seats' })).toHaveAttribute(
      'href',
      '/pricing#pricing-team-title',
    );
    document.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(screen.getByRole('link', { name: 'Choose Team seats' }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('renders real members and creates a private invitation without claiming email delivery', () => {
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
    fireEvent.change(screen.getByLabelText('Invitee email'), {
      target: { value: 'member@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }));

    expect(state.createInvitation).toHaveBeenCalledWith(
      {
        organizationId: 'org-1',
        email: 'member@example.com',
        role: 'member',
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.getByText(/No email is sent yet/i)).toBeVisible();
  });

  it('surfaces an invitation error inline', () => {
    state.organization = {
      id: 'org-1',
      name: 'Demo Team',
      slug: 'demo-team',
      plan: 'team',
      memberCount: 1,
      maxMembers: null,
      currentUserRole: 'owner',
    };
    state.inviteError = new Error('An invitation for that address is already pending.');

    render(<TeamSection />);

    expect(screen.getByRole('alert')).toHaveTextContent('already pending');
  });

  it('shows billing-backed available seats and manages a pending invitation', () => {
    state.organization = {
      id: 'org-1',
      name: 'Demo Team',
      slug: 'demo-team',
      plan: 'team',
      memberCount: 2,
      maxMembers: 5,
      currentUserRole: 'owner',
    };
    state.access = {
      plan: 'team',
      canManageTeam: true,
      maxMembers: 5,
      seatsConsumed: 3,
      seatsAvailable: 2,
      seatSource: 'billing',
    };
    state.invitations = [
      {
        id: 'invite-1',
        organizationId: 'org-1',
        email: 'pending@example.com',
        role: 'viewer',
        status: 'pending',
        invitedByUserId: 'owner',
        acceptedByUserId: null,
        expiresAt: '2026-08-18T00:00:00.000Z',
        resentAt: null,
        resendCount: 0,
        createdAt: '2026-08-11T00:00:00.000Z',
        updatedAt: '2026-08-11T00:00:00.000Z',
      },
    ];

    render(<TeamSection />);

    expect(screen.getByText('Licensed').nextSibling).toHaveTextContent('5');
    expect(screen.getByText('In use').nextSibling).toHaveTextContent('3');
    expect(screen.getByText('Available').nextSibling).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: 'Change seats' })).toHaveAttribute(
      'href',
      '/pricing?seats=5#pricing-team-title',
    );
    expect(screen.getByText('pending@example.com')).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Renew invitation for pending@example.com' }),
    );
    expect(state.resendInvitation).toHaveBeenCalledWith(
      { organizationId: 'org-1', invitationId: 'invite-1' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Revoke invitation for pending@example.com' }),
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent('reserved seat becomes available');
    fireEvent.click(screen.getByRole('button', { name: 'Revoke invitation' }));
    expect(state.revokeInvitation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      invitationId: 'invite-1',
    });
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
    const addMemberForm = screen.getByLabelText('Invitee email').closest('form');

    expect(detailsForm?.style.gridTemplateColumns).toContain('auto-fit');
    expect(addMemberForm?.style.flexWrap).toBe('wrap');
  });

  it('lets a non-owner safely leave and explains that the seat is released', () => {
    state.organization = {
      id: 'org-1',
      name: 'Demo Team',
      slug: 'demo-team',
      plan: 'team',
      memberCount: 2,
      maxMembers: 5,
      currentUserRole: 'member',
    };

    render(<TeamSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Leave workspace' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('seat becomes available');
    fireEvent.click(screen.getByRole('button', { name: 'Leave workspace' }));
    expect(state.leaveOrganization).toHaveBeenCalledWith({});
  });

  it('transfers ownership and leaves atomically from the owner UI', () => {
    state.organization = {
      id: 'org-1',
      name: 'Demo Team',
      slug: 'demo-team',
      plan: 'team',
      memberCount: 2,
      maxMembers: 5,
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
        joinedAt: null,
        lastActiveAt: null,
        permissions: [],
        isCurrentUser: true,
      },
      {
        id: 'org-1:successor',
        userId: 'successor',
        organizationId: 'org-1',
        email: 'successor@example.com',
        name: 'Successor',
        avatarUrl: null,
        role: 'admin',
        status: 'active',
        provisionedAt: null,
        joinedAt: null,
        lastActiveAt: null,
        permissions: [],
        isCurrentUser: false,
      },
    ];

    render(<TeamSection />);

    const leaveButton = screen.getByRole('button', { name: 'Transfer ownership and leave' });
    expect(leaveButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('New workspace owner'), {
      target: { value: 'successor' },
    });
    expect(leaveButton).toBeEnabled();
    fireEvent.click(leaveButton);
    fireEvent.click(screen.getByRole('button', { name: 'Transfer and leave' }));
    expect(state.leaveOrganization).toHaveBeenCalledWith({ successorUserId: 'successor' });
  });
});
