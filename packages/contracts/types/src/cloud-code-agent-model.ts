import {
  canAccessModelForSubscriptionTier,
  getDefaultModelFor,
  getModelFamilyFallbackChain,
  getModelFamilySlotForModel,
  getModelMetadataById,
  getRoutingSlotModel,
  type RoutingSlot,
} from './model-catalog';

const CLOUD_CODE_AGENT_ROUTING_SLOT: RoutingSlot = 'coding_balanced';

function canRunCloudCodeAgent(modelId: string): boolean {
  return getModelMetadataById(modelId)?.capabilities.tools === true;
}

export function resolveCloudCodeAgentModel(
  selectedModelId: string | null | undefined,
  planTier: string,
): string {
  if (selectedModelId && canRunCloudCodeAgent(selectedModelId)) return selectedModelId;
  const codingModel = getRoutingSlotModel(CLOUD_CODE_AGENT_ROUTING_SLOT);
  const codingFamily = getModelFamilySlotForModel(codingModel);
  const planDefault = getDefaultModelFor(planTier, 'chat');
  const candidates = [
    ...(codingFamily ? getModelFamilyFallbackChain(codingFamily) : [codingModel]),
    planDefault,
  ];
  return (
    candidates.find(
      (modelId) =>
        canRunCloudCodeAgent(modelId) && canAccessModelForSubscriptionTier(modelId, planTier),
    ) ?? planDefault
  );
}
