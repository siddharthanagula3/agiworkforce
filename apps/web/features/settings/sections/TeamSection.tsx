'use client';

import {
  TEAM_SEAT_TYPES,
  TEAM_SEAT_TYPE_LABELS,
  getBillingPlanPricing,
  isContractPricedPlan,
  isOrganizationAdminRole,
  type TeamSeatType,
} from '@agiworkforce/types';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Building2, Copy, Mail, RefreshCw, RotateCw, Trash2, Users, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  useConfirmAction,
  translateUiPlural,
} from '@agiworkforce/ui';
import {
  useCreateOrganization,
  useCreateTeamInvitation,
  useLeaveOrganization,
  useOrganizationOverview,
  useSwitchWorkspace,
  useRemoveTeamMember,
  useResendTeamInvitation,
  useRevokeTeamInvitation,
  useTeamInvitations,
  useTeamMembers,
  useTeamSeatTypes,
  useUpdateOrganizationSettings,
  useTransferOrganizationOwnership,
  useUpdateTeamMemberRole,
  useUpdateTeamMemberSeatType,
  SeatTypePaymentRequiredError,
  type OrganizationOwnerRoleAfterTransfer,
  type PreparedWorkspaceMembershipAction,
  type TeamInvitation,
  type TeamInvitationCredentialResult,
  type TeamMember,
} from '../hooks/use-settings-queries';
import { SettingsPageLink, SettingsSectionLink } from '../components/SettingsSectionLink';
import { seatChangeQuestion, seatPriceLabel } from '../lib/team-seat-change';
import { formatBillingDate } from '@/features/billing/lib/billing-format';
import { WORKSPACE_DELETION_PATH } from '@/features/admin/pages/workspace-deletion-route';
import { SSOPanel } from './team/SSOPanel';
import { toUserMessage } from '@/lib/user-error-message';
import { useWorkspaceSwitchInterruptions } from '@/features/workspaces/lib/workspace-switch-interruptions';
import { HelpArticleLink } from '@/features/support/components/HelpArticleLink';

type MemberRole = TeamMember['role'];

type PendingMemberAction =
  | { kind: 'role'; member: TeamMember; role: MemberRole }
  | { kind: 'remove'; member: TeamMember }
  | { kind: 'revoke-invitation'; invitation: TeamInvitation }
  | null;

const controlStyle = {
  width: '100%',
  minHeight: 38,
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  fontSize: 13,
  padding: 'var(--space-2) var(--space-3)',
} as const;

const primaryButtonStyle = {
  minHeight: 38,
  border: 0,
  borderRadius: 'var(--radius-md)',
  background: 'var(--chat-accent-primary)',
  color: 'var(--chat-accent-on-primary)',
  fontSize: 13,
  fontWeight: 600,
  padding: 'var(--space-2) var(--space-4)',
  cursor: 'pointer',
} as const;

const secondaryButtonStyle = {
  minHeight: 36,
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'transparent',
  color: 'var(--text-2)',
  fontSize: 12,
  fontWeight: 600,
  padding: 'var(--space-2) var(--space-3)',
  cursor: 'pointer',
} as const;

function titleCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function planLabel(plan: string): string {
  return getBillingPlanPricing(plan).label;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function buildInvitationLink(token: string): string {
  const url = new URL('/invite', window.location.origin);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: '1px solid var(--settings-border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-elev)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--settings-border)',
        }}
      >
        <div style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 600 }}>{title}</div>
        {description ? (
          <div
            style={{
              color: 'var(--text-3)',
              fontSize: 12,
              lineHeight: 1.5,
              marginTop: 'var(--space-1)',
            }}
          >
            {description}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function InlineError({ error }: { error: Error | null | undefined }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      style={{
        margin: 'var(--space-3) 0 0',
        color: 'var(--settings-destructive-text)',
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      {toUserMessage(error, 'Could not load your team.')}
    </p>
  );
}

export function TeamSection({ active = true }: { active?: boolean }) {
  const overviewQuery = useOrganizationOverview();
  const overview = overviewQuery.data;
  const organization = overview?.organization ?? null;
  const access = overview?.access;

  const membersQuery = useTeamMembers(organization?.id);
  const seatTypesQuery = useTeamSeatTypes(organization?.id);
  const invitationsQuery = useTeamInvitations(organization?.id);
  const createOrganization = useCreateOrganization();
  const updateOrganization = useUpdateOrganizationSettings();
  const switchWorkspace = useSwitchWorkspace();
  const switchInterruptions = useWorkspaceSwitchInterruptions();
  const createInvitation = useCreateTeamInvitation();
  const resendInvitation = useResendTeamInvitation();
  const revokeInvitation = useRevokeTeamInvitation();
  const leaveOrganization = useLeaveOrganization(active);
  const updateRole = useUpdateTeamMemberRole();
  const updateSeatType = useUpdateTeamMemberSeatType();
  const removeMember = useRemoveTeamMember();
  const transferOwnership = useTransferOrganizationOwnership(active);
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const { confirm: confirmMembership, dialog: membershipConfirmDialog } = useConfirmAction();
  const [membershipConfirmation, setMembershipConfirmation] =
    useState<PreparedWorkspaceMembershipAction | null>(null);
  const membershipConfirmationRef = useRef<PreparedWorkspaceMembershipAction | null>(null);

  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [creationDraft, setCreationDraft] = useState({
    ownerKey: createOrganization.ownerKey,
    name: '',
    slug: '',
  });
  const currentCreationDraft =
    creationDraft.ownerKey === createOrganization.ownerKey
      ? creationDraft
      : { ownerKey: createOrganization.ownerKey, name: '', slug: '' };
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<TeamInvitation['role']>('member');
  const [pendingAction, setPendingAction] = useState<PendingMemberAction>(null);
  const [invitationLink, setInvitationLink] = useState<{
    invitationId: string;
    email: string;
    url: string;
    delivery: TeamInvitationCredentialResult['delivery'];
  } | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const membershipOwnerKey = leaveOrganization.ownerKey;
  const [membershipDraft, setMembershipDraft] = useState({
    ownerKey: membershipOwnerKey,
    successorUserId: '',
    newOwnerUserId: '',
    outgoingOwnerRole: 'admin' as OrganizationOwnerRoleAfterTransfer,
  });
  const currentMembershipDraft =
    membershipDraft.ownerKey === membershipOwnerKey
      ? membershipDraft
      : {
          ownerKey: membershipOwnerKey,
          successorUserId: '',
          newOwnerUserId: '',
          outgoingOwnerRole: 'admin' as OrganizationOwnerRoleAfterTransfer,
        };
  const { successorUserId, newOwnerUserId, outgoingOwnerRole } = currentMembershipDraft;
  const membershipIsOwner = leaveOrganization.currentUserRole === 'owner';
  const membershipWorkspaceName = leaveOrganization.workspaceName;
  const membershipTargets = (membersQuery.data ?? []).filter(
    (member) =>
      member.organizationId === leaveOrganization.organizationId &&
      member.userId !== leaveOrganization.actorUserId,
  );
  const membershipAvailable =
    active &&
    leaveOrganization.canMutate &&
    transferOwnership.canMutate &&
    !!organization &&
    !!membershipWorkspaceName &&
    leaveOrganization.organizationId === organization.id &&
    transferOwnership.organizationId === organization.id;

  function askMembership(
    question: {
      title: string;
      description: string;
      confirmLabel: string;
    },
    prepare: () => PreparedWorkspaceMembershipAction | null,
  ) {
    const prepared = prepare();
    if (!prepared) return;
    membershipConfirmationRef.current?.cancel();
    membershipConfirmationRef.current = prepared;
    setMembershipConfirmation(prepared);
    confirmMembership({
      ...question,
      destructive: true,
      onConfirm: prepared.submit,
      onCancel: prepared.cancel,
    });
  }

  function askToLeave() {
    if (!membershipAvailable || !organization) return;
    const successor = membershipIsOwner
      ? membershipTargets.find((member) => member.userId === successorUserId)
      : null;
    if (membershipIsOwner && !successor) return;
    const input = {
      organizationId: organization.id,
      ...(successor ? { successorUserId: successor.userId } : {}),
    };
    askMembership(
      {
        title: successor ? 'Transfer ownership and leave?' : 'Leave workspace?',
        description: `${successor ? `${successor.name} becomes owner of ${membershipWorkspaceName}, then you` : `You`} immediately lose access to ${membershipWorkspaceName} and your seat becomes available. Cleanup will attempt to revoke this workspace's device tokens and API keys and disconnect its shared connectors. The result will report any cleanup problems. You may need to sign in again. You cannot undo this yourself.`,
        confirmLabel: successor ? 'Transfer and leave' : 'Leave workspace',
      },
      () => leaveOrganization.prepare(input),
    );
  }

  useEffect(() => {
    if (organization) {
      setWorkspaceName(organization.name);
      setWorkspaceSlug(organization.slug);
    }
  }, [organization]);

  const membershipOperation =
    leaveOrganization.phase && leaveOrganization.phase !== 'confirming'
      ? leaveOrganization
      : transferOwnership.phase && transferOwnership.phase !== 'confirming'
        ? transferOwnership
        : null;
  if (active && membershipOperation) {
    const left = leaveOrganization.data;
    const transferred = transferOwnership.data;
    const uncertain = membershipOperation.phase === 'uncertain';
    const continuing = membershipOperation.phase === 'finishing';
    return (
      <SectionCard
        title={
          left
            ? 'You left the workspace'
            : transferred
              ? 'Ownership transferred'
              : uncertain
                ? 'Workspace outcome unconfirmed'
                : 'Confirming workspace action'
        }
      >
        <div style={{ padding: 'var(--space-5)' }}>
          {left ? (
            <>
              <p>
                Your membership was removed. The server reports {left.revoked.deviceTokens} device
                tokens, {left.revoked.apiKeys} API keys and {left.revoked.sessions} sessions
                revoked, and {left.sharedConnectorsUnshared} shared connectors disconnected.
              </p>
              {left.warnings.length > 0 ? (
                <p role="alert">
                  Some credential or connector cleanup could not be confirmed. Contact your
                  workspace administrator or support before assuming all access has ended.
                </p>
              ) : (
                <p>No cleanup problems were reported.</p>
              )}
            </>
          ) : transferred ? (
            <p>
              Ownership was transferred. Your role is now {titleCase(transferred.previousOwnerRole)}
              .
            </p>
          ) : !uncertain ? (
            <p role="status">
              {continuing
                ? 'Refreshing your workspace…'
                : 'Complete any identity confirmation to continue.'}
            </p>
          ) : null}
          {left || transferred ? (
            <p>
              Continue to refresh the app in your current workspace. This will not repeat the
              action. You may be asked to sign in.
            </p>
          ) : null}
          <InlineError error={membershipOperation.error} />
          {left || transferred || uncertain ? (
            <button
              type="button"
              disabled={continuing}
              onClick={() => void membershipOperation.continueAfterReceipt()}
              style={primaryButtonStyle}
            >
              {continuing ? 'Refreshing…' : uncertain ? 'Reload to check workspace' : 'Continue'}
            </button>
          ) : null}
          {membershipOperation.stepUpDialog}
        </div>
      </SectionCard>
    );
  }

  if (overviewQuery.isLoading) {
    return (
      <div
        role="status"
        style={{ color: 'var(--text-3)', fontSize: 13, padding: 'var(--space-5)' }}
      >
        Loading team settings…
      </div>
    );
  }

  if (overviewQuery.isError || !overview || !access) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          padding: 'var(--space-5)',
        }}
      >
        <p role="alert" style={{ color: 'var(--text-2)', fontSize: 13, margin: 0 }}>
          Team settings could not be loaded.
        </p>
        <button
          type="button"
          onClick={() => void overviewQuery.refetch()}
          style={{ ...primaryButtonStyle, alignSelf: 'flex-start' }}
        >
          <RefreshCw size={14} style={{ marginRight: 'var(--space-2)', verticalAlign: -2 }} />
          Try again
        </button>
      </div>
    );
  }

  const canAdminister =
    access.canManageTeam &&
    organization !== null &&
    isOrganizationAdminRole(organization.currentUserRole);
  const isOwner = organization?.currentUserRole === 'owner';
  const pendingInvitations =
    invitationsQuery.data?.invitations.filter((invitation) => invitation.status === 'pending') ??
    [];
  const licensedSeats = invitationsQuery.data?.seats?.licensedSeats ?? access.maxMembers;
  const seatsConsumed = invitationsQuery.data?.seats?.seatsConsumed ?? access.seatsConsumed;
  const seatsAvailable = invitationsQuery.data?.seats?.seatsAvailable ?? access.seatsAvailable;
  const seatSource = invitationsQuery.data?.seats?.seatSource ?? access.seatSource;
  const contractPriced = isContractPricedPlan(access.plan);
  const seatBilling = seatTypesQuery.data?.billing ?? null;
  const licensedPremiumSeats = seatTypesQuery.data?.licensedPremiumSeats ?? 0;
  const premiumSeatsAssigned = seatTypesQuery.data?.premiumSeatsAssigned ?? 0;
  const unassignedPremiumSeats = Math.max(0, licensedPremiumSeats - premiumSeatsAssigned);
  const accountWorkspaces = switchWorkspace.accountWorkspaces;
  const workspaces =
    accountWorkspaces?.workspaces.filter(
      (workspace) => workspace.kind === 'organization' && workspace.organizationId !== null,
    ) ?? [];

  function requestSeatChange(member: TeamMember, seatType: TeamSeatType) {
    if (!organization || !seatBilling || seatType === member.seatType) return;
    const organizationId = organization.id;
    confirm({
      ...seatChangeQuestion({
        memberName: member.name,
        from: member.seatType,
        to: seatType,
        interval: seatBilling.interval,
        unassignedPremiumSeats,
        premiumPaidThrough: member.premiumPaidThrough,
      }),
      onConfirm: () =>
        updateSeatType
          .mutateAsync({ memberId: member.id, organizationId, seatType })
          .catch(() => undefined),
    });
  }

  function seatChangeBlockedReason(member: TeamMember): string | null {
    if (!seatBilling) return null;
    if (member.seatType === 'standard' && !seatBilling.premiumSeatsSold) {
      return 'Premium seats are not sold in the currency or billing period this workspace uses.';
    }
    if (isOwner) return null;
    if (member.seatType === 'standard' && unassignedPremiumSeats > 0) return null;
    return member.seatType === 'premium'
      ? 'Only the workspace owner can move a Premium seat back to Standard, because it changes what the workspace pays.'
      : 'Every paid Premium seat is in use. Only the workspace owner can buy another.';
  }

  const seatPaymentPending =
    updateSeatType.error instanceof SeatTypePaymentRequiredError ? updateSeatType.error : null;

  const workspacePicker =
    (accountWorkspaces && workspaces.length > 0) || switchWorkspace.requiresReload ? (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          padding: 'var(--space-4) 0',
          borderBottom: '1px solid var(--settings-border)',
          flexWrap: 'wrap',
        }}
      >
        <label htmlFor="team-active-workspace" style={{ fontSize: 14, color: 'var(--text-1)' }}>
          Workspace
        </label>
        <div>
          {accountWorkspaces ? (
            <select
              id="team-active-workspace"
              aria-label="Active workspace"
              value={
                accountWorkspaces.scope === 'personal'
                  ? 'personal'
                  : accountWorkspaces.activeOrganizationId!
              }
              disabled={switchWorkspace.isPending || switchWorkspace.canMutate === false}
              onChange={(event) => {
                const target = event.target.value === 'personal' ? null : event.target.value;
                if (switchInterruptions.length === 0) {
                  switchWorkspace.mutate(target);
                  return;
                }
                confirm({
                  title: 'Switch workspace?',
                  description: `Switching reloads the app in the new workspace. This work does not come with you: ${switchInterruptions
                    .map((interruption) => interruption.description)
                    .join(' ')}`,
                  confirmLabel: 'Switch anyway',
                  cancelLabel: 'Stay in this workspace',
                  onConfirm: () => switchWorkspace.mutate(target),
                });
              }}
              style={{ ...controlStyle, width: 'auto' }}
            >
              <option value="personal">Personal</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.organizationId!}>
                  {workspace.name}
                  {workspace.role ? ` · ${titleCase(workspace.role)}` : ''}
                </option>
              ))}
            </select>
          ) : null}
          <InlineError error={switchWorkspace.error} />
          {switchWorkspace.requiresReload ? (
            <button type="button" onClick={() => window.location.reload()}>
              Reload to resolve workspace status
            </button>
          ) : null}
        </div>
      </div>
    ) : null;

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createOrganization.mutate({
      name: currentCreationDraft.name.trim(),
      slug: currentCreationDraft.slug.trim(),
    });
  }

  function handleSaveWorkspace(event: FormEvent) {
    event.preventDefault();
    if (!organization) return;
    updateOrganization.mutate({
      organizationId: organization.id,
      updates: {
        name: workspaceName.trim(),
        slug: workspaceSlug.trim(),
      },
    });
  }

  function handleInviteMember(event: FormEvent) {
    event.preventDefault();
    if (!organization) return;
    const email = memberEmail.trim();
    createInvitation.mutate(
      {
        organizationId: organization.id,
        email,
        role: memberRole,
      },
      {
        onSuccess: (result) => {
          setInvitationLink({
            invitationId: result.invitation.id,
            email,
            url: buildInvitationLink(result.inviteToken),
            delivery: result.delivery,
          });
          setMemberEmail('');
          setCopyStatus('idle');
        },
      },
    );
  }

  function handleRenewInvitation(invitation: TeamInvitation) {
    if (!organization) return;
    resendInvitation.mutate(
      { organizationId: organization.id, invitationId: invitation.id },
      {
        onSuccess: (result) => {
          setInvitationLink({
            invitationId: invitation.id,
            email: invitation.email,
            url: buildInvitationLink(result.inviteToken),
            delivery: result.delivery,
          });
          setCopyStatus('idle');
        },
      },
    );
  }

  async function copyInvitationLink() {
    if (!invitationLink || !navigator.clipboard?.writeText) {
      setCopyStatus('failed');
      return;
    }
    try {
      await navigator.clipboard.writeText(invitationLink.url);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  function confirmMemberAction() {
    if (!pendingAction || !organization) return;
    if (pendingAction.kind === 'revoke-invitation') {
      const invitationId = pendingAction.invitation.id;
      revokeInvitation.mutate(
        { invitationId, organizationId: organization.id },
        {
          onSuccess: () =>
            setInvitationLink((current) =>
              current?.invitationId === invitationId ? null : current,
            ),
        },
      );
    } else if (pendingAction.kind === 'remove') {
      removeMember.mutate({
        memberId: pendingAction.member.id,
        organizationId: organization.id,
      });
    } else {
      updateRole.mutate({
        memberId: pendingAction.member.id,
        organizationId: organization.id,
        role: pendingAction.role,
      });
    }
    setPendingAction(null);
  }

  if (!organization) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div>
          <h1
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 24,
              fontWeight: 500,
              color: 'var(--text-1)',
              margin: '0 0 var(--space-1)',
            }}
          >
            Workspace
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
            Create and manage your AGI workspace.
          </p>
          <div style={{ marginTop: 'var(--space-2)' }}>
            <HelpArticleLink docId="workspace-administration" label="How workspaces work" />
          </div>
        </div>

        {confirmDialog}
        {workspacePicker}

        {!access.canManageTeam ? (
          <SectionCard title="Workspace administration">
            <div style={{ padding: 'var(--space-5)' }}>
              <p style={{ color: 'var(--text-2)', fontSize: 12, lineHeight: 1.55, margin: 0 }}>
                Workspace administration requires a Team or Enterprise plan. Choose at least 2 Team
                seats to create a workspace. Your current plan is {planLabel(access.plan)}.
              </p>
              <SettingsPageLink
                href="/pricing#pricing-team-title"
                style={{
                  ...primaryButtonStyle,
                  display: 'inline-flex',
                  alignItems: 'center',
                  marginTop: 'var(--space-4)',
                  textDecoration: 'none',
                }}
              >
                Choose Team seats
              </SettingsPageLink>
            </div>
          </SectionCard>
        ) : (
          <SectionCard
            title="Create your workspace"
            description="Create the workspace you own. Invitations can add you to other workspaces."
          >
            <form
              onSubmit={handleCreate}
              style={{
                display: 'grid',
                gap: 'var(--space-4)',
                padding: 'var(--space-5)',
                maxWidth: 520,
              }}
            >
              <label
                style={{
                  display: 'grid',
                  gap: 'var(--space-2)',
                  color: 'var(--text-2)',
                  fontSize: 13,
                }}
              >
                Workspace name
                <input
                  aria-label="Workspace name"
                  value={currentCreationDraft.name}
                  onChange={(event) =>
                    setCreationDraft({ ...currentCreationDraft, name: event.target.value })
                  }
                  required
                  maxLength={120}
                  style={controlStyle}
                />
              </label>
              <label
                style={{
                  display: 'grid',
                  gap: 'var(--space-2)',
                  color: 'var(--text-2)',
                  fontSize: 13,
                }}
              >
                Workspace slug
                <input
                  aria-label="Workspace slug"
                  value={currentCreationDraft.slug}
                  onChange={(event) =>
                    setCreationDraft({
                      ...currentCreationDraft,
                      slug: event.target.value.toLowerCase(),
                    })
                  }
                  required
                  maxLength={60}
                  pattern="[a-z0-9-]+"
                  placeholder="acme-team"
                  style={controlStyle}
                />
              </label>
              <InlineError error={createOrganization.error} />
              {createOrganization.requiresReload ? (
                <button type="button" onClick={() => window.location.reload()}>
                  Reload to resolve workspace status
                </button>
              ) : null}
              <button
                type="submit"
                disabled={createOrganization.isPending || createOrganization.canMutate === false}
                style={{ ...primaryButtonStyle, justifySelf: 'start' }}
              >
                <Building2 size={14} style={{ marginRight: 'var(--space-2)', verticalAlign: -2 }} />
                {createOrganization.isPending ? 'Creating…' : 'Create workspace'}
              </button>
            </form>
          </SectionCard>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 var(--space-1)',
          }}
        >
          Workspace
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
          Manage workspace details and the AGI accounts with access.
        </p>
        <div style={{ marginTop: 'var(--space-2)' }}>
          <HelpArticleLink docId="workspace-administration" label="How workspaces work" />
        </div>
      </div>

      {workspacePicker}

      {!access.canManageTeam ? (
        <p
          role="alert"
          style={{ color: 'var(--text-3)', fontSize: 12, margin: 0, padding: 'var(--space-1) 0' }}
        >
          This workspace is on the {planLabel(access.plan)} plan. Workspace administration needs a
          Team or Enterprise workspace plan.
        </p>
      ) : null}

      <SectionCard title="Workspace details" description={`Plan: ${planLabel(access.plan)}`}>
        <form
          onSubmit={handleSaveWorkspace}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
            gap: 'var(--space-4)',
            padding: 'var(--space-5)',
          }}
        >
          <label
            style={{ display: 'grid', gap: 'var(--space-2)', color: 'var(--text-2)', fontSize: 13 }}
          >
            Workspace name
            <input
              aria-label="Workspace name"
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              readOnly={!canAdminister}
              required
              maxLength={120}
              style={controlStyle}
            />
          </label>
          <label
            style={{ display: 'grid', gap: 'var(--space-2)', color: 'var(--text-2)', fontSize: 13 }}
          >
            Workspace slug
            <input
              aria-label="Workspace slug"
              value={workspaceSlug}
              onChange={(event) => setWorkspaceSlug(event.target.value.toLowerCase())}
              readOnly={!canAdminister}
              required
              maxLength={60}
              pattern="[a-z0-9-]+"
              style={controlStyle}
            />
          </label>
          {canAdminister ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <InlineError error={updateOrganization.error} />
              <button
                type="submit"
                disabled={updateOrganization.isPending}
                style={primaryButtonStyle}
              >
                {updateOrganization.isPending ? 'Saving…' : 'Save workspace'}
              </button>
            </div>
          ) : null}
        </form>
      </SectionCard>

      <SectionCard
        title="Seats & billing"
        description={
          contractPriced
            ? 'Your workspace agreement determines seat allowances and billing.'
            : seatSource === 'billing'
              ? 'Licensed seat totals follow your billing agreement.'
              : typeof licensedSeats === 'number'
                ? 'This workspace has a recorded seat allowance.'
                : 'A seat allowance has not been configured yet.'
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 'var(--space-4)',
            padding: 'var(--space-5)',
          }}
        >
          <div>
            <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Licensed</div>
            <div style={{ color: 'var(--text-1)', fontSize: 20, fontWeight: 650 }}>
              {licensedSeats ?? 'Not set'}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-3)', fontSize: 12 }}>In use</div>
            <div style={{ color: 'var(--text-1)', fontSize: 20, fontWeight: 650 }}>
              {seatsConsumed ?? 'Unavailable'}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Available</div>
            <div style={{ color: 'var(--text-1)', fontSize: 20, fontWeight: 650 }}>
              {seatsAvailable ?? 'Unknown'}
            </div>
          </div>
          {seatBilling ? (
            <div data-testid="team-premium-seats">
              <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Premium seats</div>
              <div style={{ color: 'var(--text-1)', fontSize: 20, fontWeight: 650 }}>
                {premiumSeatsAssigned} of {licensedPremiumSeats}
              </div>
              <div style={{ color: 'var(--text-3)', fontSize: 12 }}>assigned</div>
            </div>
          ) : null}
          <div
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 'var(--space-2)' }}
          >
            <SettingsPageLink
              href={
                contractPriced
                  ? '/workspace/billing'
                  : typeof licensedSeats === 'number'
                    ? `/pricing?seats=${licensedSeats}#pricing-team-title`
                    : '/pricing#pricing-team-title'
              }
              style={{ ...secondaryButtonStyle, display: 'inline-flex', textDecoration: 'none' }}
            >
              {contractPriced ? 'Review contract' : 'Change seats'}
            </SettingsPageLink>
            <SettingsSectionLink
              section="billing"
              style={{ ...secondaryButtonStyle, display: 'inline-flex', textDecoration: 'none' }}
            >
              Manage billing
            </SettingsSectionLink>
          </div>
        </div>
        <p
          style={{
            borderTop: '1px solid var(--settings-border)',
            color: 'var(--text-3)',
            fontSize: 12,
            lineHeight: 1.5,
            margin: 0,
            padding: 'var(--space-3) var(--space-5)',
          }}
        >
          Active members and pending invitations each reserve one seat.
          {seatBilling?.premiumSeatsSold
            ? ` Standard is ${seatPriceLabel('standard', seatBilling.interval)}, Premium ${seatPriceLabel('premium', seatBilling.interval)}.`
            : ''}
        </p>
        {seatPaymentPending ? (
          <p
            role="alert"
            data-testid="team-seat-payment-pending"
            style={{
              borderTop: '1px solid var(--settings-border)',
              color: 'var(--text-1)',
              fontSize: 13,
              lineHeight: 1.5,
              margin: 0,
              padding: 'var(--space-3) var(--space-5)',
            }}
          >
            {seatPaymentPending.message}{' '}
            {seatPaymentPending.paymentUrl ? (
              <a href={seatPaymentPending.paymentUrl} target="_blank" rel="noopener noreferrer">
                Pay the invoice
              </a>
            ) : (
              <SettingsSectionLink section="billing">Open billing to pay it</SettingsSectionLink>
            )}
          </p>
        ) : null}
      </SectionCard>

      {canAdminister ? (
        <SectionCard title="Invite teammate" description="Invitations expire after 7 days.">
          <form
            onSubmit={handleInviteMember}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-3)',
              alignItems: 'end',
              padding: 'var(--space-5)',
            }}
          >
            <label
              style={{
                display: 'grid',
                flex: '1 1 240px',
                gap: 'var(--space-2)',
                color: 'var(--text-2)',
                fontSize: 13,
              }}
            >
              Email address
              <input
                aria-label="Invitee email"
                type="email"
                value={memberEmail}
                onChange={(event) => setMemberEmail(event.target.value)}
                required
                style={controlStyle}
              />
            </label>
            <label
              style={{
                display: 'grid',
                flex: '1 1 140px',
                gap: 'var(--space-2)',
                color: 'var(--text-2)',
                fontSize: 13,
              }}
            >
              Role
              <select
                aria-label="Invitation role"
                value={memberRole}
                onChange={(event) => setMemberRole(event.target.value as TeamInvitation['role'])}
                style={controlStyle}
              >
                <option value="member">Member role</option>
                <option value="viewer">Viewer role</option>
                <option value="admin">Admin role</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={createInvitation.isPending || seatsAvailable === 0}
              style={primaryButtonStyle}
            >
              <Mail size={14} style={{ marginRight: 'var(--space-2)', verticalAlign: -2 }} />
              {createInvitation.isPending ? 'Creating…' : 'Create invitation'}
            </button>
            <div style={{ flexBasis: '100%' }}>
              <p style={{ color: 'var(--text-3)', fontSize: 12, lineHeight: 1.5, margin: 0 }}>
                A private link appears here. The recipient must sign in with the invited email.
              </p>
              {seatsAvailable === 0 ? (
                <p
                  role="alert"
                  style={{ color: 'var(--text-2)', fontSize: 12, margin: 'var(--space-2) 0 0' }}
                >
                  No seats are available. Revoke an invitation, remove a member, or buy more seats.
                </p>
              ) : null}
              <InlineError error={createInvitation.error} />
            </div>
          </form>

          {invitationLink ? (
            <div
              role="status"
              style={{
                borderTop: '1px solid var(--settings-border)',
                background: 'var(--bg-base)',
                padding: 'var(--space-5)',
              }}
            >
              <div
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 600 }}>
                    Private link for {invitationLink.email}
                  </div>
                  <p style={{ color: 'var(--text-2)', fontSize: 12, margin: 'var(--space-1) 0 0' }}>
                    {invitationLink.delivery.emailSent
                      ? `An invitation email was sent to ${invitationLink.email}. This link does the same thing if it does not arrive.`
                      : invitationLink.delivery.reason}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss invitation link"
                  onClick={() => setInvitationLink(null)}
                  style={{ ...secondaryButtonStyle, minHeight: 32, padding: 'var(--space-2)' }}
                >
                  <X size={14} />
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <input
                  aria-label="Private invitation link"
                  readOnly
                  value={invitationLink.url}
                  style={{ ...controlStyle, flex: '1 1 280px' }}
                />
                <button
                  type="button"
                  onClick={() => void copyInvitationLink()}
                  style={primaryButtonStyle}
                >
                  <Copy size={14} style={{ marginRight: 'var(--space-2)', verticalAlign: -2 }} />
                  {copyStatus === 'copied' ? 'Copied' : 'Copy link'}
                </button>
              </div>
              {copyStatus === 'failed' ? (
                <p
                  role="alert"
                  style={{ color: 'var(--text-2)', fontSize: 12, margin: 'var(--space-2) 0 0' }}
                >
                  Copy is unavailable in this browser. Select the link and copy it manually.
                </p>
              ) : null}
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {canAdminister ? (
        <SectionCard
          title="Pending invitations"
          description={translateUiPlural(
            'settings',
            'counts.pendingInvitations',
            pendingInvitations.length,
            {
              one: '{{count}} pending invitation',
              other: '{{count}} pending invitations',
            },
          )}
        >
          {invitationsQuery.isLoading ? (
            <div
              role="status"
              style={{ padding: 'var(--space-5)', color: 'var(--text-3)', fontSize: 13 }}
            >
              Loading invitations…
            </div>
          ) : invitationsQuery.isError ? (
            <div style={{ padding: 'var(--space-5)' }}>
              <p
                role="alert"
                style={{ color: 'var(--text-2)', fontSize: 13, margin: '0 0 var(--space-3)' }}
              >
                Invitations could not be loaded.
              </p>
              <button
                type="button"
                onClick={() => void invitationsQuery.refetch()}
                style={secondaryButtonStyle}
              >
                Try again
              </button>
            </div>
          ) : pendingInvitations.length === 0 ? (
            <div style={{ padding: 'var(--space-5)', color: 'var(--text-3)', fontSize: 13 }}>
              No pending invitations.
            </div>
          ) : (
            pendingInvitations.map((invitation, index) => (
              <div
                key={invitation.id}
                style={{
                  alignItems: 'center',
                  borderTop: index === 0 ? 0 : '1px solid var(--settings-border)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--space-3)',
                  minHeight: 66,
                  padding: 'var(--space-3) var(--space-5)',
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                  <div
                    style={{
                      color: 'var(--text-1)',
                      fontSize: 13,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={invitation.email}
                  >
                    {invitation.email}
                  </div>
                  <div style={{ color: 'var(--text-3)', fontSize: 12 }}>
                    {titleCase(invitation.role)} · expires {formatDate(invitation.expiresAt)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Renew invitation for ${invitation.email}`}
                  disabled={resendInvitation.isPending}
                  onClick={() => handleRenewInvitation(invitation)}
                  style={secondaryButtonStyle}
                >
                  <RotateCw
                    size={13}
                    style={{ marginRight: 'var(--space-2)', verticalAlign: -2 }}
                  />
                  New link
                </button>
                <button
                  type="button"
                  aria-label={`Revoke invitation for ${invitation.email}`}
                  disabled={revokeInvitation.isPending}
                  onClick={() => setPendingAction({ kind: 'revoke-invitation', invitation })}
                  style={{
                    ...secondaryButtonStyle,
                    color: 'var(--settings-destructive-text)',
                  }}
                >
                  Revoke
                </button>
              </div>
            ))
          )}
          <InlineError error={resendInvitation.error ?? revokeInvitation.error} />
        </SectionCard>
      ) : null}

      <SectionCard
        title="Members"
        description={
          access.maxMembers === null
            ? translateUiPlural('settings', 'counts.activeMembers', organization.memberCount, {
                one: '{{count}} active member',
                other: '{{count}} active members',
              })
            : `${organization.memberCount} of ${access.maxMembers} licensed members`
        }
      >
        {membersQuery.isLoading ? (
          <div
            role="status"
            style={{ padding: 'var(--space-5)', color: 'var(--text-3)', fontSize: 13 }}
          >
            Loading members…
          </div>
        ) : membersQuery.isError ? (
          <div style={{ padding: 'var(--space-5)' }}>
            <p
              role="alert"
              style={{ color: 'var(--text-2)', fontSize: 13, margin: '0 0 var(--space-3)' }}
            >
              Members could not be loaded.
            </p>
            <button
              type="button"
              onClick={() => void membersQuery.refetch()}
              style={primaryButtonStyle}
            >
              Try again
            </button>
          </div>
        ) : membersQuery.data && membersQuery.data.length > 0 ? (
          membersQuery.data.map((member, index) => {
            const canManageThisMember =
              canAdminister && (isOwner || member.role !== 'owner') && !member.isCurrentUser;
            return (
              <div
                key={member.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  minHeight: 66,
                  padding: 'var(--space-3) var(--space-5)',
                  borderTop: index === 0 ? 0 : '1px solid var(--settings-border)',
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: 'var(--bg-hover)',
                    color: 'var(--text-2)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {member.name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      color: 'var(--text-1)',
                      fontSize: 13,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={member.name}
                  >
                    {member.name}
                    {member.isCurrentUser ? (
                      <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> (you)</span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      color: 'var(--text-3)',
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={member.email}
                  >
                    {member.email}
                  </div>
                  {member.premiumPaidThrough ? (
                    <div style={{ color: 'var(--text-3)', fontSize: 12 }}>
                      Premium usage until {formatBillingDate(member.premiumPaidThrough)}
                    </div>
                  ) : null}
                </div>
                {seatBilling && canAdminister ? (
                  <select
                    aria-label={`Seat type for ${member.name}`}
                    value={member.seatType}
                    disabled={updateSeatType.isPending || seatChangeBlockedReason(member) !== null}
                    title={seatChangeBlockedReason(member) ?? undefined}
                    onChange={(event) =>
                      requestSeatChange(member, event.target.value as TeamSeatType)
                    }
                    style={{ ...controlStyle, width: 150, flexShrink: 0 }}
                  >
                    {TEAM_SEAT_TYPES.map((seatType) => (
                      <option key={seatType} value={seatType}>
                        {TEAM_SEAT_TYPE_LABELS[seatType]} seat
                      </option>
                    ))}
                  </select>
                ) : seatBilling ? (
                  <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
                    {TEAM_SEAT_TYPE_LABELS[member.seatType]} seat
                  </span>
                ) : null}
                {canManageThisMember ? (
                  <>
                    <select
                      aria-label={`Role for ${member.name}`}
                      value={member.role}
                      onChange={(event) =>
                        setPendingAction({
                          kind: 'role',
                          member,
                          role: event.target.value as MemberRole,
                        })
                      }
                      style={{ ...controlStyle, width: 135, flexShrink: 0 }}
                    >
                      <option value="viewer">Viewer role</option>
                      <option value="member">Member role</option>
                      <option value="admin">Admin role</option>
                    </select>
                    <button
                      type="button"
                      aria-label={`Remove ${member.name}`}
                      onClick={() => setPendingAction({ kind: 'remove', member })}
                      style={{
                        width: 36,
                        height: 36,
                        border: '1px solid var(--settings-border)',
                        borderRadius: 'var(--radius-md)',
                        background: 'transparent',
                        color: 'var(--settings-destructive-text)',
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                ) : (
                  <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
                    {titleCase(member.role)} role
                  </span>
                )}
              </div>
            );
          })
        ) : (
          <div
            style={{
              padding: 'var(--space-5)',
              textAlign: 'center',
              color: 'var(--text-3)',
              fontSize: 13,
            }}
          >
            <Users size={20} style={{ marginBottom: 'var(--space-2)' }} />
            <div>No members found.</div>
          </div>
        )}
        <InlineError error={updateRole.error ?? removeMember.error} />
      </SectionCard>

      {membershipIsOwner ? (
        <SectionCard
          title="Workspace ownership"
          description="Hand the owner role to another member while keeping your own seat."
        >
          <div style={{ padding: 'var(--space-5)' }}>
            <p style={{ color: 'var(--text-2)', fontSize: 12, lineHeight: 1.55, margin: 0 }}>
              The new owner gets billing, deletion and all admin controls. Only they can give it
              back.
            </p>
            <div
              style={{
                display: 'grid',
                gap: 'var(--space-4)',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))',
                marginTop: 'var(--space-4)',
                maxWidth: 560,
              }}
            >
              <label
                style={{
                  display: 'grid',
                  gap: 'var(--space-2)',
                  color: 'var(--text-2)',
                  fontSize: 13,
                }}
              >
                New owner
                <select
                  aria-label="Member to receive ownership"
                  data-testid="transfer-ownership-member"
                  value={newOwnerUserId}
                  onChange={(event) =>
                    setMembershipDraft({
                      ...currentMembershipDraft,
                      newOwnerUserId: event.target.value,
                    })
                  }
                  disabled={!membershipAvailable}
                  style={controlStyle}
                >
                  <option value="">Choose a member</option>
                  {membershipTargets.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name} ({member.email})
                    </option>
                  ))}
                </select>
              </label>
              <label
                style={{
                  display: 'grid',
                  gap: 'var(--space-2)',
                  color: 'var(--text-2)',
                  fontSize: 13,
                }}
              >
                Your role afterwards
                <select
                  aria-label="Your role after the transfer"
                  data-testid="transfer-ownership-outgoing-role"
                  disabled={!membershipAvailable}
                  value={outgoingOwnerRole}
                  onChange={(event) =>
                    setMembershipDraft({
                      ...currentMembershipDraft,
                      outgoingOwnerRole: event.target.value as OrganizationOwnerRoleAfterTransfer,
                    })
                  }
                  style={controlStyle}
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              data-testid="transfer-ownership-submit"
              disabled={!newOwnerUserId || !membershipAvailable}
              onClick={() => {
                const target = membershipTargets.find((member) => member.userId === newOwnerUserId);
                if (!target || !organization || !membershipAvailable) return;
                const input = {
                  organizationId: organization.id,
                  toUserId: target.userId,
                  outgoingOwnerRole,
                };
                askMembership(
                  {
                    title: 'Transfer ownership?',
                    description: `${target.name} becomes the owner of ${membershipWorkspaceName}, with billing, workspace deletion and every administrative control. You become ${titleCase(outgoingOwnerRole)} and lose those controls immediately. Only ${target.name} can transfer ownership back.`,
                    confirmLabel: 'Transfer ownership',
                  },
                  () => transferOwnership.prepare(input),
                );
              }}
              style={{ ...secondaryButtonStyle, marginTop: 'var(--space-4)' }}
            >
              {transferOwnership.isPending ? 'Transferring…' : 'Transfer ownership'}
            </button>
            <InlineError error={transferOwnership.error} />
          </div>
        </SectionCard>
      ) : null}

      {isOwner ? (
        <SectionCard
          title="Delete this workspace"
          description="Only the owner can, and only by typing the workspace name."
        >
          <div style={{ padding: 'var(--space-5)' }}>
            <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
              Deleting erases every chat, project, file, connector and API key in{' '}
              {organization?.name ?? 'this workspace'} for all{' '}
              {translateUiPlural('settings', 'counts.members', organization?.memberCount ?? 0, {
                one: '{{count}} member',
                other: '{{count}} members',
              })}
              . Nothing goes on the day you ask: the next page schedules it, and you can cancel
              there until the scheduled date.
            </p>
            <SettingsPageLink
              href={WORKSPACE_DELETION_PATH}
              style={{
                ...secondaryButtonStyle,
                display: 'inline-flex',
                marginTop: 'var(--space-4)',
                textDecoration: 'none',
              }}
            >
              Delete workspace
            </SettingsPageLink>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Workspace membership"
        description="Leaving releases your seat and removes this workspace from your account."
      >
        <div style={{ padding: 'var(--space-5)' }}>
          {leaveOrganization.organizationId && !leaveOrganization.actorUserId ? (
            <p role="alert">Reload to confirm your account before changing workspace membership.</p>
          ) : null}
          {membershipIsOwner ? (
            <>
              <p style={{ color: 'var(--text-2)', fontSize: 12, lineHeight: 1.55, margin: 0 }}>
                Choose a successor. Ownership moves to them as you leave.
              </p>
              <label
                style={{
                  display: 'grid',
                  gap: 'var(--space-2)',
                  color: 'var(--text-2)',
                  fontSize: 13,
                  marginTop: 'var(--space-4)',
                }}
              >
                New owner
                <select
                  aria-label="New workspace owner"
                  value={successorUserId}
                  onChange={(event) =>
                    setMembershipDraft({
                      ...currentMembershipDraft,
                      successorUserId: event.target.value,
                    })
                  }
                  disabled={!membershipAvailable}
                  style={{ ...controlStyle, maxWidth: 360 }}
                >
                  <option value="">Choose a member</option>
                  {membershipTargets.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name} ({member.email})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={askToLeave}
                disabled={!successorUserId || !membershipAvailable}
                style={{
                  ...secondaryButtonStyle,
                  color: 'var(--settings-destructive-text)',
                  marginTop: 'var(--space-4)',
                }}
              >
                {leaveOrganization.isPending ? 'Leaving…' : 'Transfer ownership and leave'}
              </button>
              <InlineError error={leaveOrganization.error} />
            </>
          ) : (
            <>
              <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                You will immediately lose access. After leaving, you can accept an invitation to a
                different workspace.
              </p>
              <button
                type="button"
                onClick={askToLeave}
                disabled={!membershipAvailable}
                style={{
                  ...secondaryButtonStyle,
                  color: 'var(--settings-destructive-text)',
                  marginTop: 'var(--space-4)',
                }}
              >
                {leaveOrganization.isPending ? 'Leaving…' : 'Leave workspace'}
              </button>
              <InlineError error={leaveOrganization.error} />
            </>
          )}
        </div>
      </SectionCard>

      {/*
        Enterprise SSO. The panel asks the server whether this organization is
        entitled and renders nothing when it is not, so no plan check happens
        on the client and no unusable control is advertised.
      */}
      {canAdminister ? <SSOPanel organizationId={organization.id} isOwner={isOwner} /> : null}

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.kind === 'remove'
                ? 'Remove team member?'
                : pendingAction?.kind === 'revoke-invitation'
                  ? 'Revoke invitation?'
                  : 'Change member role?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.kind === 'remove'
                ? `${pendingAction.member.name} will immediately lose access to this workspace.`
                : pendingAction?.kind === 'revoke-invitation'
                  ? `${pendingAction.invitation.email} will no longer be able to join with this link. Its reserved seat becomes available immediately.`
                  : pendingAction?.kind === 'role'
                    ? `${pendingAction.member.name} will become ${titleCase(pendingAction.role)}. The workspace must always retain at least one owner.`
                    : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMemberAction}>
              {pendingAction?.kind === 'remove'
                ? 'Remove member'
                : pendingAction?.kind === 'revoke-invitation'
                  ? 'Revoke invitation'
                  : 'Change role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {confirmDialog}
      {active && membershipConfirmation?.isCurrent() ? membershipConfirmDialog : null}
    </div>
  );
}
