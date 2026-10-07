import { getModelReasoning } from '@agiworkforce/types';

const NO_REASONING_EFFORT = 'none';

/**
 * A model the catalog flags as rejecting sampling parameters takes them only
 * while reasoning is off. With no effort on the request the provider applies
 * the model's own default, which is never `none`, so they are left out then too.
 */
export function acceptsSamplingParameters(
  modelId: string,
  effortOnRequest: string | undefined,
): boolean {
  if (getModelReasoning(modelId).rejectsSamplingParameters !== true) return true;
  return effortOnRequest === NO_REASONING_EFFORT;
}
