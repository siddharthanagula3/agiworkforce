/**
 * Tier store — caches the authenticated user's subscription tier.
 *
 * Hydration strategy:
 *   - On app launch (after auth is initialised): call `refreshTier()` once.
 *   - On app foreground (AppState 'active' after 'background'): call `refreshTier()`.
 *   - After a successful subscription update: call `refreshTier()` explicitly.
 *
 * The persisted value is written to MMKV so it survives cold starts. On the
 * next launch the store rehydrates instantly while a background refresh runs.
 *
 * No server-no-shared-module-state concern: the store is Zustand singleton but
 * never mutated at module load — only via `refreshTier()` and Zustand actions.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import { api } from '@/services/api';
import { normalizeBillingPlanTier } from '@agiworkforce/types';
import type { BillingPlanTier } from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape returned by `GET /api/me` (apps/web/app/api/me/route.ts).
 * The endpoint nests subscription details under `plan`, not as a top-level field.
 */
interface MeResponse {
  user?: { id?: string; email?: string };
  plan?: {
    /** Subscription tier — 'free' | 'hobby' | 'pro' | 'pro_plus' | 'max'. */
    tier?: string | null;
    display_name?: string;
    status?: string;
    current_period_end?: number | null;
  };
  feature_flags?: {
    beta_features?: boolean;
    advanced_model_access?: boolean;
  };
}

interface TierState {
  /** Current subscription tier, normalised via `normalizeBillingPlanTier`. */
  tier: BillingPlanTier;
  /** True while a tier refresh network call is in flight. */
  isRefreshing: boolean;
  /** ISO timestamp of the last successful refresh, or null if never refreshed. */
  lastRefreshedAt: string | null;

  /** Fetch `/api/me`, normalise the plan tier, and persist to MMKV. */
  refreshTier: () => Promise<void>;
  /** Override tier locally (e.g. optimistic post-upgrade update). */
  setTier: (tier: BillingPlanTier) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTierStore = create<TierState>()(
  persist(
    (set, get) => ({
      tier: 'free',
      isRefreshing: false,
      lastRefreshedAt: null,

      refreshTier: async () => {
        // js-early-exit: skip if already refreshing
        if (get().isRefreshing) return;

        set({ isRefreshing: true });
        try {
          const data = await api.get<MeResponse>('/api/me');
          const tier = normalizeBillingPlanTier(data.plan?.tier ?? null);
          set({ tier, lastRefreshedAt: new Date().toISOString() });
        } catch {
          // Network failure or auth error — keep the cached tier, don't clear it.
          // The paywall path on the server is the authoritative gate; the client
          // tier is an optimistic hint only.
        } finally {
          set({ isRefreshing: false });
        }
      },

      setTier: (tier) => {
        set({ tier });
      },
    }),
    {
      name: 'tier-store',
      storage: createJSONStorage(() => mmkvStorage),
      // Persist only the cached tier value, not the in-flight flag.
      partialize: (state) => ({
        tier: state.tier,
        lastRefreshedAt: state.lastRefreshedAt,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[tierStore] Hydration failed:', error);
      },
    },
  ),
);
