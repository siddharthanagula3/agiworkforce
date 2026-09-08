'use client';

import { useEffect, useRef } from 'react';
import {
  computeDerivedArtifactId,
  detectArtifactType,
  extractArtifactTitle,
  type TrailingUnclosedBlock,
} from '@agiworkforce/artifacts';
import { useStreamingArtifactStore } from '../stores/streaming-artifact-store';
import { useArtifactsStore } from '../stores/artifacts-store';
import type { ArtifactData } from '../components/artifacts/ArtifactPreview';

const GENERATING_ARTIFACT_TITLE = 'Generating artifact';
const INTERRUPTED_ARTIFACT_TITLE = 'Stopped artifact';

interface UseStreamingArtifactSyncParams {
  messageId: string;
  conversationId?: string;
  isStreaming: boolean;
  block: TrailingUnclosedBlock | null;
}

interface StreamedArtifactSnapshot {
  artifactId: string;
  type: ArtifactData['type'];
  language: string;
  title: string | null;
}

export function useStreamingArtifactSync({
  messageId,
  conversationId,
  isStreaming,
  block,
}: UseStreamingArtifactSyncParams): void {
  const openedForRef = useRef<string | null>(null);
  const autoOpenDismissedRef = useRef(false);
  const streamedRef = useRef<StreamedArtifactSnapshot | null>(null);

  useEffect(() => {
    autoOpenDismissedRef.current = false;
    openedForRef.current = null;
    streamedRef.current = null;
  }, [messageId]);

  useEffect(() => {
    const store = useStreamingArtifactStore.getState();

    if (!isStreaming || !block) {
      const streamed = streamedRef.current;
      streamedRef.current = null;
      // A trailing block still open with the stream finished is a turn that was
      // stopped mid-artifact. Persist what arrived under the id the completed
      // artifact would have taken, so the panel keeps showing it instead of
      // going blank and the reader can copy or regenerate from it. A fence that
      // closed leaves `block` null and the message parser owns that artifact.
      if (streamed && block) {
        useArtifactsStore.getState().upsertArtifact({
          id: streamed.artifactId,
          type: streamed.type,
          title: streamed.title ?? INTERRUPTED_ARTIFACT_TITLE,
          language: streamed.language,
          content: block.content,
          messageId,
          conversationId,
          interrupted: true,
        });
      }
      store.clearStreamingArtifact(messageId);
      return;
    }

    const artifactId = computeDerivedArtifactId(conversationId, messageId, block.ordinal);
    const type = detectArtifactType(block.language, block.content) as ArtifactData['type'];
    const title = extractArtifactTitle(block.content) ?? null;

    streamedRef.current = { artifactId, type, language: block.language, title };

    store.setStreamingArtifact({
      artifactId,
      messageId,
      conversationId,
      type,
      language: block.language,
      title: title ?? GENERATING_ARTIFACT_TITLE,
      content: block.content,
    });

    if (openedForRef.current !== artifactId) {
      const artifacts = useArtifactsStore.getState();
      if (openedForRef.current !== null && !artifacts.panelOpen) {
        autoOpenDismissedRef.current = true;
      }
      openedForRef.current = artifactId;
      artifacts.selectArtifact(artifactId);
      if (!autoOpenDismissedRef.current) artifacts.autoOpenPanel();
    }
  }, [messageId, conversationId, isStreaming, block]);

  useEffect(() => {
    return () => {
      useStreamingArtifactStore.getState().clearStreamingArtifact(messageId);
    };
  }, [messageId]);
}
