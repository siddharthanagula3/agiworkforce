import { z } from 'zod';
import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';

const SHARED_PATH = '/api/settings/organization/shared';

const AccessSchema = z.enum(['read', 'write', 'none']);
export type ProjectMemberAccess = z.infer<typeof AccessSchema>;
export type ProjectShareAudience = 'workspace' | 'invited';

const SharedProjectSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  ownerUserId: z.string(),
  defaultAccess: AccessSchema,
  memberGrants: z.array(z.object({ userId: z.string(), access: AccessSchema })),
});

const MemberSchema = z.object({
  userId: z.string(),
  role: z.string(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  canEditProjects: z.boolean(),
});

const SharedConversationSchema = z.object({
  sharedSessionId: z.string(),
  token: z.string(),
  title: z.string(),
  ownerUserId: z.string(),
});

const SharedArtifactSchema = z.object({
  publishedArtifactId: z.string(),
  token: z.string(),
  title: z.string(),
  kind: z.string(),
  ownerUserId: z.string(),
});

const SharedConnectorSchema = z.object({
  connectorRowId: z.string(),
  name: z.string(),
  ownerUserId: z.string(),
});

const OverviewSchema = z.object({
  currentUserId: z.string(),
  canManageSharing: z.boolean(),
  canShareOwnProjects: z.boolean(),
  members: z.array(MemberSchema),
  sharedProjects: z.array(SharedProjectSchema),
  sharedConversations: z.array(SharedConversationSchema).default([]),
  sharedArtifacts: z.array(SharedArtifactSchema).default([]),
  sharedConnectors: z.array(SharedConnectorSchema).default([]),
});

export type ProjectSharingOverview = z.infer<typeof OverviewSchema>;
export type SharedProject = z.infer<typeof SharedProjectSchema>;
export type SharingMember = z.infer<typeof MemberSchema>;

export const PROJECT_SHARED_CONTEXT_COPY =
  'Members see its instructions and files, but each person’s chats stay private.';

export const ACCESS_LABELS: Readonly<Record<ProjectMemberAccess, string>> = {
  read: 'Can view',
  write: 'Can edit',
  none: 'No access',
};

export async function fetchProjectSharing(
  signal?: AbortSignal,
): Promise<ProjectSharingOverview | null> {
  try {
    const response = await api.get<unknown>(SHARED_PATH, signal ? { signal } : undefined);
    return OverviewSchema.parse(response);
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 403) return null;
    throw error;
  }
}

function projectPath(projectId: string): string {
  return `${SHARED_PATH}/projects/${encodeURIComponent(projectId)}`;
}

export async function shareProject(projectId: string, audience: ProjectShareAudience) {
  await api.put(projectPath(projectId), { audience });
}

export async function stopSharingProject(projectId: string) {
  await api.delete(projectPath(projectId));
}

export async function setProjectMemberAccess(
  projectId: string,
  userId: string,
  access: ProjectMemberAccess,
) {
  await api.patch(projectPath(projectId), { userId, access });
}

export function canManageProjectSharing(overview: ProjectSharingOverview, isOwner: boolean) {
  return overview.canManageSharing || (overview.canShareOwnProjects && isOwner);
}

export function shareAudience(project: SharedProject): ProjectShareAudience {
  return project.defaultAccess === 'none' ? 'invited' : 'workspace';
}

export function memberAccess(project: SharedProject, member: SharingMember): ProjectMemberAccess {
  const grant = project.memberGrants.find((entry) => entry.userId === member.userId);
  const access = grant ? grant.access : project.defaultAccess === 'none' ? 'none' : 'read';
  return access === 'write' && !member.canEditProjects ? 'read' : access;
}

export function memberName(member: SharingMember): string {
  return member.displayName || member.email || member.userId;
}

export interface SharedWithMeProject {
  projectId: string;
  name: string;
  ownerName: string;
  access: Exclude<ProjectMemberAccess, 'none'>;
}

export function projectsSharedWithMe(overview: ProjectSharingOverview): SharedWithMeProject[] {
  const me = overview.members.find((member) => member.userId === overview.currentUserId);
  if (!me) return [];
  return overview.sharedProjects.flatMap((project) => {
    if (project.ownerUserId === overview.currentUserId) return [];
    const access = memberAccess(project, me);
    if (access === 'none') return [];
    const owner = overview.members.find((member) => member.userId === project.ownerUserId);
    return [
      {
        projectId: project.projectId,
        name: project.name,
        ownerName: owner ? memberName(owner) : 'A workspace member',
        access,
      },
    ];
  });
}

export interface SharedWithMeResources {
  conversations: Array<{
    id: string;
    token: string;
    title: string;
    ownerName: string;
    url: string;
  }>;
  artifacts: Array<{ id: string; title: string; kind: string; ownerName: string; url: string }>;
  connectors: Array<{ id: string; name: string; ownerName: string }>;
}

export function sharedResourcesForMe(
  overview: ProjectSharingOverview,
  origin: string,
): SharedWithMeResources {
  const base = origin.replace(/\/+$/, '');
  const ownerName = (ownerUserId: string) => {
    const owner = overview.members.find((member) => member.userId === ownerUserId);
    return owner ? memberName(owner) : 'A workspace member';
  };
  const notMine = (entry: { ownerUserId: string }) => entry.ownerUserId !== overview.currentUserId;
  return {
    conversations: overview.sharedConversations.filter(notMine).map((entry) => ({
      id: entry.sharedSessionId,
      token: entry.token,
      title: entry.title,
      ownerName: ownerName(entry.ownerUserId),
      url: `${base}/share/${encodeURIComponent(entry.token)}`,
    })),
    artifacts: overview.sharedArtifacts.filter(notMine).map((entry) => ({
      id: entry.publishedArtifactId,
      title: entry.title,
      kind: entry.kind,
      ownerName: ownerName(entry.ownerUserId),
      url: `${base}/shared-artifact/${encodeURIComponent(entry.token)}`,
    })),
    connectors: overview.sharedConnectors.filter(notMine).map((entry) => ({
      id: entry.connectorRowId,
      name: entry.name,
      ownerName: ownerName(entry.ownerUserId),
    })),
  };
}
