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
  /**
   * The message's trailing UNCLOSED fence, derived whether or not the turn is
   * still running. Its presence after streaming ends is what says the artifact
   * never finished; a turn that closed its fence has none.
   */
  block: TrailingUnclosedBlock | null;
}

interface StreamedArtifactSnapshot {
  ordinal: number;
  type: ArtifactData['type'];
  language: string;
  title: string | null;
  content: string;
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
      // Either the fence closed, whichever side of the turn ending that
      // happened on, or the turn ended with it open. Only the second is worth
      // keeping, and the snapshot is spent either way.
      streamedRef.current = null;
      // The turn ended with a fence this hook watched open and never saw close.
      // Persist what arrived under the id the finished artifact would have
      // taken, so the panel keeps showing it instead of going blank and the
      // reader can copy or regenerate from it. The id is derived here rather
      // than reused from the snapshot: a first turn streams under a client-only
      // conversation id and settles under the real one.
      if (block && streamed) {
        useArtifactsStore.getState().upsertArtifact({
          id: computeDerivedArtifactId(conversationId, messageId, streamed.ordinal),
          type: streamed.type,
          title: streamed.title ?? INTERRUPTED_ARTIFACT_TITLE,
          language: streamed.language,
          content: streamed.content,
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

    streamedRef.current = {
      ordinal: block.ordinal,
      type,
      language: block.language,
      title,
      content: block.content,
    };

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
