import {
  getAutoRoutingProfiles,
  getModelMetadataById,
  getModelsForTierAndSurface,
  isAutoModeModelId,
} from '@agiworkforce/types';

const SCHEDULE_RUNTIME_PROFILE = 'web/cloud-chat';
const SCHEDULE_MODEL_TYPES = ['chat', 'code', 'reasoning', 'multimodal'] as const;

export interface ScheduleModelOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function getScheduleModelOptions(
  subscriptionTier: string,
  currentModel?: string | null,
): ScheduleModelOption[] {
  const options: ScheduleModelOption[] = [
    ...getAutoRoutingProfiles().map((profile) => ({
      value: profile.id,
      label: profile.label,
    })),
    ...getModelsForTierAndSurface(subscriptionTier, SCHEDULE_RUNTIME_PROFILE, {
      modelTypes: [...SCHEDULE_MODEL_TYPES],
    }).map((model) => ({ value: model.id, label: model.name })),
  ];
  const selection = currentModel?.trim();
  if (!selection || options.some((option) => option.value === selection)) return options;
  const metadata = getModelMetadataById(selection);
  if (!metadata) return options;
  return [
    ...options,
    {
      value: metadata.id,
      label: `${metadata.name} (unavailable on current plan)`,
      disabled: true,
    },
  ];
}

export function normalizeEligibleScheduleModel(
  model: string | null | undefined,
  subscriptionTier: string,
): string | null {
  const selection = model?.trim() || 'auto';
  if (isAutoModeModelId(selection)) return selection;
  const metadata = getModelMetadataById(selection);
  if (!metadata) return null;
  return getModelsForTierAndSurface(subscriptionTier, SCHEDULE_RUNTIME_PROFILE, {
    modelTypes: [...SCHEDULE_MODEL_TYPES],
  }).some((candidate) => candidate.id === metadata.id)
    ? metadata.id
    : null;
}
