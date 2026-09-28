import { modelRegistry } from '@agiworkforce/model-registry';
import {
  getAutoRoutingProfileTiers,
  getModelMetadataById,
  type AutoModeModelId,
  type ModelSpeed,
  type RoutingProfileChoice,
} from '@agiworkforce/types';

const PROFILE_BAND: Readonly<Record<Exclude<RoutingProfileChoice, 'auto'>, string>> = {
  speed: 'economy',
  quality: 'premium',
  cost: 'economy',
};

const SPEED_ORDER: readonly ModelSpeed[] = ['very-fast', 'fast'];

export function autoAliasForRoutingProfile(
  choice: RoutingProfileChoice | undefined,
): AutoModeModelId | null {
  if (!choice || choice === 'auto') return null;
  return (
    getAutoRoutingProfileTiers().find((tier) => tier.profile === PROFILE_BAND[choice])?.id ?? null
  );
}

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
