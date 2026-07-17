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
  /** True while the assistant message is still streaming. */
  isStreaming: boolean;
  /**
   * The trailing unclosed renderable fence parsed from the streaming buffer
   * (already filtered through `isRenderableArtifact` by the caller), or null.
   */
  block: TrailingUnclosedBlock | null;
}

/**
 * Mirrors a streaming message's trailing unclosed artifact fence into the
 * ephemeral streaming-artifact store, and auto-opens the Artifacts panel the
 * first time each artifact block starts.
 *
 * Lifecycle:
 *  - fence open + renderable → publish partial content on every chunk,
 *    open panel + select the deterministic artifact id (once per artifact);
 *  - fence closes mid-stream → `block` becomes null → clear the ephemeral
 *    entry; the persisted artifact (same id, upserted by MessageBubble's
 *    existing extraction effects) takes over in the panel seamlessly;
 *  - stream ends → clear any leftover entry for this message.
 */
export function useStreamingArtifactSync({
  messageId,
  conversationId,
  isStreaming,
  block,
}: UseStreamingArtifactSyncParams): void {
  // Which artifact id we already auto-opened the panel for (once per block).
  const openedForRef = useRef<string | null>(null);

  useEffect(() => {
    const store = useStreamingArtifactStore.getState();

    if (!isStreaming || !block) {
      // Fence closed (persisted artifact takes over) or stream finished.
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

    // Auto-open the panel + select the streaming artifact once per block.
    if (openedForRef.current !== artifactId) {
      openedForRef.current = artifactId;
      const artifacts = useArtifactsStore.getState();
      artifacts.selectArtifact(artifactId);
      artifacts.setPanelOpen(true);
    }
  }, [messageId, conversationId, isStreaming, block]);

  // On unmount, drop any live entry this message still owns so a navigation
  // away mid-stream cannot leave a stuck "writing…" tab behind.
  useEffect(() => {
    return () => {
      useStreamingArtifactStore.getState().clearStreamingArtifact(messageId);
    };
  }, [messageId]);
}
