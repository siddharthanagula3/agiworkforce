import type * as TypesModule from '@agiworkforce/types';

export function withVideoGenerationSlot(
  actual: typeof TypesModule,
  pinnedModelId: () => string | undefined,
): typeof TypesModule {
  return {
    ...actual,
    getRoutingSlotModel: (slot) =>
      (slot === 'video_generation' ? pinnedModelId() : undefined) ??
      actual.getRoutingSlotModel(slot),
  };
}
