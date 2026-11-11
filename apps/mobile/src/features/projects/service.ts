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
import {
  beginCloudProjectFetch,
  useCloudProjectStore,
  type CloudProjectDetails,
} from '@/stores/projects/cloudProjectStore';
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

export type CloudProjectDetailsPatch = Pick<
  ManagedCloudProjectUpdateRequest,
  'iconEmoji' | 'accentColor' | 'usesGlobalMemory' | 'usesAccountInstructions' | 'usesAccountStyle'
>;

interface ProjectDetailsEdits {
  pending: Array<{ patch: CloudProjectDetailsPatch }>;
  baseline: CloudProjectDetails | undefined;
  tail: Promise<void>;
}

const projectDetailsEdits = new Map<string, ProjectDetailsEdits>();

export async function updateCloudProjectDetails(
  projectId: string,
  patch: CloudProjectDetailsPatch,
): Promise<void> {
  const account = captureCloudAccountEpoch();
  if (!account) throw new Error('Cloud account is unavailable');
  const store = useCloudProjectStore.getState();
  const edits = projectDetailsEdits.get(projectId) ?? {
    pending: [],
    baseline: undefined,
    tail: Promise.resolve(),
  };
  projectDetailsEdits.set(projectId, edits);
  const queued = edits.pending.length > 0;
  if (!queued) edits.baseline = store.details[projectId];
  const edit = { patch };
  edits.pending.push(edit);
  store.patchCloudProjectDetails(projectId, patch);

  const send = async (): Promise<void> => {
    try {
      assertCloudAccountEpochCurrent(account);
      const project = await managedCloudProjects.updateProject(projectId, patch);
      assertCloudAccountEpochCurrent(account);
      const current = useCloudProjectStore.getState();
      current.setCloudProjectDetails([project]);
      edits.baseline = useCloudProjectStore.getState().details[projectId];
      edits.pending = edits.pending.filter((entry) => entry !== edit);
      for (const later of edits.pending) current.patchCloudProjectDetails(projectId, later.patch);
    } catch (error) {
      edits.pending = edits.pending.filter((entry) => entry !== edit);
      const claimed = new Set(edits.pending.flatMap((entry) => Object.keys(entry.patch)));
      const restore = Object.fromEntries(
        Object.keys(patch)
          .filter((key) => !claimed.has(key))
          .map((key) => [key, edits.baseline?.[key as keyof CloudProjectDetails]]),
      ) as Partial<CloudProjectDetails>;
      const current = useCloudProjectStore.getState();
      if (edits.baseline && current.details[projectId]) {
        current.patchCloudProjectDetails(projectId, restore);
      }
      throw error;
    } finally {
      if (edits.pending.length === 0 && projectDetailsEdits.get(projectId) === edits) {
        projectDetailsEdits.delete(projectId);
      }
    }
  };

  const run = queued ? edits.tail.then(send) : send();
  edits.tail = run.catch(() => undefined);
  return run;
}
