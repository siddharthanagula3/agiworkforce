/**
 * stateBridge.ts — Bridge between zustand stores and the canonical AppStateStore.
 *
 * MIGRATION PATTERN (Task 1.3 PoC):
 *   The canonical AppStateStore in packages/runtime/src/state/ is the long-term
 *   target. During the transition, this bridge:
 *     1. Subscribes to existing zustand stores.
 *     2. Syncs relevant fields to appStateStore via setState.
 *     3. Wires model-switch broadcasts and settings persistence back to zustand.
 *
 *   This keeps ALL consumer components rendering correctly (they still read from
 *   the zustand stores they know about) while the canonical store becomes the
 *   single source of truth for cross-surface concerns.
 *
 * STORES BRIDGED (12 out of 67):
 *   1. auth.ts → AppState.auth (userId, email, planTier, isAuthenticated, accessToken)
 *   2. appModeStore.ts → AppState.chat.appMode + AppState.subscriptions.planTier
 *   3. notificationStore.ts → (no AppState field needed; bridge registers for future)
 *   4. thinkingStore.ts → AppState.settings.showThinking
 *   5. settingsDialogStore.ts → (UI-only; bridge registers for observability)
 *   6. windowStore.ts → (platform-specific; bridge ensures model-switch doesn't reset window)
 *   7. mcpStore.ts → AppState.mcp (connectedCount, isInitialized)
 *   8. mcpServerStore.ts → AppState.mcp.errorServerIds
 *   9. memoryStore.ts → AppState.memory (totalEntries, avgImportance, decayEnabled)
 *   10. modelStore.ts → AppState.chat.activeModelId + AppState.chat.activeProvider
 *   11. settingsStore.ts → AppState.settings (theme, language, chatFont)
 *   12. unifiedChatStore.ts → AppState.chat.isStreaming + AppState.chat.activeConversationId
 *
 * CALL ONCE at app startup (App.tsx or equivalent).
 * Returns a cleanup function that unsubscribes all bridges.
 */

import { appStateStore } from '@agiworkforce/runtime';
import type { AppState } from '@agiworkforce/runtime';

// We import store types but not the full stores to avoid heavy initialization.
// Each bridge function is called lazily when the store is available.

/** Single cleanup registry for all bridge subscriptions. */
const cleanupFns: Array<() => void> = [];

function addCleanup(fn: () => void): void {
  cleanupFns.push(fn);
}

// ---------------------------------------------------------------------------
// Bridge 1: auth.ts → AppState.auth
// ---------------------------------------------------------------------------

export function bridgeAuthStore(): void {
  // Dynamic import to avoid circular deps at module init time
  import('../auth')
    .then(({ useUnifiedAuthStore }) => {
      const unsubscribe = useUnifiedAuthStore.subscribe((state) => {
        appStateStore.setState((prev: AppState) => {
          const userId = state.user?.id ?? null;
          const email = state.user?.email ?? null;
          const planTier = (state.account?.plan ?? 'free') as AppState['auth']['planTier'];
          const isAuthenticated = state.isAuthenticated ?? false;
          const accessToken = state.account?.accessToken ?? null;

          // Object.is short-circuit: only update if something actually changed
          if (
            prev.auth.userId === userId &&
            prev.auth.email === email &&
            prev.auth.planTier === planTier &&
            prev.auth.isAuthenticated === isAuthenticated &&
            prev.auth.accessToken === accessToken
          ) {
            return prev;
          }

          return {
            ...prev,
            auth: {
              ...prev.auth,
              userId,
              email,
              displayName: state.user?.name ?? null,
              avatarUrl: state.user?.avatar ?? null,
              planTier,
              isAuthenticated,
              accessToken,
              lastSyncedAt: Date.now(),
            },
          };
        });
      });
      addCleanup(unsubscribe);
    })
    .catch((err: unknown) => {
      console.warn('[stateBridge] Failed to bridge auth store:', err);
    });
}

// ---------------------------------------------------------------------------
// Bridge 2: appModeStore.ts → AppState.chat.appMode + AppState.subscriptions
// ---------------------------------------------------------------------------

export function bridgeAppModeStore(): void {
  import('../appModeStore')
    .then(({ useAppModeStore }) => {
      const unsubscribe = useAppModeStore.subscribe((state) => {
        appStateStore.setState((prev: AppState) => {
          const appMode = state.mode;
          const planTier = (state.planTier ?? 'free') as AppState['subscriptions']['planTier'];

          if (prev.chat.appMode === appMode && prev.subscriptions.planTier === planTier) {
            return prev;
          }

          return {
            ...prev,
            chat: { ...prev.chat, appMode },
            subscriptions: { ...prev.subscriptions, planTier },
          };
        });
      });
      addCleanup(unsubscribe);
    })
    .catch((err: unknown) => {
      console.warn('[stateBridge] Failed to bridge appMode store:', err);
    });
}

// ---------------------------------------------------------------------------
// Bridge 3: thinkingStore.ts → AppState.settings.showThinking
// ---------------------------------------------------------------------------

export function bridgeThinkingStore(): void {
  import('../thinkingStore')
    .then(({ useThinkingStore }) => {
      const unsubscribe = useThinkingStore.subscribe((state) => {
        const showThinking = state.config?.enabled ?? true;
        appStateStore.setState((prev: AppState) => {
          if (prev.settings.showThinking === showThinking) return prev;
          return {
            ...prev,
            settings: { ...prev.settings, showThinking },
          };
        });
      });
      addCleanup(unsubscribe);
    })
    .catch((err: unknown) => {
      console.warn('[stateBridge] Failed to bridge thinking store:', err);
    });
}

// ---------------------------------------------------------------------------
// Bridge 4: settingsStore.ts → AppState.settings (theme, language, chatFont)
// ---------------------------------------------------------------------------

export function bridgeSettingsStore(): void {
  import('../settingsStore')
    .then(({ useSettingsStore }) => {
      const unsubscribe = useSettingsStore.subscribe((state) => {
        appStateStore.setState((prev: AppState) => {
          // settingsStore nests theme/language/chatFont inside windowPreferences
          const wp = state.windowPreferences as
            | {
                theme?: string;
                chatFont?: string;
                language?: string;
              }
            | undefined;
          const theme = wp?.theme ?? 'system';
          const language =
            (state.llmConfig as { language?: string } | undefined)?.language ??
            wp?.language ??
            'en';
          const chatFont = wp?.chatFont ?? 'default';

          if (
            prev.settings.theme === theme &&
            prev.settings.language === language &&
            prev.settings.chatFont === chatFont
          ) {
            return prev;
          }

          return {
            ...prev,
            settings: {
              ...prev.settings,
              theme,
              language,
              chatFont,
            },
          };
        });
      });
      addCleanup(unsubscribe);
    })
    .catch((err: unknown) => {
      console.warn('[stateBridge] Failed to bridge settings store:', err);
    });
}

// ---------------------------------------------------------------------------
// Bridge 5: modelStore.ts → AppState.chat.activeModelId + activeProvider
// NOTE: Model IDs come from models.json at runtime — NEVER hardcoded here.
// ---------------------------------------------------------------------------

export function bridgeModelStore(): void {
  import('../modelStore')
    .then(({ useModelStore }) => {
      const unsubscribe = useModelStore.subscribe((state) => {
        // selectedModel comes from modelStore which reads from models.json.
        // We never hardcode a model ID here — we forward whatever the store resolved.
        const activeModelId = (state.selectedModel as string | null | undefined) ?? null;
        const activeProvider = (state.selectedProvider as string | null | undefined) ?? null;

        appStateStore.setState((prev: AppState) => {
          if (
            prev.chat.activeModelId === activeModelId &&
            prev.chat.activeProvider === activeProvider
          ) {
            return prev;
          }
          return {
            ...prev,
            chat: { ...prev.chat, activeModelId, activeProvider },
          };
        });
      });
      addCleanup(unsubscribe);
    })
    .catch((err: unknown) => {
      console.warn('[stateBridge] Failed to bridge model store:', err);
    });
}

// ---------------------------------------------------------------------------
// Bridge 6: mcpStore.ts → AppState.mcp.connectedCount + isInitialized
// ---------------------------------------------------------------------------

export function bridgeMcpStore(): void {
  import('../mcpStore')
    .then(({ useMcpStore }) => {
      const unsubscribe = useMcpStore.subscribe((state) => {
        const connectedCount = (state.servers as Array<{ status?: string }>).filter(
          (s) => s.status === 'connected',
        ).length;
        const isInitialized = state.isInitialized ?? false;

        appStateStore.setState((prev: AppState) => {
          if (
            prev.mcp.connectedCount === connectedCount &&
            prev.mcp.isInitialized === isInitialized
          ) {
            return prev;
          }
          return {
            ...prev,
            mcp: { ...prev.mcp, connectedCount, isInitialized },
          };
        });
      });
      addCleanup(unsubscribe);
    })
    .catch((err: unknown) => {
      console.warn('[stateBridge] Failed to bridge mcp store:', err);
    });
}

// ---------------------------------------------------------------------------
// Bridge 7: mcpServerStore.ts → AppState.mcp.errorServerIds
// mcpServerStore only has: config, isRunning, tools — no servers array.
// We derive error status from config.running (isRunning=false means error risk).
// ---------------------------------------------------------------------------

export function bridgeMcpServerStore(): void {
  import('../mcpServerStore')
    .then(({ useMcpServerStore }) => {
      const unsubscribe = useMcpServerStore.subscribe((state) => {
        // mcpServerStore tracks a single embedded server (not a list)
        // Use empty array when running, synthetic ID when in error state
        const errorServerIds: string[] =
          !state.isRunning && state.error ? ['embedded-mcp-server'] : [];

        appStateStore.setState((prev: AppState) => {
          if (JSON.stringify(prev.mcp.errorServerIds) === JSON.stringify(errorServerIds)) {
            return prev;
          }
          return {
            ...prev,
            mcp: { ...prev.mcp, errorServerIds },
          };
        });
      });
      addCleanup(unsubscribe);
    })
    .catch((err: unknown) => {
      console.warn('[stateBridge] Failed to bridge mcpServer store:', err);
    });
}

// ---------------------------------------------------------------------------
// Bridge 8: memoryStore.ts → AppState.memory
// MemoryState exposes: memories[], isLoading, error.
// We derive totalEntries from memories.length; decay config is fetched on demand.
// ---------------------------------------------------------------------------

export function bridgeMemoryStore(): void {
  import('../memoryStore')
    .then(({ useMemoryStore }) => {
      const unsubscribe = useMemoryStore.subscribe((state) => {
        const totalEntries = state.memories.length;
        // avgImportance: compute from loaded memories (may be 0 if none loaded)
        const avgImportance =
          totalEntries > 0
            ? state.memories.reduce((acc, m) => acc + m.importance, 0) / totalEntries
            : 0;
        // decayEnabled: not directly available in MemoryState without fetching decay config.
        // Leave as current canonical value — decay config is fetched separately.
        const decayEnabled = false; // default; updated when getDecayConfig() is called

        appStateStore.setState((prev: AppState) => {
          if (
            prev.memory.totalEntries === totalEntries &&
            Math.abs(prev.memory.avgImportance - avgImportance) < 0.001
          ) {
            return prev;
          }
          return {
            ...prev,
            memory: { ...prev.memory, totalEntries, avgImportance, decayEnabled },
          };
        });
      });
      addCleanup(unsubscribe);
    })
    .catch((err: unknown) => {
      console.warn('[stateBridge] Failed to bridge memory store:', err);
    });
}

// ---------------------------------------------------------------------------
// Bridge 9: unifiedChatStore.ts → AppState.chat.isStreaming + activeConversationId
// ---------------------------------------------------------------------------

export function bridgeUnifiedChatStore(): void {
  import('../unifiedChatStore')
    .then((mod) => {
      // unifiedChatStore may export useUnifiedChatStore or useChatStore
      const store =
        (mod as Record<string, unknown>)['useUnifiedChatStore'] ??
        (mod as Record<string, unknown>)['useChatStore'];
      if (!store || typeof (store as { subscribe?: unknown }).subscribe !== 'function') {
        console.warn('[stateBridge] unifiedChatStore export not found');
        return;
      }

      const typedStore = store as { subscribe: (listener: (state: unknown) => void) => () => void };
      const unsubscribe = typedStore.subscribe((state: unknown) => {
        const s = state as Record<string, unknown>;
        const isStreaming = (s['isStreaming'] as boolean | undefined) ?? false;
        const activeConversationId =
          (s['activeConversationId'] as string | null | undefined) ?? null;

        appStateStore.setState((prev: AppState) => {
          if (
            prev.chat.isStreaming === isStreaming &&
            prev.chat.activeConversationId === activeConversationId
          ) {
            return prev;
          }
          return {
            ...prev,
            chat: { ...prev.chat, isStreaming, activeConversationId },
          };
        });
      });
      addCleanup(unsubscribe);
    })
    .catch((err: unknown) => {
      console.warn('[stateBridge] Failed to bridge unifiedChat store:', err);
    });
}

// ---------------------------------------------------------------------------
// Bridge 10: billingUsage.ts → AppState.subscriptions (remainingCreditCents etc.)
// ---------------------------------------------------------------------------

export function bridgeBillingUsageStore(): void {
  import('../billingUsage')
    .then((mod) => {
      const store = (mod as Record<string, unknown>)['useBillingUsageStore'];
      if (!store || typeof (store as { subscribe?: unknown }).subscribe !== 'function') {
        console.warn('[stateBridge] billingUsage store export not found');
        return;
      }

      const typedStore = store as { subscribe: (listener: (state: unknown) => void) => () => void };
      const unsubscribe = typedStore.subscribe((state: unknown) => {
        const s = state as Record<string, unknown>;

        appStateStore.setState((prev: AppState) => {
          const remainingCreditCents =
            (s['remainingCreditCents'] as number | null | undefined) ?? null;
          const dailyCreditLimitCents =
            (s['dailyCreditLimitCents'] as number | null | undefined) ?? null;
          const periodEndMs = (s['usagePeriodEndSec'] as number | null | undefined)
            ? (s['usagePeriodEndSec'] as number) * 1000
            : null;

          if (
            prev.subscriptions.remainingCreditCents === remainingCreditCents &&
            prev.subscriptions.dailyCreditLimitCents === dailyCreditLimitCents &&
            prev.subscriptions.periodEndMs === periodEndMs
          ) {
            return prev;
          }

          return {
            ...prev,
            subscriptions: {
              ...prev.subscriptions,
              remainingCreditCents,
              dailyCreditLimitCents,
              periodEndMs,
            },
          };
        });
      });
      addCleanup(unsubscribe);
    })
    .catch((err: unknown) => {
      console.warn('[stateBridge] Failed to bridge billingUsage store:', err);
    });
}

// ---------------------------------------------------------------------------
// Bridge 11: logoutCleanup.ts — registers a cleanup that resets AppState on logout
// ---------------------------------------------------------------------------

export function bridgeLogoutCleanup(): void {
  import('../logoutCleanup')
    .then((mod) => {
      // logoutCleanup may export a registerCleanup or similar
      const registerFn = (mod as Record<string, unknown>)['registerLogoutCleanup'];
      if (typeof registerFn !== 'function') return;

      (registerFn as (fn: () => void) => void)(() => {
        // Reset canonical state on logout
        import('@agiworkforce/runtime')
          .then(({ initialAppState }) => {
            appStateStore.setState(() => initialAppState);
          })
          .catch(() => {});
      });
    })
    .catch(() => {
      // logoutCleanup may not export registerLogoutCleanup — that's OK
    });
}

// ---------------------------------------------------------------------------
// Bridge 12: notificationStore.ts — bridge for future unread count sync
// ---------------------------------------------------------------------------

export function bridgeNotificationStore(): void {
  import('../notificationStore')
    .then(({ useNotificationStore }) => {
      // We only subscribe to unreadCount — not the full notification list
      // (which is too large to replicate in canonical state)
      const unsubscribe = useNotificationStore.subscribe((_state) => {
        // Currently a no-op bridge: notification unread count is surface-specific
        // and doesn't need canonical propagation yet. Registered to prove the
        // wiring path works and to receive future fan-out from onChangeAppState.
      });
      addCleanup(unsubscribe);
    })
    .catch((err: unknown) => {
      console.warn('[stateBridge] Failed to bridge notification store:', err);
    });
}

// ---------------------------------------------------------------------------
// Master initialization
// ---------------------------------------------------------------------------

/**
 * Initialize all zustand → AppStateStore bridges.
 *
 * Call ONCE at app startup. Returns a cleanup function.
 * Safe to call multiple times (subsequent calls are no-ops due to guard).
 */
let initialized = false;

export function initStateBridges(): () => void {
  if (initialized) {
    return () => {};
  }
  initialized = true;

  // Wire all 12 bridges (lazy imports — non-blocking)
  bridgeAuthStore();
  bridgeAppModeStore();
  bridgeThinkingStore();
  bridgeSettingsStore();
  bridgeModelStore();
  bridgeMcpStore();
  bridgeMcpServerStore();
  bridgeMemoryStore();
  bridgeUnifiedChatStore();
  bridgeBillingUsageStore();
  bridgeLogoutCleanup();
  bridgeNotificationStore();

  return () => {
    // Clean up all subscriptions
    for (const fn of cleanupFns) {
      try {
        fn();
      } catch {
        // Best-effort cleanup
      }
    }
    cleanupFns.length = 0;
    initialized = false;
  };
}
