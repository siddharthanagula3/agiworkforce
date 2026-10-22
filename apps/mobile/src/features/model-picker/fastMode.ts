import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  isWorkspaceFeatureEnabled,
  parseEffectiveWorkspacePolicy,
} from '@agiworkforce/client-runtime';
import {
  FAST_MODE_BLOCK_MESSAGES,
  WORKSPACE_POLICY_EFFECTIVE_PATH,
  fastModeNeedsUsageCreditsCheck,
  getModelMetadataById,
  isFreeBillingPlanTier,
  resolveFastModeAvailability,
  type FastModeBlock,
} from '@agiworkforce/types';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { api } from '@/services/api';
import { fetchUsageSnapshot } from '@/services/usage';
import { useTierStore } from '@/src/features/billing/store';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

export const FAST_MODE_USAGE_CREDITS_MESSAGE =
  'Fast mode is billed to usage credits. Turn them on in billing on the web.';

interface FastModeAccountState {
  account: CloudAccountEpoch;
  usageCreditsOn: boolean | null;
  workspaceAllowsFast: boolean | null;
}

interface FastModeState {
  enabled: boolean;
  accountState: FastModeAccountState | null;
  checking: boolean;
  setEnabled: (enabled: boolean) => void;
  refresh: () => Promise<void>;
}

export const useFastModeStore = create<FastModeState>()(
  persist(
    (set, get) => ({
      enabled: false,
      accountState: null,
      checking: false,
      setEnabled: (enabled) => set({ enabled }),
      refresh: async () => {
        if (get().checking) return;
        const account = captureCloudAccountEpoch();
        if (!account) return;
        set({ checking: true });
        const [usage, policy] = await Promise.allSettled([
          fetchUsageSnapshot(),
          api.get<unknown>(WORKSPACE_POLICY_EFFECTIVE_PATH),
        ]);
        if (!isCloudAccountEpochCurrent(account)) {
          set({ checking: false });
          return;
        }
        const credits = usage.status === 'fulfilled' ? usage.value.credits : null;
        const parsedPolicy =
          policy.status === 'fulfilled' ? parseEffectiveWorkspacePolicy(policy.value) : null;
        set({
          checking: false,
          accountState: {
            account,
            usageCreditsOn: credits ? credits.purchased.overage_enabled : null,
            workspaceAllowsFast: parsedPolicy
              ? isWorkspaceFeatureEnabled(parsedPolicy, 'fast_mode')
              : null,
          },
        });
      },
    }),
    {
      name: 'fast-mode-store',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      partialize: (state) => ({ enabled: state.enabled }),
    },
  ),
);

rehydrateWhenMmkvReady(useFastModeStore, 'fast-mode-store');

export interface MobileFastMode {
  offersFast: boolean;
  priceMultiplier: number | null;
  enabled: boolean;
  allowed: boolean;
  block: FastModeBlock | null;
}

function paidPlanFrom(tier: string, lastRefreshedAt: string | null): boolean | null {
  return lastRefreshedAt === null ? null : !isFreeBillingPlanTier(tier);
}

function resolveMobileFastMode(
  modelId: string,
  enabled: boolean,
  accountState: FastModeAccountState | null,
  tier: string,
  lastRefreshedAt: string | null,
): MobileFastMode {
  const fastTier = getModelMetadataById(modelId)?.fastTier ?? null;
  const current = isCloudAccountEpochCurrent(accountState?.account) ? accountState : null;
  const { allowed, block } = resolveFastModeAvailability({
    offersFast: fastTier !== null,
    paidPlan: paidPlanFrom(tier, lastRefreshedAt),
    workspaceBlocks: current?.workspaceAllowsFast === false,
    usageCreditsOn: current?.usageCreditsOn ?? null,
  });
  return {
    offersFast: fastTier !== null,
    priceMultiplier: fastTier?.priceMultiplier ?? null,
    enabled,
    allowed,
    block,
  };
}

export function fastModeBlockMessage(block: FastModeBlock): string {
  return block === 'usage_credits'
    ? FAST_MODE_USAGE_CREDITS_MESSAGE
    : FAST_MODE_BLOCK_MESSAGES[block];
}

export function useMobileFastMode(modelId: string): MobileFastMode {
  const enabled = useFastModeStore((s) => s.enabled);
  const accountState = useFastModeStore((s) => s.accountState);
  const refresh = useFastModeStore((s) => s.refresh);
  const tier = useTierStore((s) => s.tier);
  const lastRefreshedAt = useTierStore((s) => s.lastRefreshedAt);
  const fastMode = resolveMobileFastMode(modelId, enabled, accountState, tier, lastRefreshedAt);
  const shouldCheck = fastModeNeedsUsageCreditsCheck({
    offersFast: fastMode.offersFast,
    paidPlan: paidPlanFrom(tier, lastRefreshedAt),
    workspaceBlocks: false,
  });

  useEffect(() => {
    if (shouldCheck) void refresh();
  }, [modelId, refresh, shouldCheck]);

  return fastMode;
}

export function fastSpeedForModel(modelId: string): 'fast' | undefined {
  const { enabled, accountState } = useFastModeStore.getState();
  if (!enabled) return undefined;
  const { tier, lastRefreshedAt } = useTierStore.getState();
  return resolveMobileFastMode(modelId, enabled, accountState, tier, lastRefreshedAt).allowed
    ? 'fast'
    : undefined;
}
