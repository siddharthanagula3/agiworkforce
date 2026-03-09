/**
 * Feature Flag Store
 *
 * Manages server-side feature flags returned by the backend on login.
 * These flags supplement the plan-tier-based entitlement checks in
 * subscriptionPlanStore and give the backend fine-grained control over
 * individual feature rollout without requiring a plan change.
 *
 * Also exposes `hasFeature()` — the canonical helper for checking whether
 * the current user can access a named feature. New code should prefer
 * importing this helper over duplicating the tier-check logic.
 *
 * Extracted from the unified auth.ts god store.
 *
 * Persist key: 'feature-flag-storage' (v1)
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';
import { subscriptionService, type PlanFeatures } from '../services/subscriptionService';
import { useSubscriptionPlanStore } from './subscriptionPlanStore';

// =============================================================================
// State & Actions
// =============================================================================

interface FeatureFlagState {
  /** Key-value map of feature flags returned by the backend. */
  featureFlags: Record<string, boolean>;
}

interface FeatureFlagActions {
  /** Upsert a single flag. */
  setFeatureFlag: (flag: string, enabled: boolean) => void;
  /** Replace the entire flag set (called during sync). */
  setAllFeatureFlags: (flags: Record<string, boolean>) => void;
  /** Reset to defaults (called on logout). */
  reset: () => void;
}

export type FeatureFlagStore = FeatureFlagState & FeatureFlagActions;

// =============================================================================
// Default state
// =============================================================================

const DEFAULT_STATE: FeatureFlagState = {
  featureFlags: {},
};

// =============================================================================
// Store
// =============================================================================

export const useFeatureFlagStore = create<FeatureFlagStore>()(
  devtools(
    persist(
      subscribeWithSelector((set) => ({
        ...DEFAULT_STATE,

        setFeatureFlag: (flag, enabled) => {
          set(
            (state) => ({ featureFlags: { ...state.featureFlags, [flag]: enabled } }),
            undefined,
            'featureFlag/setFeatureFlag',
          );
        },

        setAllFeatureFlags: (flags) => {
          set({ featureFlags: flags }, undefined, 'featureFlag/setAll');
        },

        reset: () => {
          set(DEFAULT_STATE, undefined, 'featureFlag/reset');
        },
      })),
      {
        name: 'feature-flag-storage',
        version: 1,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        // Feature flags should always be fetched fresh — do not persist
        partialize: () => ({}),
        onRehydrateStorage: () => () => {
          // no-op
        },
      },
    ),
    { name: 'FeatureFlagStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Selectors
// =============================================================================

export const selectFeatureFlags = (s: FeatureFlagStore) => s.featureFlags;
export const selectFeatureFlag = (flag: string) => (s: FeatureFlagStore) =>
  s.featureFlags[flag] ?? false;

// =============================================================================
// Feature gate helper
// =============================================================================

/**
 * Check whether the current user has access to a named feature.
 *
 * Resolution order:
 * 1. Backend override in featureFlags map (explicit true/false)
 * 2. subscriptionService plan-feature mapping
 * 3. Hard-coded tier lists (pro / enterprise)
 * 4. Default: allow (conservative — fails closed only for known restricted features)
 */
export function hasFeature(featureKey: string): boolean {
  const { featureFlags } = useFeatureFlagStore.getState();

  if (featureFlags[featureKey] !== undefined) {
    return featureFlags[featureKey]!;
  }

  const featureMap: Record<string, keyof PlanFeatures> = {
    browser_automation: 'browserAutomation',
    advanced_ui_automation: 'advancedUiAutomation',
    email_support: 'emailSupport',
    llm_cost_tracking: 'llmCostTracking',
    team_features: 'teamFeatures',
    sso: 'sso',
    priority_support: 'prioritySupport',
    custom_workflows: 'customWorkflows',
    webhook_integration: 'webhookIntegration',
    analytics: 'analytics',
  };

  const mappedFeature = featureMap[featureKey];
  if (mappedFeature) {
    return subscriptionService.hasFeatureAccess(mappedFeature);
  }

  const { isPro, isEnterprise } = useSubscriptionPlanStore.getState();

  const proFeatures = [
    'unlimited_automations',
    'browser_automation',
    'advanced_ui_automation',
    'email_support',
    'llm_cost_tracking',
  ];

  const enterpriseFeatures = [
    'team_features',
    'sso',
    'priority_support',
    'custom_workflows',
    'webhook_integration',
    'analytics',
  ];

  if (enterpriseFeatures.includes(featureKey)) return isEnterprise;
  if (proFeatures.includes(featureKey)) return isPro || isEnterprise;

  return true;
}
