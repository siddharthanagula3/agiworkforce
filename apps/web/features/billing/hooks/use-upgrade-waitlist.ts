'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SelfServePaidPlanTier } from '@agiworkforce/types';
import { queryClient, queryKeys } from '@shared/stores/query-client';
import { useAuthStore } from '@shared/stores/authentication-store';
import {
  readUpgradeWaitlistStatus,
  type UpgradeWaitlistStatus,
} from '@features/billing/services/upgrade-waitlist';

const STATUS_FRESH_MS = 60_000;

function statusQuery(userId: string) {
  return {
    queryKey: queryKeys.billing.upgradeWaitlist(userId),
    queryFn: readUpgradeWaitlistStatus,
    staleTime: STATUS_FRESH_MS,
    meta: { silent: true },
  };
}

export async function resolveUpgradeWaitlistStatus(
  userId: string,
): Promise<UpgradeWaitlistStatus | null> {
  const query = statusQuery(userId);
  try {
    return await queryClient.query({ ...query, retry: false });
  } catch {
    return queryClient.getQueryData<UpgradeWaitlistStatus>(query.queryKey) ?? null;
  }
}

export function useUpgradeWaitlistStatus({ enabled = true }: { enabled?: boolean } = {}) {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const client = useQueryClient();
  const { data, isLoading } = useQuery({
    ...statusQuery(userId ?? ''),
    enabled: enabled && userId !== null,
  });

  const updateStatus = useCallback(
    (change: (status: UpgradeWaitlistStatus) => UpgradeWaitlistStatus) => {
      if (!userId) return;
      const { queryKey } = statusQuery(userId);
      client.setQueryData<UpgradeWaitlistStatus>(queryKey, (current) =>
        current ? change(current) : current,
      );
      void client.invalidateQueries({ queryKey });
    },
    [client, userId],
  );

  const recordJoined = useCallback(
    (plan: SelfServePaidPlanTier) =>
      updateStatus((status) =>
        status.joinedPlans.includes(plan)
          ? status
          : { ...status, joinedPlans: [...status.joinedPlans, plan] },
      ),
    [updateStatus],
  );

  const recordAccessGranted = useCallback(
    () => updateStatus((status) => ({ ...status, accessGranted: true })),
    [updateStatus],
  );

  return { status: data ?? null, checking: isLoading, recordJoined, recordAccessGranted };
}
