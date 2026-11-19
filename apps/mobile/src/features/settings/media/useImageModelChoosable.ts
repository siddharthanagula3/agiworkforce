import { useTierStore } from '@/src/features/billing/store';
import { imageCreationOnPlan } from '@/src/features/image/imageCreationAvailability';
import { useChatViewStore } from '@/stores/chat/chatViewStore';

export function useImageModelChoosable(): boolean {
  const tier = useTierStore((s) => s.tier);
  const grantedCapabilities = useTierStore((s) => s.grantedCapabilities);
  const imageGenEnabled = useChatViewStore((s) => s.features.imageGen);
  return imageGenEnabled && imageCreationOnPlan(tier, grantedCapabilities);
}
