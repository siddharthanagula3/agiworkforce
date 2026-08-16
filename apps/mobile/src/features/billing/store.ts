
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { api } from '@/services/api';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { effectivePlanTier, normalizeBillingPlanTier } from '@agiworkforce/types';
import type { BillingPlanTier } from '@agiworkforce/types';
import { parseMeResponse } from '@agiworkforce/cloud-contracts';
import type { MobileBillingSource } from './subscriptionSource';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

interface TierState {
  tier: BillingPlanTier;
  billingTier: BillingPlanTier;
  billingStatus: string;
  billingSource: MobileBillingSource;
  billingPeriodEnd: number | null;
  billingCancelsAtPeriodEnd: boolean;
  isRefreshing: boolean;
  lastRefreshedAt: string | null;
  codeExecutionAvailable: boolean;
  genericWebSearchAvailable: boolean;
  grantedCapabilities: string[];
  capabilityHandshakeVersion: string | null;
  capabilityHandshakeReceived: boolean;
  currentConversationProvider: string | null;

  refreshTier: () => Promise<void>;
  setTier: (tier: BillingPlanTier) => void;
  clearAccountEntitlements: () => void;
  setCurrentConversationProvider: (provider: string | null) => void;
}

export const useTierStore = create<TierState>()(
  persist(
    (set, get) => ({
      tier: 'free',
      billingTier: 'free',
      billingStatus: 'none',
      billingSource: 'unknown',
      billingPeriodEnd: null,
      billingCancelsAtPeriodEnd: false,
      isRefreshing: false,
      lastRefreshedAt: null,
      codeExecutionAvailable: false,
      genericWebSearchAvailable: false,
      grantedCapabilities: [],
      capabilityHandshakeVersion: null,
      capabilityHandshakeReceived: false,
      currentConversationProvider: null,

      refreshTier: async () => {
        if (get().isRefreshing) return;
        if (useChatAppModeStore.getState().appMode !== 'cloud') return;
        const account = captureCloudAccountEpoch();
        if (!account) return;

        set({ isRefreshing: true });
        try {
          const response = await api.get<unknown>('/api/me?surface=mobile');
          if (!isCloudAccountEpochCurrent(account)) return;
          const data = parseMeResponse(response);
          const billingTier = normalizeBillingPlanTier(data.plan.tier ?? null);
          const tier = normalizeBillingPlanTier(
            effectivePlanTier(data.plan.tier ?? null, data.plan.status),
          );
          const grantedCapabilities = data.capability_handshake?.granted ?? [];
          set({
            tier,
            billingTier,
            billingStatus: data.plan.status,
            billingSource: data.plan.subscription_source ?? 'unknown',
            billingPeriodEnd: data.plan.current_period_end,
            billingCancelsAtPeriodEnd: data.plan.cancel_at_period_end ?? false,
            lastRefreshedAt: new Date().toISOString(),
            codeExecutionAvailable:
              (data.feature_flags.code_execution ?? false) &&
              (data.capability_handshake === undefined ||
                grantedCapabilities.includes('canUseCloudExecution')),
            genericWebSearchAvailable: data.feature_flags.generic_web_search ?? false,
            grantedCapabilities,
            capabilityHandshakeVersion: data.capability_handshake?.version ?? null,
            capabilityHandshakeReceived: data.capability_handshake !== undefined,
          });
        } catch (err) {
          if (!isCloudAccountEpochCurrent(account)) return;
          console.warn('[tierStore] refreshTier failed (keeping cached tier):', err);
        } finally {
          if (isCloudAccountEpochCurrent(account)) set({ isRefreshing: false });
        }
      },

      setTier: (tier) => {
        set({ tier, billingTier: tier });
      },

      clearAccountEntitlements: () => {
        set({
          tier: 'free',
          billingTier: 'free',
          billingStatus: 'none',
          billingSource: 'unknown',
          billingPeriodEnd: null,
          billingCancelsAtPeriodEnd: false,
          isRefreshing: false,
          lastRefreshedAt: null,
          codeExecutionAvailable: false,
          genericWebSearchAvailable: false,
          grantedCapabilities: [],
          capabilityHandshakeVersion: null,
          capabilityHandshakeReceived: false,
          currentConversationProvider: null,
        });
      },

      setCurrentConversationProvider: (provider) => {
        set({ currentConversationProvider: provider });
      },
    }),
    {
      name: 'tier-store',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      partialize: (state) => ({
        tier: state.tier,
        billingTier: state.billingTier,
        billingStatus: state.billingStatus,
        billingSource: state.billingSource,
        billingPeriodEnd: state.billingPeriodEnd,
        billingCancelsAtPeriodEnd: state.billingCancelsAtPeriodEnd,
        lastRefreshedAt: state.lastRefreshedAt,
        codeExecutionAvailable: state.codeExecutionAvailable,
        genericWebSearchAvailable: state.genericWebSearchAvailable,
        grantedCapabilities: state.grantedCapabilities,
        capabilityHandshakeVersion: state.capabilityHandshakeVersion,
        capabilityHandshakeReceived: state.capabilityHandshakeReceived,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[tierStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useTierStore, 'tier-store');

export function isCapabilityRequestable(capability: string): boolean {
  const { capabilityHandshakeReceived, grantedCapabilities } = useTierStore.getState();
  if (!capabilityHandshakeReceived) return true;
  return grantedCapabilities.includes(capability);
}

function waitForActiveTierRefresh(): Promise<void> {
  if (!useTierStore.getState().isRefreshing) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve();
    };
    const unsubscribe = useTierStore.subscribe((state) => {
      if (!state.isRefreshing) finish();
    });

    if (!useTierStore.getState().isRefreshing) finish();
  });
}

export async function ensureCloudEntitlementsReadyForRequest(): Promise<void> {
  if (useChatAppModeStore.getState().appMode !== 'cloud') return;
  const account = captureCloudAccountEpoch();
  if (!account) return;

  if (useTierStore.getState().isRefreshing) {
    await waitForActiveTierRefresh();
  }
  if (!isCloudAccountEpochCurrent(account)) return;

  const state = useTierStore.getState();
  if (state.capabilityHandshakeReceived || state.lastRefreshedAt !== null) return;
  await state.refreshTier();
}

if (__DEV__) {
  (globalThis as unknown as { __AGI_DEBUG__?: Record<string, unknown> }).__AGI_DEBUG__ = {
    ...((globalThis as unknown as { __AGI_DEBUG__?: Record<string, unknown> }).__AGI_DEBUG__ ?? {}),
    tierStore: useTierStore,
  };
}
