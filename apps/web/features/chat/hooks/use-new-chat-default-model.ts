'use client';

import { useEffect, useRef } from 'react';
import { isFreeBillingPlanTier } from '@agiworkforce/types';
import {
  isModelOnPlan,
  useDefaultModelPreference,
  useKnownPlanTier,
} from '@features/chat/lib/default-model-preference';
import { useFreeModelPromotion } from '@features/chat/hooks/use-free-model-promotion';
import { findSelectableModel, useModelStore } from '@shared/stores/model-store';

export function useNewChatDefaultModel(conversationId: string | null): void {
  const { modelId } = useDefaultModelPreference();
  const tier = useKnownPlanTier();
  const { promotion } = useFreeModelPromotion(tier !== null && isFreeBillingPlanTier(tier));
  const setSelectedModelId = useModelStore((state) => state.setSelectedModelId);
  const entrySelection = useRef<string | null>(null);
  const appliedDefault = useRef<string | null>(null);
  const appliedPromotion = useRef<string | null>(null);

  useEffect(() => {
    if (conversationId !== null) {
      entrySelection.current = null;
      appliedDefault.current = null;
      return;
    }
    if (promotion) return;
    const current = useModelStore.getState().selectedModelId;
    entrySelection.current ??= current;
    if (!modelId || tier === null || appliedDefault.current === modelId) return;
    const model = findSelectableModel(modelId);
    if (!model || !isModelOnPlan(model, tier)) return;
    const firstApply = appliedDefault.current === null;
    appliedDefault.current = modelId;
    if (firstApply && current !== entrySelection.current) return;
    setSelectedModelId(model.id);
  }, [conversationId, modelId, promotion, setSelectedModelId, tier]);

  useEffect(() => {
    if (conversationId !== null) {
      appliedPromotion.current = null;
      return;
    }
    if (!promotion || appliedPromotion.current === promotion.modelId) return;
    appliedPromotion.current = promotion.modelId;
    setSelectedModelId(promotion.modelId);
  }, [conversationId, promotion, setSelectedModelId]);
}
