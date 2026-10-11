'use client';

import { useCallback, useMemo } from 'react';
import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { formatDeliverableTypeLine } from '@agiworkforce/types';
import type { Message } from '@shared/stores/web-chat-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useProjectStore } from '@features/projects';
import { toUserMessage } from '@/lib/user-error-message';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { downloadArtifactFile, downloadGeneratedFile } from '../../utils/downloadArtifacts';
import { ArtifactThumbnail } from '../artifacts/ArtifactThumbnail';
import { canRenderLivePreview } from '../artifacts/artifact-render';
import type { ArtifactData } from '../artifacts/ArtifactPreview';
import { TASK_DOCK_DOWNLOAD_ACTION, TASK_DOCK_OPEN_ACTION } from '../../lib/agi-work';
import { buildTaskDockSummary, type TaskDockOutput, type TaskDockSummary } from './taskDockSummary';

const BYTES_PER_KILOBYTE = 1_024;
const BYTES_PER_MEGABYTE = 1_048_576;
const DETAIL_SEPARATOR = ' · ';
const ARTIFACT_OUTPUT_DETAIL = 'Artifact';

export function useTaskDockSummary(messages: Message[]): TaskDockSummary {
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const artifacts = useArtifactsStore((state) =>
    activeConversationId ? state.getConversationArtifacts(activeConversationId) : [],
  );
  const projectId = useChatStore(
    (state) =>
      state.conversations.find((conversation) => conversation.id === state.activeConversationId)
        ?.projectId ?? null,
  );
  const projectName = useProjectStore(
    (state) => state.projects.find((project) => project.id === projectId)?.name ?? null,
  );
  return useMemo(
    () => buildTaskDockSummary({ messages, artifacts, projectName }),
    [artifacts, messages, projectName],
  );
}

function byteLabel(byteCount: number | undefined): string | undefined {
  if (byteCount === undefined) return undefined;
  if (byteCount < BYTES_PER_KILOBYTE) return `${byteCount} B`;
  if (byteCount < BYTES_PER_MEGABYTE) return `${(byteCount / BYTES_PER_KILOBYTE).toFixed(1)} KB`;
  return `${(byteCount / BYTES_PER_MEGABYTE).toFixed(1)} MB`;
}

function outputPreviewType(output: TaskDockOutput): ArtifactData['type'] | null {
  if (output.artifactContent === undefined || !output.artifactType) return null;
  const type = output.artifactType as ArtifactData['type'];
  return canRenderLivePreview(type) && type !== 'react' ? type : null;
}

function OutputLabel({ output }: { output: TaskDockOutput }) {
  const typeLine =
    output.mimeType || output.kind
      ? [
          formatDeliverableTypeLine({
            kind: output.kind,
            fileName: output.name,
            mimeType: output.mimeType,
          }),
          byteLabel(output.byteCount),
        ]
          .filter(Boolean)
          .join(DETAIL_SEPARATOR)
      : ARTIFACT_OUTPUT_DETAIL;
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-medium leading-5 text-foreground">{output.name}</span>
      <span className="truncate text-xs text-muted-foreground">{typeLine}</span>
    </span>
  );
}

function useOutputActions(onOpened?: () => void) {
  const knownArtifacts = useArtifactsStore((state) => state.artifacts);
  const selectArtifact = useArtifactsStore((state) => state.selectArtifact);
  const setArtifactPanelOpen = useArtifactsStore((state) => state.setPanelOpen);

  const openOutput = useCallback(
    (output: TaskDockOutput) => {
      const artifactAvailable =
        output.artifactId && knownArtifacts.some((artifact) => artifact.id === output.artifactId);
      if (output.artifactId && artifactAvailable) {
        selectArtifact(output.artifactId);
        setArtifactPanelOpen(true);
        onOpened?.();
        return;
      }
      if (output.uri) {
        window.open(output.uri, '_blank', 'noopener,noreferrer');
        onOpened?.();
      }
    },
    [knownArtifacts, onOpened, selectArtifact, setArtifactPanelOpen],
  );

  const downloadOutput = useCallback(async (output: TaskDockOutput) => {
    try {
      if (output.uri) {
        await downloadGeneratedFile(output.uri, output.name, output.mimeType);
        return;
      }
      if (output.artifactContent !== undefined) {
        await downloadArtifactFile({
          title: output.name,
          content: output.artifactContent,
          language: output.artifactLanguage,
          type: output.artifactType,
        });
      }
    } catch (error) {
      toast.error(toUserMessage(error, 'Could not download this output'));
    }
  }, []);

  return { openOutput, downloadOutput };
}

/**
 * The chat's outputs, as Claude's Outputs popover shows them: a static
 * thumbnail above each renderable artifact, a compact row for every file,
 * each opening in the panel and downloading from one icon button.
 */
export function OutputsList({
  outputs,
  onOpened,
}: {
  outputs: readonly TaskDockOutput[];
  onOpened?: () => void;
}) {
  const { openOutput, downloadOutput } = useOutputActions(onOpened);
  return (
    <ul className="space-y-2">
      {outputs.map((output) => {
        const canOpen = Boolean(output.artifactId || output.uri);
        const canDownload = Boolean(output.uri || output.artifactContent !== undefined);
        const previewType = outputPreviewType(output);
        return (
          <li
            key={output.id}
            className="overflow-hidden rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)]"
          >
            {previewType && output.artifactContent !== undefined && (
              <button
                type="button"
                onClick={() => openOutput(output)}
                className="block w-full border-b border-[var(--chat-border)] focus-visible:outline-none"
                tabIndex={-1}
                aria-hidden="true"
              >
                <ArtifactThumbnail
                  artifact={{
                    type: previewType,
                    content: output.artifactContent,
                    title: output.name,
                  }}
                  className="aspect-[16/9] w-full"
                />
              </button>
            )}
            <div className="flex items-center gap-2.5 py-2 pe-1.5 ps-3">
              {!previewType && (
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--chat-surface-hover)]"
                  aria-hidden="true"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </span>
              )}
              {canOpen ? (
                <button
                  type="button"
                  onClick={() => openOutput(output)}
                  className="min-w-0 flex-1 rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${TASK_DOCK_OPEN_ACTION} ${output.name}`}
                >
                  <OutputLabel output={output} />
                </button>
              ) : (
                <div className="min-w-0 flex-1">
                  <OutputLabel output={output} />
                </div>
              )}
              {canDownload && (
                <button
                  type="button"
                  onClick={() => void downloadOutput(output)}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:h-8 sm:w-8"
                  aria-label={`${TASK_DOCK_DOWNLOAD_ACTION} ${output.name}`}
                  title={TASK_DOCK_DOWNLOAD_ACTION}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
