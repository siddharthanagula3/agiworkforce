import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  earliestExhaustedUsageResetAt,
  resolveExhaustedUsageRecovery,
  resolvePlanUsageRecovery,
  workUsageRecoveryActionLabel,
  type ManagedUsageWarning,
  type WorkUsageRecovery,
} from '@agiworkforce/types';
import { useAuthStore } from '@/src/features/auth/store';
import { useCloudUsageStore } from '@/src/features/settings/cloud-usage/store';
import {
  usageReadingsFromSnapshot,
  usageWarningFromSnapshot,
} from '@/src/features/chat/components/UsageLimitBanner';
import type { UsageSnapshot } from '@/services/usage';

export const USAGE_RECOVERY_ROUTE = '/(app)/settings/cloud-billing';
const RESET_RECHECK_MAX_MS = 60_000;

export function exhaustedUsageRecoveryFromSnapshot(
  snapshot: UsageSnapshot,
  now: number = Date.now(),
): WorkUsageRecovery | null {
  return resolveExhaustedUsageRecovery(
    {
      planTier: snapshot.planTier,
      hasUsageRemaining: snapshot.hasUsageRemaining,
      usageAllocation: snapshot.usageAllocation ?? null,
      credits: snapshot.credits,
      readings: usageReadingsFromSnapshot(snapshot),
    },
    now,
  );
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
  const usageError = useCloudUsageStore((s) => s.error);
  const refresh = useCloudUsageStore((s) => s.refresh);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (metered && !isStreaming) void refresh();
  }, [metered, isStreaming, refreshKey, clerkUserId, refresh]);

  useFocusEffect(
    useCallback(() => {
      if (metered) void refresh();
    }, [metered, refresh]),
  );

  useEffect(() => {
    if (!metered) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(Date.now());
        void refresh();
      }
    });
    return () => subscription.remove();
  }, [metered, refresh]);

  const snapshot = metered ? ownSnapshot : null;
  const pending = snapshot?.usageAllocation === 'pending';
  const liveWarning = useMemo(
    () => (snapshot && !pending ? usageWarningFromSnapshot(snapshot) : null),
    [pending, snapshot],
  );
  const exhaustedRecovery =
    snapshot && usageError === null ? exhaustedUsageRecoveryFromSnapshot(snapshot, now) : null;
  const nextResetAt =
    snapshot && exhaustedRecovery
      ? earliestExhaustedUsageResetAt(usageReadingsFromSnapshot(snapshot))
      : null;

  useEffect(() => {
    if (nextResetAt === null) return;
    const timer = setTimeout(
      () => {
        setNow(Date.now());
        if (Date.now() >= nextResetAt) void refresh();
      },
      Math.max(1_000, Math.min(nextResetAt - Date.now() + 1_000, RESET_RECHECK_MAX_MS)),
    );
    return () => clearTimeout(timer);
  }, [nextResetAt, now, refresh]);

  const warningKey = liveWarning ? `${liveWarning.bucket}:${liveWarning.severity}` : null;
  const recovery =
    exhaustedRecovery ?? (snapshot ? resolvePlanUsageRecovery(snapshot.planTier) : null);

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
    actionLabel: recovery ? workUsageRecoveryActionLabel(recovery) : null,
    openRecovery,
    dismissWarning,
  };
}
