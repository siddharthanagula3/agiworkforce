'use client';

import { create } from 'zustand';
import type { ArtifactData } from '../components/artifacts/ArtifactPreview';

export interface StreamingArtifact {
  artifactId: string;
  messageId: string;
  conversationId?: string;
  type: ArtifactData['type'];
  language: string;
  title: string;
  content: string;
}

interface StreamingArtifactStore {
  streaming: StreamingArtifact | null;
  setStreamingArtifact: (artifact: StreamingArtifact) => void;
  clearStreamingArtifact: (messageId?: string) => void;
}

export const useStreamingArtifactStore = create<StreamingArtifactStore>((set, get) => ({
  streaming: null,

  setStreamingArtifact: (artifact) => {
    const current = get().streaming;
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
