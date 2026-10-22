'use client';

import { useEffect, useState } from 'react';
import {
  FAST_MODE_BLOCK_MESSAGES,
  fastModeNeedsUsageCreditsCheck,
  resolveFastModeAvailability,
} from '@agiworkforce/types';
import { useFastModeAllowanceStore } from '@shared/stores/fast-mode-allowance-store';

const BILLING_OVERAGE_PATH = '/api/billing/overage';

export interface FastModeAvailability {
  allowed: boolean;
  reason: string | null;
}

export function useFastModeAvailability(
  offersFast: boolean,
  paidPlan: boolean | null,
  workspaceBlocks: boolean,
): FastModeAvailability {
  const [creditsOn, setCreditsOn] = useState<boolean | null>(null);
  const setFastAllowed = useFastModeAllowanceStore((state) => state.setAllowed);
  const checkCredits = fastModeNeedsUsageCreditsCheck({ offersFast, paidPlan, workspaceBlocks });

  useEffect(() => {
    if (!checkCredits) return;
    let cancelled = false;
    fetch(BILLING_OVERAGE_PATH, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as { enabled?: unknown };
        if (!cancelled) setCreditsOn(body.enabled === true);
      })
      .catch(() => {
        if (!cancelled) setCreditsOn(null);
      });
    return () => {
      cancelled = true;
    };
  }, [checkCredits]);

  const { allowed, block } = resolveFastModeAvailability({
    offersFast,
    paidPlan,
    workspaceBlocks,
    usageCreditsOn: creditsOn,
  });

  useEffect(() => {
    setFastAllowed(allowed);
  }, [allowed, setFastAllowed]);

  return { allowed, reason: block ? FAST_MODE_BLOCK_MESSAGES[block] : null };
}
