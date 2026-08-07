/**
 * Media mode: entering/leaving image and video modes swaps the SELECTED model
 * and restores the user's own text model on the way out.
 *
 * The regression these guard is the one that made the old boolean toggles
 * misleading: a user must never be left on a media model that cannot answer
 * their next text message, and must never have their text model silently
 * replaced by the other media model.
 */

import { getRoutingSlotModel } from '@agiworkforce/types';
import {
  enterMediaMode,
  exitMediaMode,
  mediaModelIdForMode,
  resolveMediaModelId,
} from '@/src/features/chat/actions/mediaMode';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { useModelStore } from '@/src/features/model-picker/store';

const TEXT_MODEL = 'claude-sonnet-5';

describe('media mode', () => {
  beforeEach(() => {
    useChatViewStore.setState({ mediaMode: 'text' });
    useModelStore.setState({ selectedModel: TEXT_MODEL });
  });

  describe('resolveMediaModelId', () => {
    it('resolves the image slot from the canonical registry, not a hardcoded id', () => {
      expect(resolveMediaModelId('image')).toBe(getRoutingSlotModel('image_generation'));
    });

    it('resolves the video slot from the canonical registry', () => {
      expect(resolveMediaModelId('video')).toBe(getRoutingSlotModel('video_generation'));
    });
  });

  describe('enterMediaMode', () => {
    it('enters image mode and surfaces the image model for display', () => {
      expect(enterMediaMode('image')).toBe(true);

      expect(useChatViewStore.getState().mediaMode).toBe('image');
      expect(mediaModelIdForMode('image')).toBe(resolveMediaModelId('image'));
    });

    it('enters video mode and surfaces the video model for display', () => {
      expect(enterMediaMode('video')).toBe(true);

      expect(useChatViewStore.getState().mediaMode).toBe('video');
      expect(mediaModelIdForMode('video')).toBe(resolveMediaModelId('video'));
    });

    /**
     * The regression that shipped in the first version of this: media models are
     * routing SLOT models, not picker-selectable chat models, so `setModel`
     * silently rejected them. Writing there was both a no-op and the wrong idea
     * — the chat selection must survive a media round trip untouched.
     */
    it('never overwrites the user chat-model selection', () => {
      enterMediaMode('image');
      expect(useModelStore.getState().selectedModel).toBe(TEXT_MODEL);

      enterMediaMode('video');
      expect(useModelStore.getState().selectedModel).toBe(TEXT_MODEL);
    });
  });

  describe('exitMediaMode', () => {
    it('returns to text mode with the chat model intact', () => {
      enterMediaMode('image');
      exitMediaMode();

      expect(useChatViewStore.getState().mediaMode).toBe('text');
      expect(mediaModelIdForMode('text')).toBeNull();
      expect(useModelStore.getState().selectedModel).toBe(TEXT_MODEL);
    });

    it('survives an image -> video -> text round trip', () => {
      enterMediaMode('image');
      enterMediaMode('video');
      exitMediaMode();

      expect(useChatViewStore.getState().mediaMode).toBe('text');
      expect(useModelStore.getState().selectedModel).toBe(TEXT_MODEL);
    });

    it('is a no-op when already in text mode', () => {
      exitMediaMode();

      expect(useChatViewStore.getState().mediaMode).toBe('text');
      expect(useModelStore.getState().selectedModel).toBe(TEXT_MODEL);
    });
  });

  it('does not persist media mode, so a cold start never resumes on a media model', () => {
    enterMediaMode('video');

    // `partialize` is the persistence contract; media mode must be absent from it.
    const persisted = JSON.parse(
      JSON.stringify(
        (
          useChatViewStore.persist.getOptions() as {
            partialize?: (state: unknown) => Record<string, unknown>;
          }
        ).partialize?.(useChatViewStore.getState()) ?? {},
      ),
    );

    expect(persisted).not.toHaveProperty('mediaMode');
  });
});
