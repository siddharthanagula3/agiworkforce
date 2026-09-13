'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getDefaultAutoRoutingProfile } from '@agiworkforce/types';
import { useChatModelStore } from '@agiworkforce/unified-chat';
import { useModelStore } from '@shared/stores/model-store';
import { useModelCatalogue } from '@features/chat/lib/use-model-catalogue';
import { useModelFavourites } from '@features/chat/lib/use-model-favourites';
import { ModelCatalogueBrowser } from './ModelCatalogueBrowser';

export function ModelsPage() {
  const router = useRouter();
  const catalogue = useModelCatalogue(true);
  const { favouriteModelIds, toggleFavourite } = useModelFavourites();
  const setSelectedModelId = useModelStore((state) => state.setSelectedModelId);
  const recentModelIds = useChatModelStore((state) => state.recentModelIds);
  const recordRecentModel = useChatModelStore((state) => state.selectModel);

  const handleTry = useCallback(
    (modelId: string) => {
      recordRecentModel(modelId);
      setSelectedModelId(modelId);
      router.push('/chat');
    },
    [recordRecentModel, router, setSelectedModelId],
  );

  return (
    <ModelCatalogueBrowser
      entries={catalogue.entries}
      developers={catalogue.developers}
      planLabel={catalogue.planLabel}
      status={catalogue.status}
      autoProfile={getDefaultAutoRoutingProfile()}
      favouriteModelIds={favouriteModelIds}
      recentModelIds={recentModelIds}
      onRetry={catalogue.retry}
      onToggleFavourite={toggleFavourite}
      onTry={handleTry}
    />
  );
}
