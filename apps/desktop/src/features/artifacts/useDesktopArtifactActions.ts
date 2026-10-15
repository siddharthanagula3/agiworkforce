import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import {
  useChatArtifactStore,
  useChatUIStore,
  type Artifact as ChatArtifact,
  type ArtifactPanelHostAction,
} from '@agiworkforce/unified-chat';
import { selectPrivacyMode, useAppModeStore } from '@/stores/appModeStore';
import { useArtifactStore } from '@/stores/artifactStore';
import { nativeArtifactToChat } from './openArtifactInChat';
import { makeDesktopPublishCallback } from './publishAdapter';

const NO_ACTIONS: readonly ArtifactPanelHostAction[] = [];

/** A version the panel is showing carries `<id>::v<version>`; the stored row is `<id>`. */
function splitVersionId(id: string): { realId: string; version: number | null } {
  const [realId = id, version] = id.split('::v');
  const parsed = version === undefined ? NaN : Number(version);
  return { realId, version: Number.isInteger(parsed) ? parsed : null };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function closeArtifactPanel() {
  useChatArtifactStore.getState().closeArtifact();
  useChatUIStore.getState().closeArtifactPanel();
}

/**
 * What the Local desktop can do with a stored artifact from the chat's
 * artifact panel: the gallery management the separate viewer used to offer.
 * Managed Cloud artifacts are not stored on this device, so they get none.
 */
export function useDesktopArtifactActions(): readonly ArtifactPanelHostAction[] {
  const privacyMode = useAppModeStore(selectPrivacyMode);
  const activeArtifact = useChatArtifactStore((state) => state.activeArtifact);
  const summaries = useArtifactStore((state) => state.summaries);
  const storedId =
    privacyMode === 'local' && activeArtifact ? splitVersionId(activeArtifact.id).realId : null;
  const archived = useArtifactStore(
    (state) =>
      storedId !== null &&
      (state.artifacts.get(storedId) ?? state.summaries.find((summary) => summary.id === storedId))
        ?.status === 'archived',
  );

  useEffect(() => {
    if (storedId !== null) void useArtifactStore.getState().getArtifact(storedId);
  }, [storedId]);

  return useMemo(() => {
    if (privacyMode !== 'local' || !activeArtifact) return NO_ACTIONS;
    const { realId, version } = splitVersionId(activeArtifact.id);
    const pinned = summaries.find((summary) => summary.id === realId)?.pinned === true;
    const store = useArtifactStore.getState;

    const actions: ArtifactPanelHostAction[] = [];
    if (version !== null) {
      actions.push({
        id: 'restore-version',
        label: `Restore version ${version}`,
        onSelect: async () => {
          try {
            const restored = await store().rollbackArtifact(realId, version);
            if (!restored) throw new Error('The version could not be restored.');
            useChatArtifactStore.getState().openArtifact(nativeArtifactToChat(restored));
            toast.success(`Restored version ${version}`);
          } catch (error) {
            toast.error('Could not restore this version', { description: errorText(error) });
          }
        },
      });
    }
    actions.push(
      {
        id: 'pin',
        label: pinned ? 'Unpin from gallery' : 'Pin to gallery',
        onSelect: async () => {
          const pinnedNow = await store()
            .getArtifact(realId)
            .then((artifact) => artifact?.pinned === true)
            .catch(() => pinned);
          const saved = await store().pinArtifact(realId, !pinnedNow);
          if (saved) toast.success(pinnedNow ? 'Unpinned' : 'Pinned to the gallery');
          else toast.error('Could not update the pin on this artifact.');
        },
      },
      {
        id: 'save-copy',
        label: 'Save a copy to the artifacts folder',
        onSelect: async (artifact: ChatArtifact) => {
          try {
            const result = await makeDesktopPublishCallback({
              id: realId,
              title: artifact.title ?? 'Artifact',
              content: artifact.content,
              type: artifact.type,
              language: artifact.language,
            })();
            const path = result.shareUrl.replace(/^file:\/\//, '');
            toast.success('Saved a copy', {
              description: path,
              action: {
                label: 'Copy path',
                onClick: () => {
                  void navigator.clipboard.writeText(path).catch(() => {
                    toast.error('The path could not be copied.');
                  });
                },
              },
            });
          } catch (error) {
            toast.error('Could not save a copy', { description: errorText(error) });
          }
        },
      },
      archived
        ? {
            id: 'unarchive',
            label: 'Unarchive',
            onSelect: async () => {
              if (await store().unarchiveArtifact(realId)) toast.success('Artifact unarchived');
              else toast.error('Could not unarchive this artifact.');
            },
          }
        : {
            id: 'archive',
            label: 'Archive',
            onSelect: async () => {
              if (await store().archiveArtifact(realId)) {
                closeArtifactPanel();
                toast.success('Artifact archived');
              } else {
                toast.error('Could not archive this artifact.');
              }
            },
          },
      {
        id: 'delete',
        label: 'Delete',
        destructive: true,
        confirm: {
          title: 'Delete this artifact?',
          description: `“${activeArtifact.title ?? 'This artifact'}” and every saved version of it will be permanently removed from this device. The chat message that made it stays. This cannot be undone.`,
          confirmLabel: 'Delete artifact',
        },
        onSelect: async () => {
          const deleted = await store().deleteArtifact(realId);
          if (deleted) {
            closeArtifactPanel();
            toast.success('Artifact deleted');
          } else {
            toast.error('Could not delete this artifact.');
          }
        },
      },
    );
    return actions;
  }, [privacyMode, activeArtifact, summaries, archived]);
}
