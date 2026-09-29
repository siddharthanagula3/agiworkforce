'use client';

import { useEffect, useState } from 'react';
import { useFastModeAllowanceStore } from '@shared/stores/fast-mode-allowance-store';

const BILLING_OVERAGE_PATH = '/api/billing/overage';

export interface FastModeAvailability {
  allowed: boolean;
  reason: string | null;
}

/**
 * Whether the selected model's fast tier can be used, following Claude: a paid
 * plan, a workspace whose administrator turned it on, and usage credits turned
 * on, since fast mode is billed to them. The server enforces the same rules.
 */
export function useFastModeAvailability(
  offersFast: boolean,
  paidPlan: boolean | null,
  workspaceBlocks: boolean,
): FastModeAvailability {
  const [creditsOn, setCreditsOn] = useState<boolean | null>(null);
  const setFastAllowed = useFastModeAllowanceStore((state) => state.setAllowed);
  const checkCredits = offersFast && paidPlan === true && !workspaceBlocks;

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

  const reason = !offersFast
    ? null
    : paidPlan === false
      ? 'Fast mode is available on paid plans and is billed to usage credits.'
      : workspaceBlocks
        ? 'Fast mode has been disabled by your organization.'
        : creditsOn === false
          ? 'Fast mode is billed to usage credits. Turn them on in Settings > Billing.'
          : null;
  const allowed = offersFast && paidPlan === true && !workspaceBlocks && creditsOn !== false;

  useEffect(() => {
    setFastAllowed(allowed);
  }, [allowed, setFastAllowed]);

  return { allowed, reason };
}
