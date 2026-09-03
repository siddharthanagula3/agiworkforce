import { getModelMetadataById } from '@agiworkforce/types';
import type { Tier } from './tierResolver';
import { tierAtLeast } from './tierResolver';

export function extractProvider(modelId: string): string {
  if (!modelId || modelId.trim() === '') return 'unknown';

  const id = modelId.trim();
  const normalizedId = id.toLowerCase();

  if (normalizedId.startsWith('auto-') || normalizedId === 'auto') return 'auto';

  return String(getModelMetadataById(normalizedId)?.provider ?? 'unknown');
}

export type SwitchGuardResult = 'allow' | 'upgrade-required';

export function guardProviderSwitch(
  currentModelId: string,
  nextModelId: string,
  tier: Tier,
): SwitchGuardResult {
  const currentProvider = extractProvider(currentModelId);
  const nextProvider = extractProvider(nextModelId);

  if (currentProvider === 'auto' || nextProvider === 'auto') return 'allow';

  if (currentProvider === nextProvider) return 'allow';

  if (currentProvider === 'unknown' || nextProvider === 'unknown') return 'allow';

  return tierAtLeast(tier, 'max') ? 'allow' : 'upgrade-required';
}
