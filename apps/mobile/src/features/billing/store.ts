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
  /**
   * Effective entitlement tier. This is status-gated and is the only tier
   * feature/model/tool gates may consume.
   */
  tier: BillingPlanTier;
  /** Raw recorded plan, for truthful billing/account copy only. */
  billingTier: BillingPlanTier;
  /** Raw billing lifecycle status returned by `/api/me`. */
  billingStatus: string;
  /** Server-authoritative owner of subscription management. */
  billingSource: MobileBillingSource;
  /** Unix seconds for the current paid period end, or null when no period exists. */
  billingPeriodEnd: number | null;
  /** Whether the subscription is scheduled to cancel at `billingPeriodEnd`. */
  billingCancelsAtPeriodEnd: boolean;
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
  /** Server-authoritative capability ids for this account + Mobile surface. */
  grantedCapabilities: string[];
  /** Version/hash of the cached capability document. */
  capabilityHandshakeVersion: string | null;
  /**
   * Whether a capability handshake has ever been received on this device.
   *
   * This is the difference between "the server said no" and "we never asked",
   * and conflating the two broke every server tool on Mobile: `grantedCapabilities`
   * starts `[]`, `refreshTier` early-returns while the app is in Local mode (which
   * is how it always launches), and every failure path is swallowed — so an empty
   * array was indistinguishable from a denial and the send path failed closed
   * forever. Web never had this problem because it does not consult the handshake
   * at all. Read this before treating an absent capability as a denial.
   */
  capabilityHandshakeReceived: boolean;
  /**
   * Provider id of the first model used in the current conversation (e.g.
   * 'anthropic', 'openai').  Set to null when no conversation is active or
   * when a new conversation begins.  Used by the provider-switch guard to
   * detect cross-provider switches mid-thread and enforce the provider-switch
   * gate (see `features/model-picker/tierGuard.ts`).
   */
  currentConversationProvider: string | null;

  /** Fetch `/api/me`, normalise the plan tier, and persist to MMKV. */
  refreshTier: () => Promise<void>;
  /** Override tier locally (e.g. optimistic post-upgrade update). */
  setTier: (tier: BillingPlanTier) => void;
  /** Clear all account-scoped plan, capability, and provider state on sign-out. */
  clearAccountEntitlements: () => void;
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
        // Local mode has no managed-cloud plan to read, and egressGuard blocks
        // /api/me before any network I/O. Attempting it anyway threw on every
        // launch and logged the catch below as a warning, which trained readers
        // to ignore the one diagnostic that exists for real tier failures.
        if (useChatAppModeStore.getState().appMode !== 'cloud') return;
        const account = captureCloudAccountEpoch();
        if (!account) return;

        set({ isRefreshing: true });
        try {
          // Validate against the shared /api/me contract (packages/services) —
          // a mismatch throws into the catch below (cached tier kept, warning
          // logged) instead of silently reading a drifted shape. This replaced
          // a private interface that wrongly assumed a nested `user` envelope.
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
            // Same "absence is not denial" rule as `isCapabilityRequestable`: a
            // deployment that ships no handshake must not turn code execution off.
            codeExecutionAvailable:
              (data.feature_flags.code_execution ?? false) &&
              (data.capability_handshake === undefined ||
                grantedCapabilities.includes('canUseCloudExecution')),
            genericWebSearchAvailable: data.feature_flags.generic_web_search ?? false,
            grantedCapabilities,
            capabilityHandshakeVersion: data.capability_handshake?.version ?? null,
            // Only a response that actually carried a handshake counts. A 200 with
            // no `capability_handshake` (older deployment) must not be recorded as
            // "the server answered and granted nothing".
            capabilityHandshakeReceived: data.capability_handshake !== undefined,
          });
        } catch (err) {
          if (!isCloudAccountEpochCurrent(account)) return;
          // Network failure or auth error — keep the cached tier, don't clear it.
          // The paywall path on the server is the authoritative gate; the client
          // tier is an optimistic hint only. Still log it: a fully silent catch
          // here made a real Local-mode-egress-block bug (2026-07-05) look like
          // an unexplained permanent "Free" plan with zero diagnostic trail.
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
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      // Persist only the cached tier value, not the in-flight flag.
      // currentConversationProvider is intentionally excluded — it is session-
      // scoped and must reset on cold start rather than rehydrate from disk.
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

/**
 * Is this capability allowed to be REQUESTED from the client?
 *
 * Absence of a handshake is not a denial. Until the server has actually answered,
 * this returns true and lets the request go — the route re-checks entitlement and
 * the model capability clamp still applies, so an over-permissive client cannot
 * grant itself anything. Once a handshake HAS been received, its answer is
 * respected exactly.
 *
 * The previous `grantedCapabilities.includes(...)` check inverted this: it denied
 * by default, and because the array is empty until a cloud-mode `/api/me` succeeds,
 * Mobile shipped with web search, code execution and deep research permanently off
 * while Web (which never consults the handshake) had them on.
 */
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

    // Close the check/subscribe race: the request can finish between the first
    // read above and installing this listener.
    if (!useTierStore.getState().isRefreshing) finish();
  });
}

/**
 * Resolve the first Cloud turn against the real account/deployment document.
 *
 * Cloud-mode entry already starts `refreshTier()` in the root layout, but that
 * work is intentionally backgrounded. A fast user can press Send before it
 * completes. Previously that first turn read the default Free tier, empty
 * capability list, and `genericWebSearchAvailable:false`; Auto could choose the
 * wrong plan route and generic Web Search was omitted until a later turn.
 *
 * This helper joins an existing refresh rather than issuing a duplicate. When
 * no validated response has ever been received, it starts one and awaits it.
 * Network/auth failures retain the existing optimistic fallback and remain
 * server-authoritatively gated by the completion route.
 */
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

/**
 * Dev-only inspection handle.
 *
 * Entitlement bugs on this store are invisible from the UI — a missing capability
 * looks identical to a model that simply chose not to call a tool. Exposing the
 * store under __DEV__ lets Metro's Hermes inspector read the live values
 * (`Runtime.evaluate` over the inspector proxy) instead of guessing from a
 * console.warn that may never be captured. Stripped from release builds.
 */
if (__DEV__) {
  (globalThis as unknown as { __AGI_DEBUG__?: Record<string, unknown> }).__AGI_DEBUG__ = {
    ...((globalThis as unknown as { __AGI_DEBUG__?: Record<string, unknown> }).__AGI_DEBUG__ ?? {}),
    tierStore: useTierStore,
  };
}
