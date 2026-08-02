/**
 * Team and workspace membership, rendered inline.
 *
 * `GET /api/settings/organization` and the `/api/settings/team` family all
 * authenticate through `getClerkAuthUser`, so the device bearer reads and
 * mutates them directly. This replaces a "Manage team" button that opened
 * `/settings/team` in a webview gated on a Clerk browser cookie Desktop never
 * holds — it could land on `/login` while the app showed the user signed in.
 *
 * Two honesty constraints are enforced here rather than papered over:
 *   - Whether the user may administer the workspace is the server's verdict
 *     (`access.canManageTeam`), not a plan label this client re-derives. When
 *     it is false the admin controls are absent, not merely disabled-looking.
 *   - "Add member" adds an EXISTING AGI account by email. There is no
 *     invitation persistence or email delivery in this repo, so the copy says
 *     exactly that and an unknown address surfaces the server's own message.
 *
 * Seat limits are not shown: `maxMembers` is structurally null server-side
 * because licensed seat quantity is not persisted, and a fabricated limit is
 * worse than none.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CLOUD_TEAM_ROLES,
  addCloudTeamMember,
  getCloudOrganizationOverview,
  listCloudTeamMembers,
  removeCloudTeamMember,
  updateCloudTeamMemberRole,
  type CloudOrganization,
  type CloudTeamMember,
  type CloudTeamRole,
} from '../../../api/cloudAccountSettings';
import { WEB_APP_URL } from '../../../api/config';
import { openExternalUrl } from '../../../utils/navigation';
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  SectionError,
  SectionHeading,
  SectionLoading,
} from './sectionChrome';

const ROLE_LABELS: Record<CloudTeamRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground';

export function CloudTeamSection() {
  const [organization, setOrganization] = useState<CloudOrganization | null>(null);
  const [canManageTeam, setCanManageTeam] = useState(false);
  const [members, setMembers] = useState<CloudTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CloudTeamRole>('member');
  const [adding, setAdding] = useState(false);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    try {
      const overview = await getCloudOrganizationOverview();
      if (generation.current !== current) return;
      setOrganization(overview.organization);
      setCanManageTeam(overview.canManageTeam);
      if (overview.organization) {
        const roster = await listCloudTeamMembers(overview.organization.id);
        if (generation.current === current) setMembers(roster);
      } else {
        setMembers([]);
      }
    } catch (caught) {
      if (generation.current === current) {
        setLoadFailed(true);
        setError(caught instanceof Error ? caught.message : 'Could not load your workspace.');
      }
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const handleRoleChange = async (member: CloudTeamMember, role: CloudTeamRole) => {
    setPendingMemberId(member.id);
    setError(null);
    setNotice(null);
    try {
      await updateCloudTeamMemberRole(member.id, role);
      setMembers((current) =>
        current.map((row) => (row.id === member.id ? { ...row, role } : row)),
      );
      setNotice(`${member.name} is now ${ROLE_LABELS[role].toLowerCase()}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change that role.');
    } finally {
      setPendingMemberId(null);
    }
  };

  const handleRemove = async (member: CloudTeamMember) => {
    setPendingMemberId(member.id);
    setError(null);
    setNotice(null);
    try {
      await removeCloudTeamMember(member.id);
      setMembers((current) => current.filter((row) => row.id !== member.id));
      setNotice(`${member.name} was removed from the workspace.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove that member.');
    } finally {
      setPendingMemberId(null);
    }
  };

  const handleAdd = async () => {
    if (!organization) return;
    const email = inviteEmail.trim();
    if (!email) return;
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      await addCloudTeamMember(organization.id, email, inviteRole);
      setInviteEmail('');
      setNotice(`${email} was added to the workspace.`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not add that person to your workspace.',
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="cloud-team">
      <SectionHeading
        title="Team &amp; enterprise"
        description="Workspace membership for your AGI Cloud account. Local Mode data on this device is never shared with a workspace."
      />

      {loading ? <SectionLoading label="Loading your workspace…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void load()} /> : null}
      {notice ? (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {!loading && !loadFailed && organization === null ? (
        <div className="rounded-lg border border-border bg-card/40 p-5">
          <p className="text-sm text-foreground">No workspace yet</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {canManageTeam
              ? 'Your plan includes workspace administration, but no workspace has been provisioned for this account yet. Contact sales to have one created.'
              : 'Workspace administration requires a provisioned Team or Enterprise account.'}
          </p>
          <button
            type="button"
            className={`mt-4 ${SECONDARY_BUTTON}`}
            onClick={() => {
              void openExternalUrl(new URL('/contact-sales', WEB_APP_URL).toString());
            }}
          >
            Contact sales
          </button>
        </div>
      ) : null}

      {!loading && organization ? (
        <>
          <div className="rounded-lg border border-border bg-card/40 p-5">
            <p className="text-xs text-muted-foreground">Workspace</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{organization.name}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {organization.memberCount} {organization.memberCount === 1 ? 'member' : 'members'} ·
              You are {ROLE_LABELS[organization.currentUserRole].toLowerCase()}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-foreground">Members</h3>
            {members.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No members to show.</p>
            ) : (
              <ul className="mt-3 overflow-hidden rounded-lg border border-border bg-card/40">
                {members.map((member, index) => (
                  <li
                    key={member.id}
                    className={`flex items-center justify-between gap-4 p-4 ${
                      index > 0 ? 'border-t border-border/60' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">
                        {member.name}
                        {member.isCurrentUser ? (
                          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {member.email || member.userId}
                      </p>
                    </div>
                    {canManageTeam ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <select
                          aria-label={`Role for ${member.name}`}
                          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:opacity-50"
                          value={member.role}
                          disabled={pendingMemberId === member.id}
                          onChange={(event) =>
                            void handleRoleChange(member, event.target.value as CloudTeamRole)
                          }
                        >
                          {CLOUD_TEAM_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={`${SMALL_BUTTON} text-destructive`}
                          disabled={pendingMemberId === member.id}
                          aria-busy={pendingMemberId === member.id || undefined}
                          onClick={() => void handleRemove(member)}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        {ROLE_LABELS[member.role]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canManageTeam ? (
            <div className="rounded-lg border border-border bg-card/40 p-5">
              <h3 className="text-sm font-medium text-foreground">Add a member</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Adds an existing AGI account to this workspace by email. AGI does not send
                invitation emails, so the person must already have an account.
              </p>
              <label
                className="mt-3 block text-xs font-medium text-foreground"
                htmlFor="cloud-team-email"
              >
                Email address
              </label>
              <input
                id="cloud-team-email"
                type="email"
                className={`mt-2 ${INPUT_CLASS}`}
                value={inviteEmail}
                placeholder="teammate@example.com"
                onChange={(event) => setInviteEmail(event.target.value)}
              />
              <label
                className="mt-3 block text-xs font-medium text-foreground"
                htmlFor="cloud-team-role"
              >
                Role
              </label>
              <select
                id="cloud-team-role"
                className={`mt-2 ${INPUT_CLASS}`}
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as CloudTeamRole)}
              >
                {CLOUD_TEAM_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`mt-4 ${PRIMARY_BUTTON}`}
                disabled={inviteEmail.trim().length === 0 || adding}
                aria-busy={adding || undefined}
                onClick={() => void handleAdd()}
              >
                {adding ? 'Adding…' : 'Add member'}
              </button>
            </div>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              You can see this workspace but not administer it. Role and membership changes require
              an owner or admin on a Team or Enterprise plan.
            </p>
          )}
        </>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">
        This Desktop build does not configure SSO or SCIM. No identity-provider setup is implied by
        a Team or Enterprise plan label.
      </p>
    </div>
  );
}
