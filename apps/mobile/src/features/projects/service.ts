import { mapFetchedManagedProject } from '@agiworkforce/sync';
import {
  listAllManagedCloudProjects,
  type ManagedCloudProjectUpdateRequest,
} from '@agiworkforce/cloud-contracts';
import { managedCloudProjects } from '@/services/managedCloudProjects';
import {
  assertCloudAccountEpochCurrent,
  captureCloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { beginCloudProjectFetch, useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useProjectSyncStateStore } from '@/stores/projects/projectSyncStateStore';

export async function loadMissingCloudProject(
  projectId: string,
  signal?: AbortSignal,
): Promise<void> {
  const account = captureCloudAccountEpoch();
  if (!account || useChatAppModeStore.getState().appMode !== 'cloud') {
    throw new Error('Cloud account is unavailable');
  }

  const pending = beginCloudProjectFetch(projectId);
  try {
    const project = await managedCloudProjects.getProject(projectId, { signal });
    assertCloudAccountEpochCurrent(account);
    if (signal?.aborted || useChatAppModeStore.getState().appMode !== 'cloud') return;
    if (!pending.isCurrent()) throw new Error('Project changed while loading');
    if (project.id !== projectId || project.ownerUserId !== account.ownerId) {
      throw new Error('Project is not owned by the current account');
    }
    if (!project.serverVersion) {
      throw new Error('Project sync version is unavailable');
    }

    const existing = useCloudProjectStore
      .getState()
      .projects.find((entry) => entry.id === projectId);
    if (existing?.deletedAt === null) return;
    if (existing || useProjectSyncStateStore.getState().dirtyProjectIds.includes(projectId)) {
      throw new Error('Project has pending local changes');
    }
    useCloudProjectStore.getState().upsertCloudProject(
      mapFetchedManagedProject({
        ...project,
        serverVersion: project.serverVersion,
      }),
    );
  } finally {
    pending.release();
  }
}

export async function refreshCloudProjectDetails(signal?: AbortSignal): Promise<void> {
  const account = captureCloudAccountEpoch();
  if (!account || useChatAppModeStore.getState().appMode !== 'cloud') return;
  const projects = await listAllManagedCloudProjects(managedCloudProjects, { signal });
  assertCloudAccountEpochCurrent(account);
  if (signal?.aborted) return;
  useCloudProjectStore
    .getState()
    .setCloudProjectDetails(projects.filter((project) => project.ownerUserId === account.ownerId));
}

export async function updateCloudProjectAppearance(
  projectId: string,
  patch: Pick<ManagedCloudProjectUpdateRequest, 'iconEmoji' | 'accentColor'>,
): Promise<void> {
  const account = captureCloudAccountEpoch();
  if (!account) throw new Error('Cloud account is unavailable');
  const store = useCloudProjectStore.getState();
  const previous = store.details[projectId];
  store.patchCloudProjectDetails(projectId, patch);
  try {
    const project = await managedCloudProjects.updateProject(projectId, patch);
    assertCloudAccountEpochCurrent(account);
    useCloudProjectStore.getState().setCloudProjectDetails([project]);
  } catch (error) {
    if (previous) useCloudProjectStore.getState().patchCloudProjectDetails(projectId, previous);
    throw error;
  }
}
