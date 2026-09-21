'use client';

import { useChatStore } from '@shared/stores/web-chat-store';
import { useToolStore } from '@shared/stores/tool-store';
import { isArtifactPersistenceDegraded } from '@features/chat/stores/artifacts-store';
import { useStreamingArtifactStore } from '@features/chat/stores/streaming-artifact-store';
import { useVoiceModeActive } from '@features/chat/stores/voice-session-store';
import { useActiveUploadStore } from '@/features/workspaces/lib/active-uploads';

export const WORKSPACE_INTERRUPTION_KINDS = [
  'draft',
  'upload',
  'reply',
  'voice',
  'computer-control',
  'approval',
  'artifact',
] as const;

export type WorkspaceInterruptionKind = (typeof WORKSPACE_INTERRUPTION_KINDS)[number];

export interface WorkspaceInterruption {
  kind: WorkspaceInterruptionKind;
  description: string;
}

export interface WorkspaceWorkSnapshot {
  unsentDraftCount: number;
  activeUploadCount: number;
  replyInFlight: boolean;
  voiceSessionLive: boolean;
  computerControlRunning: boolean;
  pendingApprovalCount: number;
  artifactUnsaved: boolean;
}

export const EMPTY_WORKSPACE_WORK: WorkspaceWorkSnapshot = {
  unsentDraftCount: 0,
  activeUploadCount: 0,
  replyInFlight: false,
  voiceSessionLive: false,
  computerControlRunning: false,
  pendingApprovalCount: 0,
  artifactUnsaved: false,
};

// A switch cancels every request and reloads into the new scope, so anything
// listed here is lost rather than resumed.
export function describeWorkspaceInterruptions(
  snapshot: WorkspaceWorkSnapshot,
): WorkspaceInterruption[] {
  const interruptions: WorkspaceInterruption[] = [];
  if (snapshot.unsentDraftCount > 0) {
    interruptions.push({
      kind: 'draft',
      description:
        snapshot.unsentDraftCount === 1
          ? 'You have an unsent message.'
          : `You have ${snapshot.unsentDraftCount} unsent messages.`,
    });
  }
  if (snapshot.activeUploadCount > 0) {
    interruptions.push({
      kind: 'upload',
      description:
        snapshot.activeUploadCount === 1
          ? 'A file is still uploading.'
          : `${snapshot.activeUploadCount} files are still uploading.`,
    });
  }
  if (snapshot.replyInFlight) {
    interruptions.push({ kind: 'reply', description: 'A reply is still being written.' });
  }
  if (snapshot.voiceSessionLive) {
    interruptions.push({ kind: 'voice', description: 'A voice session is live.' });
  }
  if (snapshot.computerControlRunning) {
    interruptions.push({
      kind: 'computer-control',
      description: 'A browser or computer action is still running.',
    });
  }
  if (snapshot.pendingApprovalCount > 0) {
    interruptions.push({
      kind: 'approval',
      description:
        snapshot.pendingApprovalCount === 1
          ? 'A tool is waiting for your approval.'
          : `${snapshot.pendingApprovalCount} tools are waiting for your approval.`,
    });
  }
  if (snapshot.artifactUnsaved) {
    interruptions.push({ kind: 'artifact', description: 'An artifact has not been saved yet.' });
  }
  return interruptions;
}

function countUnsentDrafts(drafts: Record<string, string>): number {
  return Object.values(drafts).filter((draft) => draft.trim().length > 0).length;
}

export function useWorkspaceWorkSnapshot(): WorkspaceWorkSnapshot {
  const unsentDraftCount = useChatStore((state) => countUnsentDrafts(state.draftsByConversation));
  const replyInFlight = useChatStore((state) => state.isStreaming);
  const activeUploadCount = useActiveUploadStore((state) => state.uploads.length);
  const pendingApprovalCount = useToolStore(
    (state) => state.pendingApprovals.filter((approval) => approval.status === 'pending').length,
  );
  const computerControlRunning = useToolStore((state) =>
    state.actionLog.some(
      (entry) => (entry.type === 'browser' || entry.type === 'ui') && entry.status === 'running',
    ),
  );
  const artifactStreaming = useStreamingArtifactStore((state) => state.streaming !== null);
  const voiceSessionLive = useVoiceModeActive();

  return {
    unsentDraftCount,
    activeUploadCount,
    replyInFlight,
    voiceSessionLive,
    computerControlRunning,
    pendingApprovalCount,
    artifactUnsaved: artifactStreaming || isArtifactPersistenceDegraded(),
  };
}

export function useWorkspaceSwitchInterruptions(): WorkspaceInterruption[] {
  return describeWorkspaceInterruptions(useWorkspaceWorkSnapshot());
}
