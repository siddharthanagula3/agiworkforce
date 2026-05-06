import { useMemo } from 'react';
import { useModelStore, selectLastRoutingDecision } from '../stores/modelStore';
import { modelsById } from '@agiworkforce/types';
import { TASK_LABEL } from '../lib/promptClassifier';

export function useModel() {
  const models = useModelStore((s) => s.models);
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const thinkingEnabled = useModelStore((s) => s.thinkingEnabled);
  const recentModelIds = useModelStore((s) => s.recentModelIds);
  const selectModel = useModelStore((s) => s.selectModel);
  const toggleThinking = useModelStore((s) => s.toggleThinking);
  const getSelectedModel = useModelStore((s) => s.getSelectedModel);
  const getModelsByTier = useModelStore((s) => s.getModelsByTier);
  const lastRoutingDecision = useModelStore(selectLastRoutingDecision);

  const selectedModel = getSelectedModel();
  const modelsByTier = getModelsByTier();

  const isAutoMode = selectedModelId.startsWith('auto');

  // When auto-routed: show "ModelName · task" instead of "Auto Economy"
  const displayName = useMemo(() => {
    if (isAutoMode && lastRoutingDecision?.wasRouted) {
      const routedMeta = modelsById[lastRoutingDecision.routedModelId];
      const taskLabel = TASK_LABEL[lastRoutingDecision.taskType as keyof typeof TASK_LABEL];
      if (routedMeta) {
        return taskLabel ? `${routedMeta.name} · ${taskLabel}` : routedMeta.name;
      }
    }
    if (!selectedModel) return 'Select model';
    return `${selectedModel.name}${thinkingEnabled && selectedModel.supportsThinking ? ' Extended' : ''}`;
  }, [isAutoMode, lastRoutingDecision, selectedModel, thinkingEnabled]);

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
      lastRoutingDecision,
      isAutoMode,
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
      lastRoutingDecision,
      isAutoMode,
    ],
  );
}
