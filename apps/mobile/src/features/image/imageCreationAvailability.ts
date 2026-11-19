import { useEffect, useRef } from 'react';
import { canUseBillingPlanCapability, type BillingPlanTier } from '@agiworkforce/types';
import {
  freeMediaAvailability,
  limitedFreeMedia,
  type FreeQuotaCatalogue,
} from '@agiworkforce/cloud-contracts';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { useAuthStore } from '@/src/features/auth/store';
import { captureCloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';
import { useTierStore } from '@/src/features/billing/store';
import { canCreateImages } from '@/src/features/chat/actions/mediaMode';
import { useFreeQuotaCatalogueStore } from '@/src/features/model-picker/freeQuotaCatalogue';

export type ImageCreationAvailability = 'available' | 'checking' | 'unavailable';

export function imageCreationOnPlan(
  tier: BillingPlanTier,
  grantedCapabilities: readonly string[],
): boolean {
  return (
    grantedCapabilities.includes('canUseImages') &&
    canUseBillingPlanCapability(tier, 'image_generation')
  );
}

export function freeImagesLeftToday(catalogue: FreeQuotaCatalogue | null): boolean {
  if (freeMediaAvailability(catalogue, 'image') !== 'offered') return false;
  const offer = limitedFreeMedia(catalogue, 'image');
  return offer !== null && offer.remainingToday > 0;
}

export function useImageCreationAvailability(cloudReady: boolean): ImageCreationAvailability {
  const tier = useTierStore((s) => s.tier);
  const grantedCapabilities = useTierStore((s) => s.grantedCapabilities);
  const imageGenEnabled = useChatViewStore((s) => s.features.imageGen);
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const catalogueAccount = useFreeQuotaCatalogueStore((s) => s.account);
  const catalogue = useFreeQuotaCatalogueStore((s) => s.catalogue);
  const catalogueLoading = useFreeQuotaCatalogueStore((s) => s.loading);
  const requestedFor = useRef<string | null>(null);

  const account = cloudReady ? captureCloudAccountEpoch() : null;
  const accountKey =
    account && account.ownerId === clerkUserId ? `${account.ownerId}:${account.epoch}` : null;
  const creatable = accountKey !== null && imageGenEnabled && canCreateImages();
  const onPlan = imageCreationOnPlan(tier, grantedCapabilities);
  const catalogueCurrent =
    accountKey !== null &&
    catalogueAccount !== null &&
    `${catalogueAccount.ownerId}:${catalogueAccount.epoch}` === accountKey;
  const needsCatalogue = creatable && !onPlan && !catalogueCurrent && !catalogueLoading;

  useEffect(() => {
    if (catalogueCurrent) {
      requestedFor.current = null;
      return;
    }
    if (!needsCatalogue || requestedFor.current === accountKey) return;
    requestedFor.current = accountKey;
    void useFreeQuotaCatalogueStore.getState().refresh();
  }, [accountKey, catalogueCurrent, needsCatalogue]);

  if (!creatable) return 'unavailable';
  if (onPlan) return 'available';
  if (catalogueCurrent) return freeImagesLeftToday(catalogue) ? 'available' : 'unavailable';
  return catalogueLoading || requestedFor.current !== accountKey ? 'checking' : 'unavailable';
}
