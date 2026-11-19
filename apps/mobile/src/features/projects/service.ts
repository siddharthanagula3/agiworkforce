import { mapFetchedManagedProject } from '@agiworkforce/sync';
import {
  listAllManagedCloudProjects,
  type ManagedCloudProject,
  type ManagedCloudProjectUpdateRequest,
} from '@agiworkforce/cloud-contracts';
import { ApiHttpError, ApiPaywallError } from '@/services/apiErrors';
import { managedCloudProjects } from '@/services/managedCloudProjects';
import {
  assertCloudAccountEpochCurrent,
  captureCloudAccountEpoch,
  type CloudAccountEpoch,
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

function accountEpochIsCurrent(account: CloudAccountEpoch) {
  try {
    assertCloudAccountEpochCurrent(account);
    return true;
  } catch {
    return false;
  }
}

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
      if (patch.usesGlobalMemory !== undefined) {
        useProjectSyncStateStore.getState().clearProjectOnlyMemoryPending(projectId);
      }
      const current = useCloudProjectStore.getState();
      current.setCloudProjectDetails([project]);
      edits.baseline = useCloudProjectStore.getState().details[projectId];
      edits.pending = edits.pending.filter((entry) => entry !== edit);
      for (const later of edits.pending) current.patchCloudProjectDetails(projectId, later.patch);
    } catch (error) {
      edits.pending = edits.pending.filter((entry) => entry !== edit);
      const claimed = new Set(edits.pending.flatMap((entry) => Object.keys(entry.patch)));
      const current = useCloudProjectStore.getState();
      const held = current.details[projectId];
      const refreshedByServer = edits.baseline === undefined && held?.isOrgShared !== undefined;
      const restore = Object.fromEntries(
        Object.keys(patch)
          .filter((key) => !claimed.has(key))
          .map((key) => [key, edits.baseline?.[key as keyof CloudProjectDetails]]),
      ) as Partial<CloudProjectDetails>;
      if (held && !refreshedByServer && accountEpochIsCurrent(account)) {
        current.patchCloudProjectDetails(projectId, restore);
        const restored = useCloudProjectStore.getState().details[projectId];
        if (restored && Object.values(restored).every((value) => value === undefined)) {
          useCloudProjectStore.setState((state) => {
            const details = { ...state.details };
            delete details[projectId];
            return { details };
          });
        }
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

export type PendingProjectOnlyMemoryOutcome = 'confirmed' | 'refused' | 'settled';

function isProjectMemoryScopeRefusal(error: unknown): boolean {
  if (error instanceof ApiPaywallError) return true;
  return (
    error instanceof ApiHttpError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 401 &&
    error.status !== 404 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

export function confirmPendingProjectOnlyMemory(
  projectId: string,
  account: CloudAccountEpoch,
): Promise<PendingProjectOnlyMemoryOutcome> {
  const edits = projectDetailsEdits.get(projectId) ?? {
    pending: [],
    baseline: undefined,
    tail: Promise.resolve(),
  };
  projectDetailsEdits.set(projectId, edits);
  const queued = edits.pending.length > 0;
  if (!queued) edits.baseline = useCloudProjectStore.getState().details[projectId];
  const edit: { patch: CloudProjectDetailsPatch } = { patch: {} };
  edits.pending.push(edit);

  const isStillPending = () =>
    useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds.includes(projectId);

  const settle = (project: ManagedCloudProject | null): PendingProjectOnlyMemoryOutcome => {
    if (!isStillPending()) return 'settled';
    if (project && project.usesGlobalMemory !== false) return 'refused';
    useProjectSyncStateStore.getState().clearProjectOnlyMemoryPending(projectId);
    if (!project) return 'settled';
    const current = useCloudProjectStore.getState();
    current.setCloudProjectDetails([project]);
    edits.baseline = useCloudProjectStore.getState().details[projectId];
    for (const later of edits.pending) {
      if (later !== edit) current.patchCloudProjectDetails(projectId, later.patch);
    }
    return 'confirmed';
  };

  const readServerScope = async (): Promise<PendingProjectOnlyMemoryOutcome> => {
    try {
      const project = await managedCloudProjects.getProject(projectId);
      assertCloudAccountEpochCurrent(account);
      return settle(project);
    } catch (error) {
      assertCloudAccountEpochCurrent(account);
      if (error instanceof ApiHttpError && error.status === 404) return settle(null);
      if (isProjectMemoryScopeRefusal(error)) return isStillPending() ? 'refused' : 'settled';
      throw error;
    }
  };

  const send = async (): Promise<PendingProjectOnlyMemoryOutcome> => {
    try {
      assertCloudAccountEpochCurrent(account);
      if (!isStillPending()) return 'settled';
      let project: ManagedCloudProject;
      try {
        project = await managedCloudProjects.updateProject(projectId, { usesGlobalMemory: false });
      } catch (error) {
        assertCloudAccountEpochCurrent(account);
        if (error instanceof ApiHttpError && error.status === 404) return settle(null);
        if (isProjectMemoryScopeRefusal(error)) return await readServerScope();
        throw error;
      }
      assertCloudAccountEpochCurrent(account);
      return settle(project);
    } finally {
      edits.pending = edits.pending.filter((entry) => entry !== edit);
      if (edits.pending.length === 0 && projectDetailsEdits.get(projectId) === edits) {
        projectDetailsEdits.delete(projectId);
      }
    }
  };

  const run = queued ? edits.tail.then(send) : send();
  edits.tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
