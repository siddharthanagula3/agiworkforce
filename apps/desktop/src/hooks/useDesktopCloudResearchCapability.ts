import { useChatModelStore } from '@agiworkforce/unified-chat';

import type { PlanTier } from '../lib/cloudAccountTypes';
import { canUseDesktopCloudResearch } from '../services/desktopCloudEntitlements';

export function useDesktopCloudResearchCapability(
  plan: PlanTier | null | undefined,
  isManagedCloud: boolean,
): boolean {
  const selectedModelId = useChatModelStore((state) => state.selectedModelId);
  return isManagedCloud && canUseDesktopCloudResearch(plan, selectedModelId);
}
