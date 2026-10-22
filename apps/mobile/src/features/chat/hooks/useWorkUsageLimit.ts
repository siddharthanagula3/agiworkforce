import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getNextUpgradeTier,
  isFreeBillingPlanTier,
  isSelfServePaidPlanTier,
  WORK_USAGE_COPY,
  type ManagedUsageWarning,
  type WorkUsageRecovery,
} from '@agiworkforce/types';
import { useAuthStore } from '@/src/features/auth/store';
import { useCloudUsageStore } from '@/src/features/settings/cloud-usage/store';
import { usageWarningFromSnapshot } from '@/src/features/chat/components/UsageLimitBanner';
import type { UsageSnapshot } from '@/services/usage';

export const USAGE_RECOVERY_ROUTE = '/(app)/settings/cloud-billing';

export function usageRecoveryForPlan(planTier: string | null | undefined): WorkUsageRecovery {
  if (isFreeBillingPlanTier(planTier)) return 'upgrade';
  if (isSelfServePaidPlanTier(planTier)) return 'add_credits';
  return getNextUpgradeTier(planTier) ? 'upgrade' : 'wait';
}

export function usageRecoveryActionLabel(recovery: WorkUsageRecovery): string | null {
  if (recovery === 'add_credits') return WORK_USAGE_COPY.addCredits;
  if (recovery === 'upgrade') return WORK_USAGE_COPY.upgrade;
  return null;
}

/**
 * True only when the server reports no usage left and no purchased, bonus or
 * overage credits could still carry a turn. Anything unknown counts as usable:
 * the server limit stays authoritative and this never blocks a send it would take.
 */
export function isUsageExhausted(snapshot: UsageSnapshot): boolean {
  if (snapshot.hasUsageRemaining) return false;
  const credits = snapshot.credits;
  if (!credits) return false;
  const purchased = credits.purchased;
  if (purchased.overage_enabled) return false;
  if (purchased.remaining === null || purchased.remaining > 0) return false;
  return (credits.bonus?.remaining ?? 0) <= 0;
}

export interface WorkUsageLimit {
  snapshot: UsageSnapshot | null;
  warning: ManagedUsageWarning | null;
  exhaustedRecovery: WorkUsageRecovery | null;
  actionLabel: string | null;
  openRecovery: () => void;
  dismissWarning: () => void;
}

export function useWorkUsageLimit({
  metered,
  isStreaming = false,
  refreshKey,
}: {
  metered: boolean;
  isStreaming?: boolean;
  refreshKey?: unknown;
}): WorkUsageLimit {
  const router = useRouter();
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const ownSnapshot = useCloudUsageStore((s) =>
    s.ownerId !== null && s.ownerId === clerkUserId ? s.snapshot : null,
  );
  const refresh = useCloudUsageStore((s) => s.refresh);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  useEffect(() => {
    if (metered && !isStreaming) void refresh();
  }, [metered, isStreaming, refreshKey, clerkUserId, refresh]);

  useFocusEffect(
    useCallback(() => {
      if (metered) void refresh();
    }, [metered, refresh]),
  );

  const snapshot = metered ? ownSnapshot : null;
  const liveWarning = useMemo(
    () => (snapshot ? usageWarningFromSnapshot(snapshot) : null),
    [snapshot],
  );
  const warningKey = liveWarning ? `${liveWarning.bucket}:${liveWarning.severity}` : null;
  const recovery = snapshot ? usageRecoveryForPlan(snapshot.planTier) : null;
  const exhaustedRecovery = snapshot && recovery && isUsageExhausted(snapshot) ? recovery : null;

  const openRecovery = useCallback(() => {
    router.push(USAGE_RECOVERY_ROUTE as Parameters<typeof router.push>[0]);
  }, [router]);

  const dismissWarning = useCallback(() => {
    setDismissedKey(warningKey);
  }, [warningKey]);

  return {
    snapshot,
    warning: warningKey !== null && warningKey !== dismissedKey ? liveWarning : null,
    exhaustedRecovery,
    actionLabel: recovery ? usageRecoveryActionLabel(recovery) : null,
    openRecovery,
    dismissWarning,
  };
}
