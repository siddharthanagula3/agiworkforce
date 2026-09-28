'use client';

import { useEffect, useRef } from 'react';
import {
  isModelOnPlan,
  useDefaultModelPreference,
  useKnownPlanTier,
} from '@features/chat/lib/default-model-preference';
import { findSelectableModel, useModelStore } from '@shared/stores/model-store';

export function useNewChatDefaultModel(conversationId: string | null): void {
  const { modelId } = useDefaultModelPreference();
  const tier = useKnownPlanTier();
  const setSelectedModelId = useModelStore((state) => state.setSelectedModelId);
  const entrySelection = useRef<string | null>(null);
  const appliedDefault = useRef<string | null>(null);

  useEffect(() => {
    if (conversationId !== null) {
      entrySelection.current = null;
      appliedDefault.current = null;
      return;
    }
    const current = useModelStore.getState().selectedModelId;
    entrySelection.current ??= current;
    if (!modelId || tier === null || appliedDefault.current === modelId) return;
    const model = findSelectableModel(modelId);
    if (!model || !isModelOnPlan(model, tier)) return;
    const firstApply = appliedDefault.current === null;
    appliedDefault.current = modelId;
    if (firstApply && current !== entrySelection.current) return;
    setSelectedModelId(model.id);
  }, [conversationId, modelId, setSelectedModelId, tier]);
}
