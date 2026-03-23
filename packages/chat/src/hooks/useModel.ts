import { useMemo } from 'react';
import { useModelStore } from '../stores/modelStore';

export function useModel() {
  const models = useModelStore((s) => s.models);
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const thinkingEnabled = useModelStore((s) => s.thinkingEnabled);
  const recentModelIds = useModelStore((s) => s.recentModelIds);
  const selectModel = useModelStore((s) => s.selectModel);
  const toggleThinking = useModelStore((s) => s.toggleThinking);
  const getSelectedModel = useModelStore((s) => s.getSelectedModel);
  const getModelsByTier = useModelStore((s) => s.getModelsByTier);

  const selectedModel = getSelectedModel();
  const modelsByTier = getModelsByTier();

  const displayName = selectedModel
    ? `${selectedModel.name}${thinkingEnabled && selectedModel.supportsThinking ? ' Extended' : ''}`
    : 'Select model';

  return useMemo(
    () => ({
      models,
      selectedModel,
      selectedModelId,
      thinkingEnabled,
      recentModelIds,
      modelsByTier,
      displayName,
      selectModel,
      toggleThinking,
    }),
    [
      models,
      selectedModel,
      selectedModelId,
      thinkingEnabled,
      recentModelIds,
      modelsByTier,
      displayName,
      selectModel,
      toggleThinking,
    ],
  );
}
