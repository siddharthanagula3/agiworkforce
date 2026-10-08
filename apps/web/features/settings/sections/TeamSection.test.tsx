import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SeatPaymentError = vi.hoisted(
  () =>
    class SeatTypePaymentRequiredError extends Error {
      readonly paymentUrl: string | null;
      constructor(message: string, paymentUrl: string | null) {
        super(message);
        this.paymentUrl = paymentUrl;
      }
    },
);

const state = vi.hoisted(() => ({
  seatDataAvailable: true,
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
    seatType?: 'standard' | 'premium';
    premiumPaidThrough?: string | null;
  }>,
  seatTypes: null as null | {
    licensedPremiumSeats: number;
    premiumSeatsAssigned: number;
    billing: { interval: 'monthly' | 'yearly'; currency: string; premiumSeatsSold: boolean };
  },
  updateSeatType: vi.fn(async () => ({})),
  seatError: null as Error | null,
  create: vi.fn(),
  switchWorkspace: vi.fn(),
  updateOrganization: vi.fn(),
  createInvitation: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  leaveOrganization: vi.fn(),
  updateRole: vi.fn(),
  removeMember: vi.fn(),
  transferOwnership: vi.fn(),
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
  useTeamSeatTypes: () => ({
    data: state.seatTypes,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  SeatTypePaymentRequiredError: SeatPaymentError,
  useUpdateTeamMemberSeatType: () => ({
    mutate: state.updateSeatType,
    mutateAsync: state.updateSeatType,
    isPending: false,
    error: state.seatError,
  }),
  useTeamInvitations: () => ({
    data: {
      invitations: state.invitations,
      seats: state.seatDataAvailable
        ? {
            organizationId: 'org-1',
            licensedSeats: state.access.maxMembers ?? 2,
            seatsConsumed: state.access.seatsConsumed ?? 1,
            seatsAvailable: state.access.seatsAvailable ?? 1,
            seatSource: state.access.seatSource === 'billing' ? 'billing' : 'unprovisioned',
            ownerUserId: 'owner',
          }
        : null,
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
  useTransferOrganizationOwnership: () => ({
    mutate: state.transferOwnership,
    mutateAsync: state.transferOwnership,
    isPending: false,
    error: null,
    stepUpDialog: <div data-testid="transfer-step-up-dialog" />,
  }),
}));

vi.mock('./team/SSOPanel', () => ({ SSOPanel: () => null }));

import { useChatStore } from '@shared/stores/web-chat-store';
import { TeamSection } from './TeamSection';
import { SettingsSectionNavigationProvider } from '../components/SettingsSectionLink';

describe('TeamSection', () => {
  beforeEach(() => {
    state.seatDataAvailable = true;
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
    state.seatTypes = null;
    state.seatError = null;
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

  it('names unsent work and waits for a decision before switching away from it', async () => {
    state.workspaces = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Invited Team',
        slug: 'invited-team',
        role: 'member',
        joinedAt: '2026-08-11T00:00:00.000Z',
      },
    ];
    useChatStore.setState({ draftsByConversation: { 'conv-1': 'half a question' } });
    try {
      render(<TeamSection />);

      fireEvent.change(screen.getByRole('combobox', { name: 'Active workspace' }), {
        target: { value: '11111111-1111-4111-8111-111111111111' },
      });

      expect(await screen.findByText(/You have an unsent message\./)).toBeVisible();
      expect(state.switchWorkspace).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Stay in this workspace' }));
      expect(state.switchWorkspace).not.toHaveBeenCalled();

      fireEvent.change(screen.getByRole('combobox', { name: 'Active workspace' }), {
        target: { value: '11111111-1111-4111-8111-111111111111' },
      });
      fireEvent.click(await screen.findByRole('button', { name: 'Switch anyway' }));
      await waitFor(() =>
        expect(state.switchWorkspace).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111'),
      );
    } finally {
      useChatStore.setState({ draftsByConversation: {} });
    }
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

    // The page heading is also "Workspace" since the one-vocabulary rename, so
    // the picker is identified by the label bound to its own control.
    const picker = screen.getByRole('combobox', { name: 'Active workspace' });
    const label = document.querySelector<HTMLLabelElement>(`label[for="${picker.id}"]`);
    expect(label).toHaveTextContent('Workspace');
    const row = label!.parentElement!;
    expect(row).toHaveStyle({ display: 'flex', alignItems: 'center' });
    expect(row).toContainElement(picker);
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
    expect(screen.getByText(/Your current plan is Max 20x\./i)).toBeVisible();
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
    expect(screen.queryByText(/No email is sent yet/i)).toBeNull();
  });

  it.each([
    [
      { emailSent: true as const },
      'An invitation email was sent to member@example.com. This link does the same thing if it does not arrive.',
    ],
    [
      {
        emailSent: false as const,
        reason: 'No transactional email provider is configured. Send the link yourself.',
      },
      'No transactional email provider is configured. Send the link yourself.',
    ],
  ])('says whether the invitation email went out: %o', (delivery, sentence) => {
    state.organization = {
      id: 'org-1',
      name: 'Demo Team',
      slug: 'demo-team',
      plan: 'team',
      memberCount: 1,
      maxMembers: null,
      currentUserRole: 'owner',
    };
    state.createInvitation.mockImplementation(
      (_input: unknown, options: { onSuccess: (result: unknown) => void }) =>
        options.onSuccess({
          invitation: { id: 'inv-1' },
          inviteToken: 'x'.repeat(32),
          delivery,
        }),
    );

    render(<TeamSection />);
    fireEvent.change(screen.getByLabelText('Invitee email'), {
      target: { value: 'member@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }));

    expect(screen.getByText(sentence)).toBeVisible();
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

  it('routes contract-priced workspace seat changes to the existing contract page', () => {
    state.organization = {
      id: 'org-1',
      name: 'Enterprise',
      slug: 'enterprise',
      plan: 'enterprise',
      memberCount: 1,
      maxMembers: 1,
      currentUserRole: 'owner',
    };
    state.access.plan = 'enterprise';
    render(<TeamSection />);
    expect(screen.getByRole('link', { name: 'Review contract' })).toHaveAttribute(
      'href',
      '/workspace/billing',
    );
    expect(screen.queryByRole('link', { name: 'Change seats' })).toBeNull();
  });

  it('names unknown seat values instead of showing punctuation as a value', () => {
    state.organization = {
      id: 'org-1',
      name: 'Enterprise',
      slug: 'enterprise',
      plan: 'enterprise',
      memberCount: 1,
      maxMembers: null,
      currentUserRole: 'owner',
    };
    state.seatDataAvailable = false;
    render(<TeamSection />);
    expect(screen.getByText('Licensed').nextSibling).toHaveTextContent('Not set');
    expect(screen.getByText('In use').nextSibling).toHaveTextContent('Unavailable');
    expect(screen.getByText('Available').nextSibling).toHaveTextContent('Unknown');
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

  function renderAsOwnerWithMember() {
    state.organization = {
      id: 'org-1',
      name: 'Acme',
      slug: 'acme',
      plan: 'team',
      memberCount: 2,
      maxMembers: null,
      currentUserRole: 'owner',
    };
    state.members = [
      {
        id: 'm-1',
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
        id: 'm-2',
        userId: 'successor',
        organizationId: 'org-1',
        email: 'successor@example.com',
        name: 'Successor',
        avatarUrl: null,
        role: 'member',
        status: 'active',
        provisionedAt: null,
        joinedAt: null,
        lastActiveAt: null,
        permissions: [],
        isCurrentUser: false,
      },
    ];
    render(<TeamSection />);
  }

  it('transfers ownership without leaving, and keeps the outgoing role the owner picked', () => {
    renderAsOwnerWithMember();

    const submit = screen.getByTestId('transfer-ownership-submit');
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByTestId('transfer-ownership-member'), {
      target: { value: 'successor' },
    });
    fireEvent.change(screen.getByTestId('transfer-ownership-outgoing-role'), {
      target: { value: 'viewer' },
    });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }));

    expect(state.transferOwnership).toHaveBeenCalledWith({
      organizationId: 'org-1',
      toUserId: 'successor',
      outgoingOwnerRole: 'viewer',
    });
    expect(state.leaveOrganization).not.toHaveBeenCalled();
  });

  it('mounts the step-up challenge, which the 403 has no other way to reach', () => {
    renderAsOwnerWithMember();

    expect(screen.getByTestId('transfer-step-up-dialog')).toBeInTheDocument();
  });

  it('names who gains what and what the owner loses before transferring', () => {
    renderAsOwnerWithMember();

    fireEvent.change(screen.getByTestId('transfer-ownership-member'), {
      target: { value: 'successor' },
    });
    fireEvent.click(screen.getByTestId('transfer-ownership-submit'));

    const description = screen.getByText(/becomes the owner of Acme/i);
    expect(description.textContent).toContain('Successor');
    expect(description.textContent).toContain('billing');
    expect(description.textContent).toContain('You become Admin');
    expect(state.transferOwnership).not.toHaveBeenCalled();
  });

  it('lets the ownership fields stack instead of holding the pane open at 390', () => {
    // The pane's own container is a grid column that cannot shrink below its
    // widest child's min-content. A bare minmax(220px, 1fr) put a 454px floor
    // under this card, which held the whole Team pane at 496px inside 348px and
    // pushed every heading off a phone. min(220px, 100%) lets the track fall to
    // the container width, so the two fields stack.
    renderAsOwnerWithMember();

    const field = screen.getByTestId('transfer-ownership-member');
    const grid = field.closest('div[style*="grid-template-columns"]');
    expect(grid, 'the two ownership fields should share one grid').not.toBeNull();

    const columns = (grid as HTMLElement).style.gridTemplateColumns;
    expect(columns).toContain('min(220px, 100%)');
    expect(
      columns,
      'a bare pixel floor cannot shrink, which is what broke the phone width',
    ).not.toMatch(/minmax\(\s*220px/);
  });

  it('gives the owner a way to reach workspace deletion, and says what it costs', () => {
    state.organization = {
      id: 'org-1',
      name: 'Acme',
      slug: 'acme',
      plan: 'team',
      memberCount: 12,
      maxMembers: null,
      currentUserRole: 'owner',
    };

    render(<TeamSection />);

    const link = screen.getByRole('link', { name: 'Delete workspace' });
    expect(link).toHaveAttribute('href', '/admin/workspace-deletion');
    expect(screen.getByText(/for all 12 members/)).toBeVisible();
    expect(screen.getByText(/cancel there until the scheduled date/)).toBeVisible();
  });

  it('does not offer deletion to an admin who does not own the workspace', () => {
    state.organization = {
      id: 'org-1',
      name: 'Acme',
      slug: 'acme',
      plan: 'team',
      memberCount: 12,
      maxMembers: null,
      currentUserRole: 'admin',
    };

    render(<TeamSection />);

    expect(screen.queryByRole('link', { name: 'Delete workspace' })).toBeNull();
  });

  it('never offers the transfer to a member who is not the owner', () => {
    state.organization = {
      id: 'org-1',
      name: 'Acme',
      slug: 'acme',
      plan: 'team',
      memberCount: 2,
      maxMembers: null,
      currentUserRole: 'admin',
    };
    state.members = [];

    render(<TeamSection />);

    expect(screen.queryByTestId('transfer-ownership-submit')).toBeNull();
  });

  describe('seat types', () => {
    function teamWorkspace(role: 'owner' | 'admin' | 'member') {
      state.organization = {
        id: 'org-1',
        name: 'Acme',
        slug: 'acme',
        plan: 'team',
        memberCount: 2,
        maxMembers: 4,
        currentUserRole: role,
      };
      state.access = { ...state.access, maxMembers: 4, seatsConsumed: 2, seatsAvailable: 2 };
      state.members = [
        seatMember('owner-1', 'Ada Owner', 'owner', 'standard', role === 'owner'),
        seatMember('member-1', 'Grace Member', 'member', 'standard', role !== 'owner'),
      ];
    }

    function seatMember(
      userId: string,
      name: string,
      role: 'owner' | 'admin' | 'member',
      seatType: 'standard' | 'premium',
      isCurrentUser: boolean,
    ) {
      return {
        id: `org-1:${userId}`,
        userId,
        organizationId: 'org-1',
        email: `${userId}@example.com`,
        name,
        avatarUrl: null,
        role,
        status: 'active' as const,
        provisionedAt: null,
        joinedAt: '2026-10-01T00:00:00.000Z',
        lastActiveAt: null,
        permissions: [],
        isCurrentUser,
        seatType,
        premiumPaidThrough: null,
      };
    }

    function sellPremiumSeats(overrides: Partial<NonNullable<typeof state.seatTypes>> = {}): void {
      state.seatTypes = {
        licensedPremiumSeats: 0,
        premiumSeatsAssigned: 0,
        billing: { interval: 'monthly', currency: 'usd', premiumSeatsSold: true },
        ...overrides,
      };
    }

    it('names the price change and waits for the answer before a Premium seat is charged', async () => {
      teamWorkspace('owner');
      sellPremiumSeats();
      render(<TeamSection />);

      fireEvent.change(screen.getByRole('combobox', { name: 'Seat type for Grace Member' }), {
        target: { value: 'premium' },
      });

      expect(await screen.findByText('Move Grace Member to a Premium seat?')).toBeVisible();
      expect(
        screen.getByText(/This seat changes from \$25\/month to \$125\/month\./),
      ).toBeVisible();
      expect(screen.getByText(/charged to the workspace payment method now/)).toBeVisible();
      expect(state.updateSeatType).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Keep Standard seat' }));
      expect(state.updateSeatType).not.toHaveBeenCalled();

      fireEvent.change(screen.getByRole('combobox', { name: 'Seat type for Grace Member' }), {
        target: { value: 'premium' },
      });
      fireEvent.click(await screen.findByRole('button', { name: 'Move to Premium' }));

      await waitFor(() =>
        expect(state.updateSeatType).toHaveBeenCalledWith({
          memberId: 'org-1:member-1',
          organizationId: 'org-1',
          seatType: 'premium',
        }),
      );
    });

    it('quotes yearly prices to a workspace billed yearly', async () => {
      teamWorkspace('owner');
      sellPremiumSeats({
        billing: { interval: 'yearly', currency: 'usd', premiumSeatsSold: true },
      });
      render(<TeamSection />);

      fireEvent.change(screen.getByRole('combobox', { name: 'Seat type for Grace Member' }), {
        target: { value: 'premium' },
      });

      expect(
        await screen.findByText(/This seat changes from \$240\/year to \$1,200\/year\./),
      ).toBeVisible();
    });

    it('says nothing more is charged when a paid Premium seat is unassigned', async () => {
      teamWorkspace('owner');
      sellPremiumSeats({ licensedPremiumSeats: 2, premiumSeatsAssigned: 1 });
      render(<TeamSection />);

      fireEvent.change(screen.getByRole('combobox', { name: 'Seat type for Grace Member' }), {
        target: { value: 'premium' },
      });

      expect(
        await screen.findByText(/already pays for 1 Premium seat that is not assigned/),
      ).toBeVisible();
      expect(screen.getByText(/nothing more is charged/)).toBeVisible();
    });

    it('says a move to Standard keeps Premium usage until the paid period ends, with no refund', async () => {
      teamWorkspace('owner');
      sellPremiumSeats({ licensedPremiumSeats: 1, premiumSeatsAssigned: 1 });
      state.members = [
        seatMember('owner-1', 'Ada Owner', 'owner', 'standard', true),
        seatMember('member-1', 'Grace Member', 'member', 'premium', false),
      ];
      render(<TeamSection />);

      fireEvent.change(screen.getByRole('combobox', { name: 'Seat type for Grace Member' }), {
        target: { value: 'standard' },
      });

      expect(await screen.findByText('Move Grace Member to a Standard seat?')).toBeVisible();
      expect(
        screen.getByText(
          /billed \$25\/month instead of \$125\/month\. The current billing period is not refunded/,
        ),
      ).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Move to Standard' }));
      await waitFor(() =>
        expect(state.updateSeatType).toHaveBeenCalledWith(
          expect.objectContaining({ memberId: 'org-1:member-1', seatType: 'standard' }),
        ),
      );
    });

    it('lets an admin assign only a Premium seat that is already paid for', () => {
      teamWorkspace('admin');
      state.members = [
        seatMember('owner-1', 'Ada Owner', 'owner', 'premium', false),
        seatMember('member-1', 'Grace Member', 'member', 'standard', false),
        seatMember('admin-1', 'Alan Admin', 'admin', 'standard', true),
      ];
      sellPremiumSeats({ licensedPremiumSeats: 1, premiumSeatsAssigned: 1 });
      const { unmount } = render(<TeamSection />);

      expect(screen.getByRole('combobox', { name: 'Seat type for Grace Member' })).toBeDisabled();
      expect(screen.getByRole('combobox', { name: 'Seat type for Alan Admin' })).toBeDisabled();
      expect(screen.getByRole('combobox', { name: 'Seat type for Ada Owner' })).toBeDisabled();
      expect(screen.getByRole('combobox', { name: 'Seat type for Grace Member' })).toHaveAttribute(
        'title',
        expect.stringContaining('Only the workspace owner'),
      );
      unmount();

      sellPremiumSeats({ licensedPremiumSeats: 2, premiumSeatsAssigned: 1 });
      render(<TeamSection />);

      expect(screen.getByRole('combobox', { name: 'Seat type for Grace Member' })).toBeEnabled();
      expect(screen.getByRole('combobox', { name: 'Seat type for Ada Owner' })).toBeDisabled();
    });

    it('shows the invoice link and asks for the seat to be assigned again when the charge needs payment', () => {
      teamWorkspace('owner');
      sellPremiumSeats();
      state.seatError = new SeatPaymentError(
        'The charge for the Premium seat has not completed. Pay the invoice, then assign the Premium seat again.',
        'https://invoice.stripe.test/in_1',
      );
      render(<TeamSection />);

      const alert = screen.getByTestId('team-seat-payment-pending');
      expect(alert).toHaveTextContent('assign the Premium seat again');
      expect(screen.getByRole('link', { name: 'Pay the invoice' })).toHaveAttribute(
        'href',
        'https://invoice.stripe.test/in_1',
      );
    });

    it('lets the owner set their own seat type', () => {
      teamWorkspace('owner');
      sellPremiumSeats();
      render(<TeamSection />);

      expect(screen.getByRole('combobox', { name: 'Seat type for Ada Owner' })).toBeEnabled();
    });

    it('shows a member each seat type without any control to change it', () => {
      teamWorkspace('member');
      sellPremiumSeats({ licensedPremiumSeats: 1, premiumSeatsAssigned: 1 });
      state.members = [
        seatMember('owner-1', 'Ada Owner', 'owner', 'premium', false),
        seatMember('member-1', 'Grace Member', 'member', 'standard', true),
      ];
      render(<TeamSection />);

      expect(screen.queryByRole('combobox', { name: /Seat type for/ })).toBeNull();
      expect(screen.getByText('Premium seat')).toBeVisible();
      expect(screen.getByText('Standard seat')).toBeVisible();
    });

    it('offers no Premium seat where the workspace is billed in a currency that has none', () => {
      teamWorkspace('owner');
      sellPremiumSeats({
        billing: { interval: 'monthly', currency: 'inr', premiumSeatsSold: false },
      });
      render(<TeamSection />);

      expect(screen.getByRole('combobox', { name: 'Seat type for Grace Member' })).toBeDisabled();
    });

    it('shows how many paid Premium seats are assigned', () => {
      teamWorkspace('owner');
      sellPremiumSeats({ licensedPremiumSeats: 3, premiumSeatsAssigned: 1 });
      render(<TeamSection />);

      expect(screen.getByTestId('team-premium-seats')).toHaveTextContent('1 of 3');
      expect(
        screen.getByText(/A Standard seat is \$25\/month and a Premium seat is \$125\/month\./),
      ).toBeVisible();
    });

    it('shows no seat types on a workspace that has none to assign', () => {
      teamWorkspace('owner');
      render(<TeamSection />);

      expect(screen.queryByRole('combobox', { name: /Seat type for/ })).toBeNull();
      expect(screen.queryByTestId('team-premium-seats')).toBeNull();
    });
  });
});
