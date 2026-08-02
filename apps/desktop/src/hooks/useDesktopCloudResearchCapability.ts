import { useChatModelStore } from '@agiworkforce/unified-chat';

import type { PlanTier } from '../lib/cloudAccountTypes';
import { canUseDesktopCloudResearch } from '../services/desktopCloudEntitlements';

/**
 * Projects Deep Research from the exact model store owned by ChatInput,
 * ModelSelector, and the send path. The legacy settings model store is not a
 * chat-selection authority.
 */
export function useDesktopCloudResearchCapability(
  plan: PlanTier | null | undefined,
  isManagedCloud: boolean,
): boolean {
  const selectedModelId = useChatModelStore((state) => state.selectedModelId);
  return isManagedCloud && canUseDesktopCloudResearch(plan, selectedModelId);
}
