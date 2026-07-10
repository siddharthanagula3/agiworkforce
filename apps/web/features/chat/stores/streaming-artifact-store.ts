'use client';

import { create } from 'zustand';
import type { ArtifactData } from '../components/artifacts/ArtifactPreview';

/**
 * Ephemeral (session-only, NEVER persisted) state for the artifact currently
 * being live-streamed into the Artifacts panel.
 *
 * Why a separate store instead of the artifacts store: streaming partial
 * content through the persisted `upsertArtifact` would append a version bump
 * on every token (the shared engine versions on content change) and thrash
 * localStorage. This store holds the growing partial content; the persisted
 * artifact is only written once the fence closes — exactly as before this
 * feature existed.
 *
 * Handoff invariant: `artifactId` is the SAME deterministic id
 * (`computeDerivedArtifactId(conversationId:messageId:ordinal)`) the completed
 * artifact will get, so the panel's selection carries over seamlessly when the
 * persisted artifact lands and this entry clears.
 */
export interface StreamingArtifact {
  /** Deterministic id — equals the eventual persisted artifact's id. */
  artifactId: string;
  messageId: string;
  conversationId?: string;
  type: ArtifactData['type'];
  language: string;
  title: string;
  /** Partial content streamed so far (grows on every chunk). */
  content: string;
}

interface StreamingArtifactStore {
  streaming: StreamingArtifact | null;
  /** Set/replace the live streaming artifact (called on each content chunk). */
  setStreamingArtifact: (artifact: StreamingArtifact) => void;
  /**
   * Clear the live entry. When `messageId` is given, only clears if the
   * current entry belongs to that message (guards against a stale clear
   * racing a newer message's stream).
   */
  clearStreamingArtifact: (messageId?: string) => void;
}

export const useStreamingArtifactStore = create<StreamingArtifactStore>((set, get) => ({
  streaming: null,

  setStreamingArtifact: (artifact) => {
    const current = get().streaming;
    // Skip no-op updates so subscribers don't re-render on identical state.
    if (
      current &&
      current.artifactId === artifact.artifactId &&
      current.content === artifact.content &&
      current.title === artifact.title
    ) {
      return;
    }
    set({ streaming: artifact });
  },

  clearStreamingArtifact: (messageId) => {
    const current = get().streaming;
    if (!current) return;
    if (messageId && current.messageId !== messageId) return;
    set({ streaming: null });
  },
}));
