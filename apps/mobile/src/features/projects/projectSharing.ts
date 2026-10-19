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

const OverviewSchema = z.object({
  currentUserId: z.string(),
  canManageSharing: z.boolean(),
  canShareOwnProjects: z.boolean(),
  members: z.array(MemberSchema),
  sharedProjects: z.array(SharedProjectSchema),
});

export type ProjectSharingOverview = z.infer<typeof OverviewSchema>;
export type SharedProject = z.infer<typeof SharedProjectSchema>;
export type SharingMember = z.infer<typeof MemberSchema>;

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
