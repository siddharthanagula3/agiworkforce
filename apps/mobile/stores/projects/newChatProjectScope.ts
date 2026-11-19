import { useProjectStore } from '@/src/features/projects/store';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useCloudProjectStore } from './cloudProjectStore';

interface SuspendedNewChatProjectScope {
  cloudProjectId: string | null;
  cloudAccount: CloudAccountEpoch | null;
  localProjectId: string | null;
}

let composerRoundTripStarting = false;
let suspendedScope: SuspendedNewChatProjectScope | null = null;

export function clearNewChatProjectScope(): void {
  composerRoundTripStarting = false;
  suspendedScope = null;
  if (useCloudProjectStore.getState().activeProjectId !== null) {
    useCloudProjectStore.getState().setActiveCloudProject(null);
  }
  if (useProjectStore.getState().activeProjectId !== null) {
    useProjectStore.setState({ activeProjectId: null });
  }
}

export function startNewChatComposerRoundTrip(): void {
  composerRoundTripStarting = true;
}

export function leaveNewChatComposer(): void {
  const keepForReturn = composerRoundTripStarting;
  const cloudProjectId = useCloudProjectStore.getState().activeProjectId;
  const localProjectId = useProjectStore.getState().activeProjectId;
  clearNewChatProjectScope();
  if (!keepForReturn || (cloudProjectId === null && localProjectId === null)) return;
  suspendedScope = {
    cloudProjectId,
    cloudAccount: cloudProjectId === null ? null : captureCloudAccountEpoch(),
    localProjectId,
  };
}

export function returnToNewChatComposer(): boolean {
  const scope = suspendedScope;
  composerRoundTripStarting = false;
  suspendedScope = null;
  if (scope === null) return false;
  if (
    useCloudProjectStore.getState().activeProjectId !== null ||
    useProjectStore.getState().activeProjectId !== null
  ) {
    return false;
  }
  let returned = false;
  if (scope.cloudProjectId !== null && isCloudAccountEpochCurrent(scope.cloudAccount)) {
    useCloudProjectStore.getState().setActiveCloudProject(scope.cloudProjectId);
    returned = useCloudProjectStore.getState().activeProjectId === scope.cloudProjectId;
  }
  if (
    scope.localProjectId !== null &&
    useProjectStore.getState().projects.some((project) => project.id === scope.localProjectId)
  ) {
    useProjectStore.setState({ activeProjectId: scope.localProjectId });
    returned = true;
  }
  return returned;
}
