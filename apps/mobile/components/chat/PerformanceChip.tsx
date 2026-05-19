// AUDIT-FIX: pre-existing reorg stub — original implementation removed during
// the mobile reorg and never reinstated. Renders nothing so the typecheck passes
// and import-bearing screens keep loading; a real implementation is tracked as
// a follow-up to the mobile-restructure work.

import type { ReactElement } from 'react';

export type RuntimeTier = 'local' | 'cloud' | 'byok' | 'Tier 1' | 'Tier 2' | 'Tier 3';

export interface PerformanceChipProps {
  model?: string;
  tier?: string | undefined;
  ttftMs?: number;
  totalMs?: number;
  tokensPerSecond?: number | undefined;
  firstTokenLatencyMs?: number | undefined;
  modelId?: string;
}

export function PerformanceChip(_props: PerformanceChipProps): ReactElement | null {
  return null;
}

export default PerformanceChip;
