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
  // AUDIT-FIX ART-29: sticky record that the user closed the panel after we
  // auto-opened it. Without this, every new artifact block in the same reply
  // (a message with three code fences opens the panel three times) re-opened a
  // panel the user had already dismissed — the UI kept overruling them.
  const autoOpenDismissedRef = useRef(false);

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
      const artifacts = useArtifactsStore.getState();
      // AUDIT-FIX ART-29: if we opened the panel for an earlier block of this
      // same stream and it is closed now, the user closed it. Respect that for
      // the rest of the stream: keep tracking + selecting the live artifact
      // (so the panel is correct if they re-open it) but stop forcing it open.
      if (openedForRef.current !== null && !artifacts.panelOpen) {
        autoOpenDismissedRef.current = true;
      }
      openedForRef.current = artifactId;
      artifacts.selectArtifact(artifactId);
      if (!autoOpenDismissedRef.current) artifacts.setPanelOpen(true);
    }
  }, [messageId, conversationId, isStreaming, block]);

  // A new message starts a new stream, so the previous dismissal no longer
  // applies — the next assistant reply may auto-open the panel again.
  useEffect(() => {
    autoOpenDismissedRef.current = false;
    openedForRef.current = null;
  }, [messageId]);

  // On unmount, drop any live entry this message still owns so a navigation
  // away mid-stream cannot leave a stuck "writing…" tab behind.
  useEffect(() => {
    return () => {
      useStreamingArtifactStore.getState().clearStreamingArtifact(messageId);
    };
  }, [messageId]);
}
