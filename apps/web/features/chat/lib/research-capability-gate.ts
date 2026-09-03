import type { ModelCapabilities } from '@agiworkforce/types';

export const RESEARCH_MIN_CONTEXT_WINDOW = 500_000;

export function modelSupportsResearch(
  caps: Partial<ModelCapabilities> | undefined,
  contextWindow: number | undefined,
): boolean {
  return (
    (caps?.research ?? false) ||
    ((caps?.tools ?? false) && (contextWindow ?? 0) >= RESEARCH_MIN_CONTEXT_WINDOW)
  );
}
