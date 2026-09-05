'use client';

import { isOrganizationAdminRole } from '@agiworkforce/types';
import { useEffect, useState, type FormEvent } from 'react';
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
  useUpdateOrganizationSettings,
  useUpdateTeamMemberRole,
  type TeamInvitation,
  type TeamMember,
} from '../hooks/use-settings-queries';
import { SettingsPageLink, SettingsSectionLink } from '../components/SettingsSectionLink';
import { SSOPanel } from './team/SSOPanel';
import { toUserMessage } from '@/lib/user-error-message';

type MemberRole = TeamMember['role'];

type PendingMemberAction =
  | { kind: 'role'; member: TeamMember; role: MemberRole }
  | { kind: 'remove'; member: TeamMember }
  | { kind: 'revoke-invitation'; invitation: TeamInvitation }
  | { kind: 'leave-workspace' }
  | null;

const controlStyle = {
  width: '100%',
  minHeight: 38,
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  fontSize: 13,
  padding: '8px 11px',
} as const;

const primaryButtonStyle = {
  minHeight: 38,
  border: 0,
  borderRadius: 'var(--radius-md)',
  background: 'var(--chat-accent-primary, #c8892a)',
  color: 'var(--chat-accent-on-primary)',
  fontSize: 13,
  fontWeight: 600,
  padding: '8px 14px',
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
  padding: '7px 11px',
  cursor: 'pointer',
} as const;

function titleCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join(' ');
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
          padding: '14px 20px',
          borderBottom: '1px solid var(--settings-border)',
        }}
      >
        <div style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 600 }}>{title}</div>
        {description ? (
          <div style={{ color: 'var(--text-3)', fontSize: 12, lineHeight: 1.5, marginTop: 3 }}>
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
        margin: '10px 0 0',
        color: 'var(--settings-destructive-text)',
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      {toUserMessage(error, 'Could not load your team.')}
    </p>
  );
}

export function TeamSection() {
  const overviewQuery = useOrganizationOverview();
  const overview = overviewQuery.data;
  const organization = overview?.organization ?? null;
  const access = overview?.access;

  const membersQuery = useTeamMembers(organization?.id);
  const invitationsQuery = useTeamInvitations(organization?.id);
  const createOrganization = useCreateOrganization();
  const updateOrganization = useUpdateOrganizationSettings();
  const switchWorkspace = useSwitchWorkspace();
  const createInvitation = useCreateTeamInvitation();
  const resendInvitation = useResendTeamInvitation();
  const revokeInvitation = useRevokeTeamInvitation();
  const leaveOrganization = useLeaveOrganization();
  const updateRole = useUpdateTeamMemberRole();
  const removeMember = useRemoveTeamMember();

  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<TeamInvitation['role']>('member');
  const [pendingAction, setPendingAction] = useState<PendingMemberAction>(null);
  const [invitationLink, setInvitationLink] = useState<{
    email: string;
    url: string;
  } | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [successorUserId, setSuccessorUserId] = useState('');

  useEffect(() => {
    if (organization) {
      setWorkspaceName(organization.name);
      setWorkspaceSlug(organization.slug);
    }
  }, [organization]);

  if (overviewQuery.isLoading) {
    return (
      <div role="status" style={{ color: 'var(--text-3)', fontSize: 13, padding: 20 }}>
        Loading team settings…
      </div>
    );
  }

  if (overviewQuery.isError || !overview || !access) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
        <p role="alert" style={{ color: 'var(--text-2)', fontSize: 13, margin: 0 }}>
          Team settings could not be loaded.
        </p>
        <button
          type="button"
          onClick={() => void overviewQuery.refetch()}
          style={{ ...primaryButtonStyle, alignSelf: 'flex-start' }}
        >
          <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
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
  const workspaces = overview.workspaces ?? [];

  const workspacePicker =
    workspaces.length > 0 ? (
      <SectionCard
        title="Active workspace"
        description="Switching reloads tenant-owned chats, projects, tools, and settings together."
      >
        <div style={{ padding: 20, maxWidth: 520 }}>
          <label style={{ display: 'grid', gap: 7, color: 'var(--text-2)', fontSize: 13 }}>
            Workspace
            <select
              aria-label="Active workspace"
              value={overview.activeOrganizationId ?? 'personal'}
              disabled={switchWorkspace.isPending}
              onChange={(event) => {
                switchWorkspace.mutate(
                  event.target.value === 'personal' ? null : event.target.value,
                );
              }}
              style={controlStyle}
            >
              <option value="personal">Personal</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name} · {titleCase(workspace.role)}
                </option>
              ))}
            </select>
          </label>
          <InlineError error={switchWorkspace.error} />
        </div>
      </SectionCard>
    ) : null;

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createOrganization.mutate({
      name: workspaceName.trim(),
      slug: workspaceSlug.trim(),
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
          setInvitationLink({ email, url: buildInvitationLink(result.inviteToken) });
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
            email: invitation.email,
            url: buildInvitationLink(result.inviteToken),
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
      revokeInvitation.mutate({
        invitationId: pendingAction.invitation.id,
        organizationId: organization.id,
      });
    } else if (pendingAction.kind === 'leave-workspace') {
      leaveOrganization.mutate(successorUserId ? { successorUserId } : {});
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div>
          <h1
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 24,
              fontWeight: 500,
              color: 'var(--text-1)',
              margin: '0 0 4px',
            }}
          >
            Team
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
            Create and manage your AGI workspace.
          </p>
        </div>

        {workspacePicker}

        {!access.canManageTeam ? (
          <SectionCard title="Team administration">
            <div style={{ padding: 20 }}>
              <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.55, margin: 0 }}>
                Team administration requires a Team or Enterprise plan. Choose at least 2 Team seats
                to create a workspace. Your current plan is {titleCase(access.plan)}.
              </p>
              <SettingsPageLink
                href="/pricing#pricing-team-title"
                style={{
                  ...primaryButtonStyle,
                  display: 'inline-flex',
                  alignItems: 'center',
                  marginTop: 14,
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
              style={{ display: 'grid', gap: 16, padding: 20, maxWidth: 520 }}
            >
              <label style={{ display: 'grid', gap: 7, color: 'var(--text-2)', fontSize: 13 }}>
                Workspace name
                <input
                  aria-label="Workspace name"
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  required
                  maxLength={120}
                  style={controlStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 7, color: 'var(--text-2)', fontSize: 13 }}>
                Workspace slug
                <input
                  aria-label="Workspace slug"
                  value={workspaceSlug}
                  onChange={(event) => setWorkspaceSlug(event.target.value.toLowerCase())}
                  required
                  maxLength={60}
                  pattern="[a-z0-9-]+"
                  placeholder="acme-team"
                  style={controlStyle}
                />
              </label>
              <InlineError error={createOrganization.error} />
              <button
                type="submit"
                disabled={createOrganization.isPending}
                style={{ ...primaryButtonStyle, justifySelf: 'start' }}
              >
                <Building2 size={14} style={{ marginRight: 7, verticalAlign: -2 }} />
                {createOrganization.isPending ? 'Creating…' : 'Create workspace'}
              </button>
            </form>
          </SectionCard>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 4px',
          }}
        >
          Team
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Manage workspace details and the AGI accounts with access.
        </p>
      </div>

      {workspacePicker}

      {!access.canManageTeam ? (
        <div
          role="alert"
          style={{
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-2)',
            fontSize: 13,
            lineHeight: 1.5,
            padding: '12px 14px',
          }}
        >
          This workspace is on the {titleCase(access.plan)} plan. Workspace administration needs a
          Team or Enterprise workspace plan.
        </div>
      ) : null}

      <SectionCard title="Workspace details" description={`Plan: ${titleCase(access.plan)}`}>
        <form
          onSubmit={handleSaveWorkspace}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
            gap: 14,
            padding: 20,
          }}
        >
          <label style={{ display: 'grid', gap: 7, color: 'var(--text-2)', fontSize: 13 }}>
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
          <label style={{ display: 'grid', gap: 7, color: 'var(--text-2)', fontSize: 13 }}>
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
          seatSource === 'billing'
            ? 'Licensed seat totals are synchronized from Stripe billing.'
            : 'Seat totals are not linked to a Stripe subscription yet.'
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 18,
            padding: 20,
          }}
        >
          <div>
            <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Licensed</div>
            <div style={{ color: 'var(--text-1)', fontSize: 20, fontWeight: 650 }}>
              {licensedSeats ?? ', '}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-3)', fontSize: 12 }}>In use</div>
            <div style={{ color: 'var(--text-1)', fontSize: 20, fontWeight: 650 }}>
              {seatsConsumed ?? ', '}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Available</div>
            <div style={{ color: 'var(--text-1)', fontSize: 20, fontWeight: 650 }}>
              {seatsAvailable ?? ', '}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 8 }}>
            <SettingsPageLink
              href={
                typeof licensedSeats === 'number'
                  ? `/pricing?seats=${licensedSeats}#pricing-team-title`
                  : '/pricing#pricing-team-title'
              }
              style={{ ...secondaryButtonStyle, display: 'inline-flex', textDecoration: 'none' }}
            >
              Change seats
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
            padding: '10px 20px',
          }}
        >
          Active members and pending invitations each reserve one seat.
        </p>
      </SectionCard>

      {canAdminister ? (
        <SectionCard title="Invite teammate" description="Invitations expire after 7 days.">
          <form
            onSubmit={handleInviteMember}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'end',
              padding: 20,
            }}
          >
            <label
              style={{
                display: 'grid',
                flex: '1 1 240px',
                gap: 7,
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
                gap: 7,
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
              <Mail size={14} style={{ marginRight: 7, verticalAlign: -2 }} />
              {createInvitation.isPending ? 'Creating…' : 'Create invitation'}
            </button>
            <div style={{ flexBasis: '100%' }}>
              <p style={{ color: 'var(--text-3)', fontSize: 12, lineHeight: 1.5, margin: 0 }}>
                No email is sent yet. Copy the private link after creating the invitation and send
                it to that address. The recipient must sign in with the invited email.
              </p>
              {seatsAvailable === 0 ? (
                <p role="alert" style={{ color: 'var(--text-2)', fontSize: 12, margin: '8px 0 0' }}>
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
                padding: 20,
              }}
            >
              <div
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <div style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 600 }}>
                  Private link for {invitationLink.email}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss invitation link"
                  onClick={() => setInvitationLink(null)}
                  style={{ ...secondaryButtonStyle, minHeight: 32, padding: 7 }}
                >
                  <X size={14} />
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
                  <Copy size={14} style={{ marginRight: 7, verticalAlign: -2 }} />
                  {copyStatus === 'copied' ? 'Copied' : 'Copy link'}
                </button>
              </div>
              {copyStatus === 'failed' ? (
                <p role="alert" style={{ color: 'var(--text-2)', fontSize: 12, margin: '8px 0 0' }}>
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
          description={`${pendingInvitations.length} pending ${pendingInvitations.length === 1 ? 'invitation' : 'invitations'}`}
        >
          {invitationsQuery.isLoading ? (
            <div role="status" style={{ padding: 20, color: 'var(--text-3)', fontSize: 13 }}>
              Loading invitations…
            </div>
          ) : invitationsQuery.isError ? (
            <div style={{ padding: 20 }}>
              <p role="alert" style={{ color: 'var(--text-2)', fontSize: 13, margin: '0 0 10px' }}>
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
            <div style={{ padding: 20, color: 'var(--text-3)', fontSize: 13 }}>
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
                  gap: 10,
                  minHeight: 66,
                  padding: '12px 20px',
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
                  <RotateCw size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
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
            ? `${organization.memberCount} active ${organization.memberCount === 1 ? 'member' : 'members'}`
            : `${organization.memberCount} of ${access.maxMembers} licensed members`
        }
      >
        {membersQuery.isLoading ? (
          <div role="status" style={{ padding: 20, color: 'var(--text-3)', fontSize: 13 }}>
            Loading members…
          </div>
        ) : membersQuery.isError ? (
          <div style={{ padding: 20 }}>
            <p role="alert" style={{ color: 'var(--text-2)', fontSize: 13, margin: '0 0 10px' }}>
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
                  gap: 12,
                  minHeight: 66,
                  padding: '12px 20px',
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
                </div>
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
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            <Users size={20} style={{ marginBottom: 8 }} />
            <div>No members found.</div>
          </div>
        )}
        <InlineError error={updateRole.error ?? removeMember.error} />
      </SectionCard>

      <SectionCard
        title="Workspace membership"
        description="Leaving releases your seat and removes this workspace from your account."
      >
        <div style={{ padding: 20 }}>
          {isOwner ? (
            <>
              <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                Choose a successor. Ownership transfers and your membership is removed in one safe
                operation, so the workspace is never orphaned.
              </p>
              <label
                style={{
                  display: 'grid',
                  gap: 7,
                  color: 'var(--text-2)',
                  fontSize: 13,
                  marginTop: 14,
                }}
              >
                New owner
                <select
                  aria-label="New workspace owner"
                  value={successorUserId}
                  onChange={(event) => setSuccessorUserId(event.target.value)}
                  style={{ ...controlStyle, maxWidth: 360 }}
                >
                  <option value="">Choose a member</option>
                  {(membersQuery.data ?? [])
                    .filter((member) => !member.isCurrentUser)
                    .map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.name} ({member.email})
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setPendingAction({ kind: 'leave-workspace' })}
                disabled={!successorUserId || leaveOrganization.isPending}
                style={{
                  ...secondaryButtonStyle,
                  color: 'var(--settings-destructive-text)',
                  marginTop: 14,
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
                onClick={() => setPendingAction({ kind: 'leave-workspace' })}
                disabled={leaveOrganization.isPending}
                style={{
                  ...secondaryButtonStyle,
                  color: 'var(--settings-destructive-text)',
                  marginTop: 14,
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
                  : pendingAction?.kind === 'leave-workspace'
                    ? isOwner
                      ? 'Transfer ownership and leave?'
                      : 'Leave workspace?'
                    : 'Change member role?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.kind === 'remove'
                ? `${pendingAction.member.name} will immediately lose access to this workspace.`
                : pendingAction?.kind === 'revoke-invitation'
                  ? `${pendingAction.invitation.email} will no longer be able to join with this link. Its reserved seat becomes available immediately.`
                  : pendingAction?.kind === 'leave-workspace'
                    ? isOwner
                      ? 'The selected member becomes owner, then you immediately lose access and your seat becomes available.'
                      : 'You will immediately lose access to this workspace and your seat becomes available. This cannot be undone by you.'
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
                  : pendingAction?.kind === 'leave-workspace'
                    ? isOwner
                      ? 'Transfer and leave'
                      : 'Leave workspace'
                    : 'Change role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
