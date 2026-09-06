import { getRoutingSlotModel, isModelLive, modelsCatalog } from '@agiworkforce/types';
import {
  clearInvalidMediaModelSelections,
  enterMediaMode,
  exitMediaMode,
  listMediaModels,
  mediaModelIdForMode,
  resolveMediaModelId,
} from '@/src/features/chat/actions/mediaMode';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { useModelStore } from '@/src/features/model-picker/store';

const TEXT_MODEL = 'fixture-chat-model';

describe('media mode', () => {
  beforeEach(() => {
    useChatViewStore.setState({ mediaMode: 'text', selectedMediaModel: {} });
    useModelStore.setState({ selectedModel: TEXT_MODEL });
  });

  describe('listMediaModels', () => {
    it.each(['image', 'video'] as const)(
      'only offers live %s output models, not models with a generic capability flag',
      (kind) => {
        const capability = kind === 'image' ? 'imageGen' : 'videoGen';
        const offeredIds = listMediaModels(kind);
        const offeredModels = offeredIds.map((id) => modelsCatalog.models[id]);

        expect(offeredModels.length).toBeGreaterThan(0);
        for (const model of offeredModels) {
          expect(model).toMatchObject({
            modelType: kind,
            capabilities: { [capability]: true },
          });
          expect(isModelLive(model)).toBe(true);
        }
      },
    );

    it('offers only video models for video, never a chat model that advertises videoGen', () => {
      const genericCapabilityIds = Object.values(modelsCatalog.models)
        .filter((model) => model.capabilities.videoGen === true && model.modelType !== 'video')
        .map((model) => model.id);
      const offered = listMediaModels('video');

      expect(offered.length).toBeGreaterThan(0);
      for (const id of offered) {
        expect(modelsCatalog.models[id]?.modelType).toBe('video');
        expect(genericCapabilityIds).not.toContain(id);
      }
    });

    it('excludes non-live preview video models even when they advertise videoGen', () => {
      const nonLiveVideoModels = Object.values(modelsCatalog.models).filter(
        (model) =>
          model.modelType === 'video' &&
          model.capabilities.videoGen === true &&
          !isModelLive(model),
      );

      expect(nonLiveVideoModels.length).toBeGreaterThan(0);
      expect(listMediaModels('video')).not.toEqual(
        expect.arrayContaining(nonLiveVideoModels.map((model) => model.id)),
      );
    });

    it.each(['deprecated', 'status'] as const)(
      'excludes a media model deprecated through its %s lifecycle field',
      (field) => {
        const candidate = Object.values(modelsCatalog.models).find(
          (model) => model.modelType === 'video' && isModelLive(model),
        );
        expect(candidate).toBeDefined();

        const originalDeprecated = candidate!.deprecated;
        const originalStatus = candidate!.status;
        try {
          if (field === 'deprecated') candidate!.deprecated = true;
          else candidate!.status = 'deprecated';

          expect(listMediaModels('video')).not.toContain(candidate!.id);
        } finally {
          candidate!.deprecated = originalDeprecated;
          candidate!.status = originalStatus;
        }
      },
    );
  });

  describe('resolveMediaModelId', () => {
    it('resolves the image slot from the canonical registry, not a hardcoded id', () => {
      expect(resolveMediaModelId('image')).toBe(getRoutingSlotModel('image_generation'));
    });

    it('resolves the video slot from the canonical registry', () => {
      expect(resolveMediaModelId('video')).toBe(getRoutingSlotModel('video_generation'));
    });

    it('rejects a persisted model that cannot generate video output', () => {
      const nonVideoModel = Object.values(modelsCatalog.models).find(
        (model) => model.modelType !== 'video',
      );
      expect(nonVideoModel).toBeDefined();

      useChatViewStore.getState().setMediaModel('video', nonVideoModel!.id);

      expect(resolveMediaModelId('video')).toBe(getRoutingSlotModel('video_generation'));
      expect(resolveMediaModelId('video')).not.toBe(nonVideoModel!.id);
    });

    it('rejects a persisted non-live preview video model', () => {
      const nonLiveVideoModel = Object.values(modelsCatalog.models).find(
        (model) =>
          model.modelType === 'video' &&
          model.capabilities.videoGen === true &&
          !isModelLive(model),
      );
      expect(nonLiveVideoModel).toBeDefined();

      useChatViewStore.getState().setMediaModel('video', nonLiveVideoModel!.id);

      expect(resolveMediaModelId('video')).toBe(getRoutingSlotModel('video_generation'));
      expect(resolveMediaModelId('video')).not.toBe(nonLiveVideoModel!.id);
    });

    it('clears an invalid persisted choice so a later lifecycle change cannot reactivate it', () => {
      const nonLiveVideoModel = Object.values(modelsCatalog.models).find(
        (model) =>
          model.modelType === 'video' &&
          model.capabilities.videoGen === true &&
          !isModelLive(model),
      );
      expect(nonLiveVideoModel).toBeDefined();
      useChatViewStore.getState().setMediaModel('video', nonLiveVideoModel!.id);

      expect(clearInvalidMediaModelSelections()).toBe(true);
      expect(useChatViewStore.getState().selectedMediaModel.video).toBeUndefined();
      expect(clearInvalidMediaModelSelections()).toBe(false);

      const originalAvailability = nonLiveVideoModel!.availability;
      try {
        nonLiveVideoModel!.availability = 'live';
        expect(resolveMediaModelId('video')).toBe(getRoutingSlotModel('video_generation'));
        expect(resolveMediaModelId('video')).not.toBe(nonLiveVideoModel!.id);
      } finally {
        nonLiveVideoModel!.availability = originalAvailability;
      }
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
