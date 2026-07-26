'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Building2, RefreshCw, Trash2, UserPlus, Users } from 'lucide-react';
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
  useInviteTeamMember,
  useOrganizationOverview,
  useRemoveTeamMember,
  useTeamMembers,
  useUpdateOrganizationSettings,
  useUpdateTeamMemberRole,
  type TeamMember,
} from '../hooks/use-settings-queries';

type MemberRole = TeamMember['role'];

type PendingMemberAction =
  | { kind: 'role'; member: TeamMember; role: MemberRole }
  | { kind: 'remove'; member: TeamMember }
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
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  padding: '8px 14px',
  cursor: 'pointer',
} as const;

function titleCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join(' ');
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
        color: 'var(--settings-destructive-foreground, #ef4444)',
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      {error.message}
    </p>
  );
}

export function TeamSection() {
  const overviewQuery = useOrganizationOverview();
  const overview = overviewQuery.data;
  const organization = overview?.organization ?? null;
  const access = overview?.access;

  const membersQuery = useTeamMembers(organization?.id);
  const createOrganization = useCreateOrganization();
  const updateOrganization = useUpdateOrganizationSettings();
  const addMember = useInviteTeamMember();
  const updateRole = useUpdateTeamMemberRole();
  const removeMember = useRemoveTeamMember();

  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<MemberRole>('member');
  const [pendingAction, setPendingAction] = useState<PendingMemberAction>(null);

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
    ['owner', 'admin'].includes(organization.currentUserRole);
  const isOwner = organization?.currentUserRole === 'owner';

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

  function handleAddMember(event: FormEvent) {
    event.preventDefault();
    if (!organization) return;
    addMember.mutate({
      organizationId: organization.id,
      email: memberEmail.trim(),
      role: memberRole,
    });
  }

  function confirmMemberAction() {
    if (!pendingAction || !organization) return;
    if (pendingAction.kind === 'remove') {
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
              fontFamily: 'var(--serif)',
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

        {!access.canManageTeam ? (
          <SectionCard title="Team administration">
            <div style={{ padding: 20 }}>
              <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.55, margin: 0 }}>
                Team administration requires a provisioned Team or Enterprise plan. Your current
                plan is {titleCase(access.plan)}.
              </p>
              <Link
                href="/contact-sales"
                style={{
                  ...primaryButtonStyle,
                  display: 'inline-flex',
                  alignItems: 'center',
                  marginTop: 14,
                  textDecoration: 'none',
                }}
              >
                Contact sales
              </Link>
            </div>
          </SectionCard>
        ) : (
          <SectionCard
            title="Create your workspace"
            description="Your account can belong to one workspace in the current product."
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
            fontFamily: 'var(--serif)',
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
          Workspace administration is paused because the account no longer has an active Team or
          Enterprise entitlement.
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

      {canAdminister ? (
        <SectionCard
          title="Add an existing account"
          description="The person must already have an AGI account."
        >
          <form
            onSubmit={handleAddMember}
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
              AGI account email
              <input
                aria-label="AGI account email"
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
                aria-label="Member role"
                value={memberRole}
                onChange={(event) => setMemberRole(event.target.value as MemberRole)}
                style={controlStyle}
              >
                <option value="member">Member role</option>
                <option value="viewer">Viewer role</option>
                <option value="admin">Admin role</option>
                {isOwner ? <option value="owner">Owner role</option> : null}
              </select>
            </label>
            <button type="submit" disabled={addMember.isPending} style={primaryButtonStyle}>
              <UserPlus size={14} style={{ marginRight: 7, verticalAlign: -2 }} />
              {addMember.isPending ? 'Adding…' : 'Add member'}
            </button>
            <div style={{ flexBasis: '100%' }}>
              <p style={{ color: 'var(--text-3)', fontSize: 12, lineHeight: 1.5, margin: 0 }}>
                No invitation email is sent. If the address has no AGI account, nothing is added.
              </p>
              <InlineError error={addMember.error} />
            </div>
          </form>
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
                  <div style={{ color: 'var(--text-1)', fontSize: 13, fontWeight: 600 }}>
                    {member.name}
                    {member.isCurrentUser ? (
                      <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> (you)</span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      color: 'var(--text-3)',
                      fontSize: 12,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
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
                      style={{ ...controlStyle, width: 135 }}
                    >
                      <option value="viewer">Viewer role</option>
                      <option value="member">Member role</option>
                      <option value="admin">Admin role</option>
                      {isOwner ? <option value="owner">Owner role</option> : null}
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
                        color: 'var(--settings-destructive-foreground, #ef4444)',
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

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.kind === 'remove' ? 'Remove team member?' : 'Change member role?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.kind === 'remove'
                ? `${pendingAction.member.name} will immediately lose access to this workspace.`
                : pendingAction
                  ? `${pendingAction.member.name} will become ${titleCase(pendingAction.role)}. The workspace must always retain at least one owner.`
                  : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMemberAction}>
              {pendingAction?.kind === 'remove' ? 'Remove member' : 'Change role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
