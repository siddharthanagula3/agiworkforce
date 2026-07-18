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
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { api } from '@/services/api';
import { normalizeBillingPlanTier } from '@agiworkforce/types';
import type { BillingPlanTier } from '@agiworkforce/types';
import { parseMeResponse } from '@agiworkforce/cloud-contracts';

interface TierState {
  /** Current subscription tier, normalised via `normalizeBillingPlanTier`. */
  tier: BillingPlanTier;
  /** True while a tier refresh network call is in flight. */
  isRefreshing: boolean;
  /** ISO timestamp of the last successful refresh, or null if never refreshed. */
  lastRefreshedAt: string | null;
  /**
   * Deployment capability (not a per-user entitlement): the reachable E2B
   * code-execution loop is enabled on this deployment
   * (`/api/me` `feature_flags.code_execution`, mirrors `AGI_E2B_EXECUTION=1`
   * server-side). Defaults false until the first successful `refreshTier()` —
   * a fresh install / offline cold-start must not show the "Run code" toggle
   * before the deployment's real capability is known. Combined with the
   * selected model's own `codeExecution` capability flag by callers (e.g.
   * AddToChatSheet) so the toggle is never cosmetic.
   */
  codeExecutionAvailable: boolean;
  /**
   * Whether AGI's generic Cloud web-search function tool has a configured
   * backend. Native provider search does not depend on this flag. Defaults
   * false until `/api/me` has been validated.
   */
  genericWebSearchAvailable: boolean;
  /**
   * Provider id of the first model used in the current conversation (e.g.
   * 'anthropic', 'openai').  Set to null when no conversation is active or
   * when a new conversation begins.  Used by the provider-switch guard to
   * detect cross-provider switches mid-thread and enforce the Pro+ gate.
   */
  currentConversationProvider: string | null;

  /** Fetch `/api/me`, normalise the plan tier, and persist to MMKV. */
  refreshTier: () => Promise<void>;
  /** Override tier locally (e.g. optimistic post-upgrade update). */
  setTier: (tier: BillingPlanTier) => void;
  /**
   * Record the provider of the current conversation's first message.
   * Call this when the user sends the first message in a thread.
   * Pass null to clear (e.g. when navigating away from a conversation).
   */
  setCurrentConversationProvider: (provider: string | null) => void;
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
      codeExecutionAvailable: false,
      genericWebSearchAvailable: false,
      currentConversationProvider: null,

      refreshTier: async () => {
        // NOTE: tier is READ-ONLY plan metadata and is intentionally NOT gated by
        // `FEATURES.billing`. The billing flag gates the in-app *paid-upgrade* UI
        // (Stripe portal/checkout), which stays deflected to the web while it's
        // off — but a paying user must still see their real plan (Pro/Max), not a
        // permanent "Free". Trust boundary is preserved: `api.get('/api/me')`
        // routes through guardedFetch, so a Local-mode call is blocked before any
        // network I/O (the catch below keeps the cached tier). The call sites in
        // `app/_layout.tsx` already gate on `isClerkSignedIn`.
        // js-early-exit: skip if already refreshing
        if (get().isRefreshing) return;

        set({ isRefreshing: true });
        try {
          // Validate against the shared /api/me contract (packages/services) —
          // a mismatch throws into the catch below (cached tier kept, warning
          // logged) instead of silently reading a drifted shape. This replaced
          // a private interface that wrongly assumed a nested `user` envelope.
          const data = parseMeResponse(await api.get<unknown>('/api/me'));
          const tier = normalizeBillingPlanTier(data.plan.tier ?? null);
          set({
            tier,
            lastRefreshedAt: new Date().toISOString(),
            codeExecutionAvailable: data.feature_flags.code_execution ?? false,
            genericWebSearchAvailable: data.feature_flags.generic_web_search ?? false,
          });
        } catch (err) {
          // Network failure or auth error — keep the cached tier, don't clear it.
          // The paywall path on the server is the authoritative gate; the client
          // tier is an optimistic hint only. Still log it: a fully silent catch
          // here made a real Local-mode-egress-block bug (2026-07-05) look like
          // an unexplained permanent "Free" plan with zero diagnostic trail.
          console.warn('[tierStore] refreshTier failed (keeping cached tier):', err);
        } finally {
          set({ isRefreshing: false });
        }
      },

      setTier: (tier) => {
        set({ tier });
      },

      setCurrentConversationProvider: (provider) => {
        set({ currentConversationProvider: provider });
      },
    }),
    {
      name: 'tier-store',
      storage: createJSONStorage(() => mmkvStorage),
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      // Persist only the cached tier value, not the in-flight flag.
      // currentConversationProvider is intentionally excluded — it is session-
      // scoped and must reset on cold start rather than rehydrate from disk.
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

rehydrateWhenMmkvReady(useTierStore, 'tier-store');
