/**
 * Behaviour for the sidebar's project rows, shared by the two web shells.
 *
 * WebChatPage and WebAppShell each mount their own `<Sidebar>`, and the same
 * three-dot menu behaved differently depending on which route the user was on:
 * pin persisted on `/chat` and was store-only (lost on reload) on
 * `/chat/projects`, delete rolled back on one shell and not the other, and the
 * project links were encoded on one side only. Same rationale as
 * `app-nav-items.ts` and `sidebar-session-actions.ts`: one definition, two
 * call sites.
 */

import { toast } from 'sonner';
import { webManagedCloudProjects } from '@/features/projects/services/managed-cloud-projects';
import { toUserMessage } from '@/lib/user-error-message';

export interface SidebarProjectRow {
  id: string;
  name?: string;
  starred?: boolean;
}

export function projectHref(projectId: string): string {
  return `/chat/projects/${encodeURIComponent(projectId)}`;
}

export function projectNewChatHref(projectId: string): string {
  return `/chat?projectId=${encodeURIComponent(projectId)}`;
}

export async function copyProjectLink(projectId: string): Promise<void> {
  const url = `${window.location.origin}${projectHref(projectId)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Project link copied');
  } catch {
    toast.error('Could not copy the project link');
  }
}

export async function toggleProjectPin(
  project: SidebarProjectRow,
  applyStarred: (projectId: string, starred: boolean) => void,
): Promise<void> {
  const previous = project.starred ?? false;
  applyStarred(project.id, !previous);
  try {
    await webManagedCloudProjects.updateProject(project.id, { starred: !previous });
  } catch (error) {
    applyStarred(project.id, previous);
    toast.error(toUserMessage(error, 'Failed to update pin'));
  }
}

export async function deleteProjectOptimistically<T extends SidebarProjectRow>(
  project: T,
  removeProject: (projectId: string) => void,
  restoreProject: (project: T) => void,
): Promise<void> {
  removeProject(project.id);
  try {
    await webManagedCloudProjects.deleteProject(project.id);
  } catch (error) {
    restoreProject(project);
    toast.error(toUserMessage(error, 'Failed to delete project'));
  }
}
