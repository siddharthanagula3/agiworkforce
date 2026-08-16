'use client';

import { create } from 'zustand';
import type { MessageMetadata } from '@shared/stores/web-chat-store';
import type {
  ImageAspectRatio,
  ResolvedImageGenerationRequestOptions,
} from '../lib/imageGenerationOptions';

export type ImageTranscriptRecoveryStatus = 'failed' | 'retrying';

export type ImagePromptTranscriptRecovery = {
  phase: 'prompt';
  status: ImageTranscriptRecoveryStatus;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  prompt: string;
  requestedAspect: ImageAspectRatio;
  imageRequest: ResolvedImageGenerationRequestOptions;
  requestedModel?: string;
};

export type ImageResultTranscriptRecovery = {
  phase: 'result';
  status: ImageTranscriptRecoveryStatus;
  kind?: 'asset' | 'generation-failure';
  conversationId: string;
  assistantMessageId: string;
  model?: string;
  metadata: MessageMetadata;
  content?: string;
};

export type ImageTranscriptRecovery = ImagePromptTranscriptRecovery | ImageResultTranscriptRecovery;

export function imageTranscriptMutationKeys(recovery: ImageTranscriptRecovery): string[] {
  return recovery.phase === 'prompt'
    ? [recovery.userMessageId, recovery.assistantMessageId]
    : [recovery.assistantMessageId];
}

interface ImageTranscriptRecoveryState {
  recoveries: Record<string, ImageTranscriptRecovery>;
  mutationsInFlight: Record<string, true>;
  setRecovery: (recovery: ImageTranscriptRecovery) => void;
  removeRecovery: (assistantMessageId: string) => void;
  removeRecoveriesForMessages: (messageIds: string[]) => void;
  tryAcquireMutation: (messageIds: string[]) => boolean;
  releaseMutation: (messageIds: string[]) => void;
  isMutationInFlight: (messageId: string) => boolean;
  reset: () => void;
}

const uniqueIds = (messageIds: string[]): string[] => [...new Set(messageIds)];

export const useImageTranscriptRecoveryStore = create<ImageTranscriptRecoveryState>()(
  (set, get) => ({
    recoveries: {},
    mutationsInFlight: {},

    setRecovery: (recovery) =>
      set((state) => ({
        recoveries: {
          ...state.recoveries,
          [recovery.assistantMessageId]: recovery,
        },
      })),

    removeRecovery: (assistantMessageId) =>
      set((state) => {
        if (!(assistantMessageId in state.recoveries)) return state;
        const recoveries = { ...state.recoveries };
        delete recoveries[assistantMessageId];
        return { recoveries };
      }),

    removeRecoveriesForMessages: (messageIds) => {
      const removedIds = new Set(messageIds);
      if (removedIds.size === 0) return;
      set((state) => {
        const recoveries = Object.fromEntries(
          Object.entries(state.recoveries).filter(([, recovery]) => {
            if (removedIds.has(recovery.assistantMessageId)) return false;
            return recovery.phase !== 'prompt' || !removedIds.has(recovery.userMessageId);
          }),
        );
        return Object.keys(recoveries).length === Object.keys(state.recoveries).length
          ? state
          : { recoveries };
      });
    },

    tryAcquireMutation: (messageIds) => {
      const ids = uniqueIds(messageIds);
      if (ids.length === 0) return true;
      let acquired = false;
      set((state) => {
        if (ids.some((messageId) => state.mutationsInFlight[messageId])) return state;
        acquired = true;
        const mutationsInFlight = { ...state.mutationsInFlight };
        ids.forEach((messageId) => {
          mutationsInFlight[messageId] = true;
        });
        return { mutationsInFlight };
      });
      return acquired;
    },

    releaseMutation: (messageIds) => {
      const ids = uniqueIds(messageIds);
      if (ids.length === 0) return;
      set((state) => {
        if (!ids.some((messageId) => state.mutationsInFlight[messageId])) return state;
        const mutationsInFlight = { ...state.mutationsInFlight };
        ids.forEach((messageId) => {
          delete mutationsInFlight[messageId];
        });
        return { mutationsInFlight };
      });
    },

    isMutationInFlight: (messageId) => Boolean(get().mutationsInFlight[messageId]),

    reset: () => set({ recoveries: {}, mutationsInFlight: {} }),
  }),
);
