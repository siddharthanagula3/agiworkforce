import { getModelMetadataById } from '@agiworkforce/types';

export interface AgiTaskModelSummary {
  id: string;
  name: string;
  supportsTools: boolean;
}

export interface AgiTaskModelEligibility {
  eligible: boolean;
  reason?: string;
}

export function getAgiTaskModelEligibility(
  model: AgiTaskModelSummary | null | undefined,
): AgiTaskModelEligibility {
  if (!model) {
    return {
      eligible: false,
      reason:
        'Choose a model verified for agentic planning and tool execution. Project chat still works.',
    };
  }

  const capabilities = getModelMetadataById(model.id)?.capabilities;
  if (capabilities?.agentic === true && capabilities.tools === true) {
    return { eligible: true };
  }

  return {
    eligible: false,
    reason: model.supportsTools
      ? `${model.name} supports function tools, but it is not verified for Tasks. Tasks require verified agentic planning and tool execution. Project chat still works.`
      : `${model.name} is not verified for agentic planning and tool execution. Project chat still works.`,
  };
}
