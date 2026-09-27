import { getSlotForModel, type RoutingSlot } from './model-catalog';

const FLAGSHIP_ROUTING_SLOTS: ReadonlySet<RoutingSlot> = new Set<RoutingSlot>([
  'flagship_coding_pro_plus',
  'flagship_general_pro_plus',
]);

export function isFlagshipRoutingSlot(slot: RoutingSlot | null | undefined): boolean {
  return slot !== null && slot !== undefined && FLAGSHIP_ROUTING_SLOTS.has(slot);
}

export function isFlagshipModel(modelId: string | null | undefined): boolean {
  return isFlagshipRoutingSlot(getSlotForModel(modelId));
}
