'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderGit2, Plug, Share2, Users } from 'lucide-react';
import { getAuthToken } from '@shared/lib/get-auth-token';
import {
  useOrganizationSharedOverview,
  useSetSharedProjectMemberAccess,
  useShareConnectorWithOrganization,
  useShareProjectWithOrganization,
  useUnshareConnectorFromOrganization,
  useUnshareProjectFromOrganization,
  type OrgSharedOverview,
} from '../hooks/use-settings-queries';

/**
 * Organization sharing — the admin view of what the org shares and who can see it.
 *
 * HONEST SCOPE, stated in the UI rather than only in a comment:
 *   - Sharing is READ-ONLY. A member can open a shared project; only its owner
 *     can edit or delete it. The API refuses `write` for exactly this reason.
 *   - Sharing a project exposes its instructions and knowledge files to the
 *     organization. Conversations stay personal. The confirmation copy says so
 *     before the share happens, not after.
 *   - Only a project or connector the CALLER owns can be shared, so this screen
 *     never lists another member's private work as shareable.
 */

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
  overflow: 'hidden',
} as const;

const headerStyle = {
  padding: '14px 20px',
  borderBottom: '1px solid var(--settings-border)',
} as const;

const buttonStyle = {
  minHeight: 32,
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  fontSize: 12,
  padding: '5px 10px',
  cursor: 'pointer',
} as const;

const selectStyle = {
  minHeight: 32,
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  fontSize: 12,
  padding: '5px 8px',
} as const;

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section style={cardStyle}>
      <div style={headerStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--text-2)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {icon}
          {title}
        </div>
        <div style={{ color: 'var(--text-3)', fontSize: 12, lineHeight: 1.5, marginTop: 3 }}>
          {description}
        </div>
      </div>
      <div style={{ padding: '14px 20px', display: 'grid', gap: 12 }}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 12 }}>{children}</p>;
}

interface OwnProject {
  id: string;
  name: string;
  isOrgShared: boolean;
}

interface OwnConnector {
  id: string;
  name: string;
}

async function fetchOwnProjects(): Promise<OwnProject[]> {
  const token = await getAuthToken();
  if (!token) throw new Error('User not authenticated');
  const res = await fetch('/api/projects?limit=100', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { projects: OwnProject[] };
  // Only the caller's own projects can be shared; a project reached THROUGH a
  // share is not theirs to re-share.
  return (json.projects ?? []).filter((project) => !project.isOrgShared);
}

async function fetchOwnConnectors(): Promise<OwnConnector[]> {
  const token = await getAuthToken();
  if (!token) throw new Error('User not authenticated');
  const res = await fetch('/api/connectors/custom', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { connectors: OwnConnector[] };
  return json.connectors ?? [];
}

function SharedProjects({ overview }: { overview: OrgSharedOverview }) {
  const [selected, setSelected] = useState('');
  const shareProject = useShareProjectWithOrganization();
  const unshareProject = useUnshareProjectFromOrganization();
  const setAccess = useSetSharedProjectMemberAccess();

  const ownProjects = useQuery<OwnProject[], Error>({
    queryKey: ['projects', 'shareable'],
    queryFn: fetchOwnProjects,
    enabled: overview.canManageSharing,
    staleTime: 60 * 1000,
  });

  const sharedIds = useMemo(
    () => new Set(overview.sharedProjects.map((project) => project.projectId)),
    [overview.sharedProjects],
  );
  const shareable = (ownProjects.data ?? []).filter((project) => !sharedIds.has(project.id));

  return (
    <SectionCard
      icon={<FolderGit2 size={14} aria-hidden />}
      title="Shared projects"
      description="Members can open a shared project and read its instructions and knowledge files. Only the owner can edit or delete it, and conversations stay private to each member."
    >
      {overview.canManageSharing ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label htmlFor="org-share-project" style={{ position: 'absolute', left: -9999 }}>
            Project to share
          </label>
          <select
            id="org-share-project"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            style={{ ...selectStyle, minWidth: 220 }}
          >
            <option value="">Select one of your projects…</option>
            {shareable.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={buttonStyle}
            disabled={!selected || shareProject.isPending}
            onClick={() => {
              if (!selected) return;
              shareProject.mutate(selected, { onSuccess: () => setSelected('') });
            }}
          >
            {shareProject.isPending ? 'Sharing…' : 'Share project with organization'}
          </button>
        </div>
      ) : null}

      {overview.sharedProjects.length === 0 ? (
        <Empty>Nothing is shared yet.</Empty>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
          {overview.sharedProjects.map((project) => {
            const denied = new Set(
              project.memberGrants
                .filter((grant) => grant.access === 'none')
                .map((grant) => grant.userId),
            );
            const visibleTo = overview.members.filter((member) => !denied.has(member.userId));
            return (
              <li
                key={project.projectId}
                style={{
                  border: '1px solid var(--settings-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{project.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      Read-only · visible to {visibleTo.length} of {overview.members.length} members
                    </div>
                  </div>
                  {overview.canManageSharing ? (
                    <button
                      type="button"
                      style={buttonStyle}
                      disabled={unshareProject.isPending}
                      onClick={() => unshareProject.mutate(project.projectId)}
                    >
                      Stop sharing
                    </button>
                  ) : null}
                </div>

                {overview.canManageSharing ? (
                  <div style={{ display: 'grid', gap: 4 }}>
                    {overview.members.map((member) => {
                      const grant = project.memberGrants.find((g) => g.userId === member.userId);
                      const value = grant?.access === 'none' ? 'none' : 'read';
                      const controlId = `access-${project.projectId}-${member.userId}`;
                      return (
                        <div
                          key={member.userId}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
                        >
                          <label
                            htmlFor={controlId}
                            style={{ flex: 1, color: 'var(--text-2)', wordBreak: 'break-all' }}
                          >
                            {member.userId} ({member.role})
                          </label>
                          <select
                            id={controlId}
                            value={value}
                            style={selectStyle}
                            disabled={setAccess.isPending}
                            onChange={(event) =>
                              setAccess.mutate({
                                projectId: project.projectId,
                                userId: member.userId,
                                access: event.target.value === 'none' ? 'none' : 'inherit',
                              })
                            }
                          >
                            <option value="read">Can view</option>
                            <option value="none">No access</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function SharedConnectors({ overview }: { overview: OrgSharedOverview }) {
  const [selected, setSelected] = useState('');
  const shareConnector = useShareConnectorWithOrganization();
  const unshareConnector = useUnshareConnectorFromOrganization();

  const ownConnectors = useQuery<OwnConnector[], Error>({
    queryKey: ['connectors', 'custom', 'shareable'],
    queryFn: fetchOwnConnectors,
    enabled: overview.canManageSharing,
    staleTime: 60 * 1000,
  });

  const sharedIds = useMemo(
    () => new Set(overview.sharedConnectors.map((connector) => connector.connectorRowId)),
    [overview.sharedConnectors],
  );
  const shareable = (ownConnectors.data ?? []).filter((connector) => !sharedIds.has(connector.id));

  return (
    <SectionCard
      icon={<Plug size={14} aria-hidden />}
      title="Shared connectors"
      description="Connect a remote MCP server once and every member can use it in chat. Members can invoke it but never see its stored credential, and they cannot change or remove it."
    >
      {overview.canManageSharing ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label htmlFor="org-share-connector" style={{ position: 'absolute', left: -9999 }}>
            Connector to share
          </label>
          <select
            id="org-share-connector"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            style={{ ...selectStyle, minWidth: 220 }}
          >
            <option value="">Select one of your connectors…</option>
            {shareable.map((connector) => (
              <option key={connector.id} value={connector.id}>
                {connector.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={buttonStyle}
            disabled={!selected || shareConnector.isPending}
            onClick={() => {
              if (!selected) return;
              shareConnector.mutate(selected, { onSuccess: () => setSelected('') });
            }}
          >
            {shareConnector.isPending ? 'Sharing…' : 'Share connector with organization'}
          </button>
        </div>
      ) : null}

      {overview.sharedConnectors.length === 0 ? (
        <Empty>No connectors are shared yet.</Empty>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {overview.sharedConnectors.map((connector) => (
            <li
              key={connector.connectorRowId}
              style={{
                border: '1px solid var(--settings-border)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{connector.name}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-3)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  Available to all {overview.members.length} members as{' '}
                  <code>orgmcp-{connector.orgShortId}</code>
                </div>
              </div>
              {overview.canManageSharing ? (
                <button
                  type="button"
                  style={buttonStyle}
                  disabled={unshareConnector.isPending}
                  onClick={() => unshareConnector.mutate(connector.connectorRowId)}
                >
                  Stop sharing
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function OrganizationSharingSection() {
  const overviewQuery = useOrganizationSharedOverview();

  if (overviewQuery.isLoading) {
    return <p style={{ color: 'var(--text-3)', fontSize: 12 }}>Loading organization sharing…</p>;
  }

  if (overviewQuery.isError) {
    return (
      <p
        role="alert"
        style={{ color: 'var(--settings-destructive-foreground, #ef4444)', fontSize: 12 }}
      >
        {overviewQuery.error.message}
      </p>
    );
  }

  const overview = overviewQuery.data;
  if (!overview) {
    return (
      <section style={cardStyle}>
        <div style={headerStyle}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--text-2)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Share2 size={14} aria-hidden />
            Shared with your organization
          </div>
          <div style={{ color: 'var(--text-3)', fontSize: 12, lineHeight: 1.5, marginTop: 3 }}>
            You are not in an organization yet. Create one from the Team section to share projects
            and connectors with your members.
          </div>
        </div>
      </section>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionCard
        icon={<Users size={14} aria-hidden />}
        title="Who is in your organization"
        description={
          overview.canManageSharing
            ? 'You can change what the organization shares.'
            : 'Only an owner or admin can change what is shared.'
        }
      >
        <Empty>
          {overview.members.length} {overview.members.length === 1 ? 'member' : 'members'} · you are
          a {overview.currentUserRole}
        </Empty>
      </SectionCard>

      <SharedProjects overview={overview} />
      <SharedConnectors overview={overview} />
    </div>
  );
}
