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

interface UseStreamingArtifactSyncParams {
  messageId: string;
  conversationId?: string;
  isStreaming: boolean;
  block: TrailingUnclosedBlock | null;
}

export function useStreamingArtifactSync({
  messageId,
  conversationId,
  isStreaming,
  block,
}: UseStreamingArtifactSyncParams): void {
  const openedForRef = useRef<string | null>(null);
  const autoOpenDismissedRef = useRef(false);

  useEffect(() => {
    autoOpenDismissedRef.current = false;
    openedForRef.current = null;
  }, [messageId]);

  useEffect(() => {
    const store = useStreamingArtifactStore.getState();

    if (!isStreaming || !block) {
      store.clearStreamingArtifact(messageId);
      return;
    }

    const artifactId = computeDerivedArtifactId(conversationId, messageId, block.ordinal);
    const type = detectArtifactType(block.language, block.content) as ArtifactData['type'];
    const title = extractArtifactTitle(block.content) ?? 'Generating artifact';

    store.setStreamingArtifact({
      artifactId,
      messageId,
      conversationId,
      type,
      language: block.language,
      title,
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
