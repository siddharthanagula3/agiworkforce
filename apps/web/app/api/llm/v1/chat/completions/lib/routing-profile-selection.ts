import { modelRegistry } from '@agiworkforce/model-registry';
import { getModelMetadataById, type ModelSpeed } from '@agiworkforce/types';

const SPEED_ORDER: readonly ModelSpeed[] = ['very-fast', 'fast'];

export function speedFirstSlots(): string[] {
  const slots = modelRegistry.policies.auto.slots as Readonly<
    Record<string, { modelKey?: string | null }>
  >;
  return Object.entries(slots)
    .flatMap(([slot, definition]) => {
      const speed = definition.modelKey
        ? getModelMetadataById(definition.modelKey)?.speed
        : undefined;
      const rank = speed ? SPEED_ORDER.indexOf(speed) : -1;
      return rank >= 0 ? [{ slot, rank }] : [];
    })
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.slot);
}
