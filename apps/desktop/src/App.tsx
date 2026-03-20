import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isTauri, invoke, listen } from './lib/tauri-mock';
import { VoiceInputOverlay } from './components/Voice/VoiceInputOverlay';
import { useVoiceHotkey } from './hooks/useVoiceHotkey';
import { API_BASE_URL } from './api/client';

import { CommandPalette, type CommandOption } from './components/UnifiedAgenticChat/CommandPalette';
import { SearchModal } from './components/UnifiedAgenticChat/SearchModal';
import { useSearchModal } from './hooks/useSearchModal';
import { QuickQuery } from './components/QuickQuery';
import { useThemeContext } from './providers/ThemeProvider';
import { useWindowManager } from './hooks/useWindowManager';
import {
  initializeAgentStatusListener,
  initializeToolEventListener,
  useUnifiedChatStore,
  uuidToDbId,
} from './stores/unifiedChatStore';
import { useDeepLink } from './hooks/useDeepLink';
import {
  TimeoutWarningDialog,
  type TimeoutWarningData,
} from './components/Execution/TimeoutWarningDialog';

import {
  AlertTriangle,
  CircleUserRound,
  Maximize2,
  Minimize2,
  Moon,
  Plus,
  RefreshCcw,
  Sun,
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorHandling';
import ErrorToastContainer from './components/Errors/ErrorToast';
import { Spinner } from './components/ui/Spinner';
import { TooltipProvider } from './components/ui/Tooltip';
import { errorReportingService } from './services/errorReporting';
import { useAuthStore, useAccountStore } from './stores/auth';
import { initializeAuthOrchestrator } from './stores/authOrchestrator';
import useErrorStore, { useSimpleModeStore, selectOnboardingCompleted } from './stores/ui';
import { useSettingsDialogStore } from './stores/settingsDialogStore';
import { useSettingsStore } from './stores/settingsStore';
import { OnboardingWelcome } from './components/Onboarding';

const VisualizationLayer = lazy(() =>
  import('./components/Overlay/VisualizationLayer').then((m) => ({
    default: m.VisualizationLayer,
  })),
);
const FloatingChat = lazy(() =>
  import('./components/FloatingChat').then((m) => ({
    default: m.FloatingChat,
  })),
);
const AuthPage = lazy(() =>
  import('./components/Auth/AuthPage').then((m) => ({
    default: m.AuthPage,
  })),
);
const SettingsPanel = lazy(() =>
  import('./components/Settings/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
);
const UnifiedAgenticChat = lazy(() =>
  import('./components/UnifiedAgenticChat').then((m) => ({
    default: m.UnifiedAgenticChat,
  })),
);
import { UpdateChecker } from './components/Updates';
import { AutomationPermissionsModal } from './components/Settings/AutomationPermissionsModal';
import { StatusBanner } from './components/StatusBanner';
import { OfflineIndicator } from './components/OfflineIndicator';
import { useSessionPersistence } from './hooks/useSessionPersistence';
import { initializeSyncManager, cleanupSyncManager } from './lib/offline/offlineSync';

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full w-full">
    <div className="flex flex-col items-center gap-3">
      <Spinner size="lg" className="text-primary" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
);

const DesktopShell = () => {
  const { state, actions } = useWindowManager();
  useVoiceHotkey();
  const { restoreSession } = useSessionPersistence();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const settingsPanelOpen = useSettingsDialogStore((s) => s.settingsOpen);
  const settingsInitialTab = useSettingsDialogStore((s) => s.settingsInitialTab);
  const openSettingsDialog = useSettingsDialogStore((s) => s.openSettings);
  const closeSettingsDialog = useSettingsDialogStore((s) => s.closeSettings);
  const [quickQueryOpen, setQuickQueryOpen] = useState(false);
  const [timeoutWarning, setTimeoutWarning] = useState<TimeoutWarningData | null>(null);
  const [isTimeoutWarningOpen, setIsTimeoutWarningOpen] = useState(false);
  const [subscriptionFetchFailed, setSubscriptionFetchFailed] = useState(false);
  const { theme, setTheme } = useThemeContext();

  // Onboarding state - show welcome flow on first launch
  const onboardingCompleted = useSimpleModeStore(selectOnboardingCompleted);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Show onboarding after auth is resolved and only if not completed
  useEffect(() => {
    if (!onboardingCompleted) {
      setShowOnboarding(true);
    }
  }, [onboardingCompleted]);

  // Apply dyslexic font class from persisted settings on mount
  const dyslexicFont = useSettingsStore((s) => s.windowPreferences?.dyslexicFont ?? false);
  useEffect(() => {
    if (dyslexicFont) {
      document.documentElement.classList.add('dyslexic-font');
    } else {
      document.documentElement.classList.remove('dyslexic-font');
    }
  }, [dyslexicFont]);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  }, [theme, setTheme]);

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const subscriptionFetchStatus = useAccountStore((state) => state.subscriptionFetchStatus);

  // Track when subscription fetch fails so we can show the degraded-state banner
  useEffect(() => {
    if (subscriptionFetchStatus === 'failed') {
      setSubscriptionFetchFailed(true);
    } else if (subscriptionFetchStatus === 'succeeded') {
      setSubscriptionFetchFailed(false);
    }
  }, [subscriptionFetchStatus]);

  const clearHistory = useUnifiedChatStore((store) => store.clearHistory);
  const ensureActiveConversation = useUnifiedChatStore((store) => store.ensureActiveConversation);
  const addError = useErrorStore((store) => store.addError);

  const isMac =
    typeof navigator !== 'undefined' &&
    /mac/i.test(
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
        ?.platform ??
        navigator.platform ??
        '',
    );

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();

      const error = event.reason;
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      // Suppress known Tauri internal errors that occur during event cleanup
      if (message.includes('listeners[eventId]')) {
        console.debug('[Tauri] Suppressed internal event cleanup error');
        return; // Don't show error dialog for this known issue
      }

      addError({
        type: 'UNHANDLED_PROMISE_REJECTION',
        severity: 'error',
        message: `Unhandled promise rejection: ${message}`,
        stack,
        context: {
          promise: event.promise,
        },
      });
    };

    const handleWindowError = (event: ErrorEvent) => {
      event.preventDefault();

      addError({
        type: 'WINDOW_ERROR',
        severity: 'error',
        message: event.message,
        details: `${event.filename}:${event.lineno}:${event.colno}`,
        stack: event.error?.stack,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleWindowError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleWindowError);
    };
  }, [addError]);

  useEffect(() => {
    const trackAction = (action: string) => {
      errorReportingService.trackAction(action);
    };

    // Ref to store cleanup functions from async initialization
    const cleanupFns: Array<() => void | Promise<void>> = [];
    let disposed = false;

    const registerCleanup = (cleanup: () => void | Promise<void>) => {
      if (disposed) {
        try {
          cleanup();
        } catch (error) {
          console.warn('[App] Deferred cleanup function failed:', error);
        }
        return;
      }

      cleanupFns.push(cleanup);
    };

    const reportStartupFailure = (step: string, error: unknown, notify = false) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[App] ${step} failed:`, error);

      if (!notify) {
        return;
      }

      addError({
        type: 'APP_STARTUP_ERROR',
        severity: 'warning',
        message: `${step} failed during app startup`,
        details: message,
        context: {
          step,
        },
      });
    };

    const runStartupStep = async (
      step: string,
      task: () => Promise<void>,
      options?: { notify?: boolean },
    ) => {
      if (disposed) return;
      try {
        await task();
      } catch (error) {
        if (!disposed) {
          reportStartupFailure(step, error, options?.notify === true);
        }
      }
    };

    trackAction('app_loaded');

    void runStartupStep('Sync manager', async () => {
      initializeSyncManager();
    });
    registerCleanup(() => cleanupSyncManager());

    void runStartupStep('Agent status listener', () => initializeAgentStatusListener());
    void runStartupStep('Tool event listener', () => initializeToolEventListener());

    // Wire up mcpb:install_progress Tauri event into the MCPB store
    void (async () => {
      try {
        const { initializeMcpbInstallListener } = await import('./stores/mcpbStore');
        await runStartupStep('MCP bundle install listener', () => initializeMcpbInstallListener());
      } catch (error) {
        if (!disposed) {
          reportStartupFailure('MCP bundle install listener', error);
        }
      }
    })();

    void (async () => {
      try {
        // Wait for settings store hydration from localStorage before loading from backend
        const { useSettingsStore, waitForSettingsHydration } =
          await import('./stores/settingsStore');
        await runStartupStep('Settings hydration', () => waitForSettingsHydration());
        if (disposed) return;

        // Initialize settings (syncs with backend and configures providers)
        await runStartupStep(
          'Settings synchronization',
          () => useSettingsStore.getState().loadSettings(),
          { notify: true },
        );

        // Apply window preferences on startup (dock/position)
        if (isTauri) {
          await runStartupStep('Window preference restore', async () => {
            const settings = useSettingsStore.getState();
            const prefs = settings.windowPreferences;

            // Dock takes precedence over centering.
            if (prefs?.dockOnStartup === 'left' || prefs?.dockOnStartup === 'right') {
              await invoke('window_dock', { position: prefs.dockOnStartup });
            } else if (prefs?.startupPosition === 'center') {
              const { getCurrentWindow } = await import('@tauri-apps/api/window');
              const win = getCurrentWindow();
              // Small delay so any window-state restore has already run.
              const timeoutId = window.setTimeout(() => {
                if (disposed) return;
                void win.center().catch((error) => {
                  if (!disposed) {
                    reportStartupFailure('Window centering', error);
                  }
                });
              }, 50);
              registerCleanup(() => window.clearTimeout(timeoutId));
            }
          });
        }

        // Restore selected theme on startup
        await runStartupStep('Theme restore', async () => {
          const settings = useSettingsStore.getState();
          const themeId = settings.windowPreferences?.selectedTheme;
          if (themeId) {
            const { getThemeById, applyTheme } = await import('./themes/index');
            const theme = getThemeById(themeId);
            if (theme) applyTheme(theme);
          }
        });

        if (disposed) return;
        const { initializeModelStoreFromSettings } = await import('./stores/modelStore');
        await runStartupStep('Model initialization', () => initializeModelStoreFromSettings(), {
          notify: true,
        });
        if (disposed) return;

        // Initialize Ollama health service for graceful degradation of local models
        if (isTauri) {
          await runStartupStep('Ollama health monitor', async () => {
            const { initializeOllamaHealthService } =
              await import('./services/ollamaHealthService');
            const cleanup = initializeOllamaHealthService();
            registerCleanup(cleanup);
          });
        }

        if (disposed) return;
        // Load custom instructions from backend (syncs with stored data)
        const { useCustomInstructionsStore } = await import('./stores/customInstructionsStore');
        await runStartupStep('Custom instructions sync', async () => {
          await useCustomInstructionsStore.getState().loadFromBackend();
        });
        if (disposed) return;

        // Sync access token to keyring if user is already authenticated
        if (isTauri) {
          await runStartupStep(
            'Managed cloud credential sync',
            async () => {
              const { supabaseAuth } = await import('./services/supabaseAuth');
              const { waitForAuthReady } = await import('./stores/auth');

              // Ensure Rust uses the same backend base URL as the UI (critical in local dev).
              await invoke('account_store_api_base_url', { apiBaseUrl: API_BASE_URL });
              if (disposed) return;

              // Wait for auth state to be ready before accessing session data
              // This prevents race conditions where we read stale/empty state
              await waitForAuthReady();
              if (disposed) return;

              const authState = supabaseAuth.getState();
              if (!authState.session?.access_token || disposed) {
                return;
              }

              await invoke('account_store_access_token', {
                accessToken: authState.session.access_token,
              });
              if (disposed) return;
              if (authState.session.refresh_token) {
                await invoke('account_store_refresh_token', {
                  refreshToken: authState.session.refresh_token,
                });
              }
              if (disposed) return;
              await invoke('llm_ensure_managed_cloud');

              // Start surface heartbeat — fires immediately then every 60 s
              if (!disposed) {
                const { startDesktopHeartbeat } = await import('./services/heartbeat');
                const userId = supabaseAuth.getState().user?.id;
                if (userId) {
                  const stopHeartbeat = startDesktopHeartbeat(userId);
                  registerCleanup(stopHeartbeat);
                }
              }
            },
            { notify: true },
          );
        }
      } catch (error) {
        if (!disposed) {
          reportStartupFailure('Desktop shell startup', error, true);
        }
      }
    })();

    return () => {
      disposed = true;
      void errorReportingService.flush();
      // Call all cleanup functions from async initialization
      cleanupFns.forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          console.warn('[App] Cleanup function failed:', error);
        }
      });
    };
  }, [addError]);

  // Run once on mount - restore persisted session, then ensure active conversation
  useEffect(() => {
    restoreSession();
    ensureActiveConversation();
  }, [restoreSession, ensureActiveConversation]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key?.toLowerCase();
      if (!key) return; // Guard against undefined event.key
      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault();
        // Cmd+K opens the unified Spotlight Search modal
        useSearchModal.getState().toggle();
      }
      // Cmd+Shift+K retains the command palette for system commands
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === 'k') {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Double-tap Alt to open Quick Query overlay
  const lastAltKeyupAtRef = useRef<number>(0);
  useEffect(() => {
    const DOUBLE_TAP_THRESHOLD_MS = 300;

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Alt') return;
      const now = Date.now();
      const elapsed = now - lastAltKeyupAtRef.current;
      lastAltKeyupAtRef.current = now;
      if (elapsed > 0 && elapsed < DOUBLE_TAP_THRESHOLD_MS) {
        setQuickQueryOpen((prev) => !prev);
      }
    };

    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Listen for timeout warning events from Tauri backend
  useEffect(() => {
    if (!isTauri) return;

    let isMounted = true;
    let unlistenFn: (() => void) | null = null;

    const setupTimeoutListener = async () => {
      try {
        const unlisten = await listen<TimeoutWarningData>('agi:timeout_warning', (event) => {
          if (!isMounted) return;

          const warningData = event.payload;
          console.debug('[App] Received timeout warning:', warningData);

          setTimeoutWarning(warningData);
          setIsTimeoutWarningOpen(true);
        });

        if (isMounted) {
          unlistenFn = unlisten;
        } else {
          unlisten();
        }
      } catch (error) {
        console.error('[App] Failed to setup timeout warning listener:', error);
      }
    };

    void setupTimeoutListener();

    return () => {
      isMounted = false;
      if (unlistenFn) {
        unlistenFn();
        unlistenFn = null;
      }
    };
  }, []);

  const startNewChat = useCallback(async () => {
    clearHistory();
  }, [clearHistory]);

  // Listen for global hotkey (Cmd+Shift+Space / Ctrl+Shift+Space) to open Quick Query overlay
  useEffect(() => {
    if (!isTauri) return;

    let isMounted = true;
    let unlistenFn: (() => void) | null = null;

    const setupHotkeyListener = async () => {
      try {
        const unlisten = await listen<string>('global-hotkey-triggered', () => {
          if (!isMounted) return;
          if (!useSettingsStore.getState().globalHotkeyPreferences.enabled) {
            return;
          }
          setQuickQueryOpen(true);
        });

        if (isMounted) {
          unlistenFn = unlisten;
        } else {
          unlisten();
        }
      } catch (error) {
        console.error('[App] Failed to setup global hotkey listener:', error);
      }
    };

    void setupHotkeyListener();

    return () => {
      isMounted = false;
      if (unlistenFn) {
        unlistenFn();
        unlistenFn = null;
      }
    };
  }, []);

  // Handle Quick Query submission: add user message and route to main chat
  const handleQuickQuerySubmit = useCallback(
    (query: string, model: string) => {
      // Ensure there's an active conversation, then add the user message
      ensureActiveConversation();

      // Import dynamically to avoid circular dependency
      void (async () => {
        try {
          const { useModelStore } = await import('./stores/modelStore');
          const { useChatStore } = await import('./stores/chat/chatStore');

          const { selectedModel, selectedProvider, selectModel } = useModelStore.getState();
          if (model && (selectedModel !== model || selectedProvider !== 'managed_cloud')) {
            await selectModel(model, 'managed_cloud');
          }

          if (isTauri) {
            const activeConversationId = useUnifiedChatStore.getState().activeConversationId;
            const conversationDbId = activeConversationId ? uuidToDbId(activeConversationId) : null;
            await invoke('chat_add_pending_message', {
              request: {
                content: query,
                conversationId: conversationDbId,
              },
            });
            return;
          }

          useChatStore.getState().addPendingMessage({
            id: crypto.randomUUID(),
            content: query,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          console.error('[QuickQuery] Failed to submit message:', error);
          addError({
            type: 'QUICK_QUERY_ERROR',
            severity: 'warning',
            message: 'Quick Query failed to queue your message',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      })();
    },
    [ensureActiveConversation, addError],
  );

  // Listen for global shortcut actions
  useEffect(() => {
    if (!isTauri) return;

    let isMounted = true;
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      try {
        const unlisten = await listen<string>('shortcut_action', (event) => {
          if (!isMounted) return; // Guard against unmounted callbacks
          const action = event.payload;
          switch (action) {
            case 'floating_window':
              void invoke('window_toggle_floating').catch((err) => {
                console.error('Failed to toggle floating window:', err);
              });
              break;
            case 'new_composer':
              void startNewChat();
              break;
            case 'open_chat':
              setCommandPaletteOpen(true);
              break;
            case 'quick_query':
              // Handled by dedicated `global-hotkey-triggered` listener to avoid duplicate opens.
              break;
            case 'voice_input':
              // Handle voice input
              break;
            case 'quick_capture':
              // Handle quick capture
              break;
          }
        });

        // Only store unlisten if we're still mounted
        if (isMounted) {
          unlistenFn = unlisten;
        } else {
          // Component unmounted while setting up - cleanup immediately
          unlisten();
        }
      } catch (error) {
        console.error('[App] Failed to setup shortcut listener:', error);
      }
    };

    void setupListener();

    return () => {
      isMounted = false;
      if (unlistenFn) {
        unlistenFn();
        unlistenFn = null;
      }
    };
  }, [startNewChat]);

  const openSettings = useCallback(() => openSettingsDialog(), [openSettingsDialog]);

  const handleDismissTimeoutWarning = useCallback(() => {
    setIsTimeoutWarningOpen(false);
    setTimeoutWarning(null);
  }, []);

  const commandOptions = useMemo(() => {
    const buildOption = (definition: {
      id: string;
      title: string;
      group: string;
      action: () => void;
      icon?: CommandOption['icon'];
      subtitle?: string;
      shortcut?: string;
      active?: boolean;
    }): CommandOption => ({
      id: definition.id,
      title: definition.title,
      group: definition.group,
      action: definition.action,
      icon: definition.icon,
      subtitle: definition.subtitle,
      shortcut: definition.shortcut,
      active: definition.active,
    });

    return [
      buildOption({
        id: 'chat.new',
        title: 'Start new chat',
        group: 'Chat',
        icon: Plus,
        action: () => void startNewChat(),
      }),
      buildOption({
        id: 'app.open-settings',
        title: 'Open settings',
        group: 'Navigation',
        icon: CircleUserRound,
        action: openSettings,
      }),
      buildOption({
        id: 'appearance.toggle-theme',
        title: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        group: 'Appearance',
        icon: theme === 'dark' ? Sun : Moon,
        action: () => toggleTheme(),
        shortcut: isMac ? 'Cmd+Shift+L' : 'Ctrl+Shift+L',
      }),
      buildOption({
        id: 'window.refresh',
        title: 'Refresh window state',
        group: 'Window',
        icon: RefreshCcw,
        action: () => void actions.refresh(),
      }),
      buildOption({
        id: 'window.minimize',
        title: 'Minimize window',
        group: 'Window',
        icon: Minimize2,
        action: () => void actions.minimize(),
      }),
      buildOption({
        id: 'window.maximize',
        title: state.maximized ? 'Restore window' : 'Maximize window',
        group: 'Window',
        icon: Maximize2,
        action: () => void actions.toggleMaximize(),
        active: state.maximized,
      }),
    ];
  }, [actions, openSettings, startNewChat, state.maximized, theme, toggleTheme, isMac]);

  if (isAuthLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        {/* Skeleton layout — avoids raw spinner, matches the app's shell shape */}
        <div className="flex w-full max-w-sm flex-col items-center gap-4 px-6">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-zinc-800" />
          <div className="h-4 w-32 animate-pulse rounded bg-zinc-800" />
          <div className="h-3 w-48 animate-pulse rounded bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <AuthPage />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-base text-foreground font-sans">
        {!isTauri && import.meta.env.DEV && (
          <div className="bg-amber-500/20 border-b border-amber-500/50 px-4 py-2 text-center text-sm text-amber-200">
            <strong>Web Development Mode</strong> - Running without Tauri. Some features are mocked.
          </div>
        )}
        <VoiceInputOverlay />
        {showOnboarding && !onboardingCompleted && (
          <OnboardingWelcome onComplete={() => setShowOnboarding(false)} />
        )}
        <div className="flex flex-col gap-1">
          <StatusBanner />
          <OfflineIndicator position="top" />
          {subscriptionFetchFailed && (
            <div className="bg-amber-500/15 border-b border-amber-500/40 px-4 py-2 flex items-center justify-between text-sm text-amber-300">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span>Using cached account data. Subscription status may be outdated.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSubscriptionFetchFailed(false);
                  void useAccountStore
                    .getState()
                    .syncWithBackend?.()
                    ?.catch(() => {
                      setSubscriptionFetchFailed(true);
                    });
                }}
                className="text-amber-200 underline hover:text-amber-100 text-xs"
              >
                Retry
              </button>
            </div>
          )}
        </div>
        <main className="flex flex-1 min-h-0 min-w-0 bg-surface-base">
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary
              fallback={
                <div className="flex h-full w-full items-center justify-center bg-surface-base">
                  <div className="text-center">
                    <p className="mb-4 text-lg font-semibold text-foreground">
                      Chat interface encountered an error
                    </p>
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="rounded bg-primary px-4 py-2 text-white hover:bg-primary/90"
                    >
                      Reload Application
                    </button>
                  </div>
                </div>
              }
            >
              <Suspense fallback={<LoadingFallback />}>
                <UnifiedAgenticChat
                  className="h-full w-full"
                  layout="default"
                  defaultSidecarOpen={false}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
        <SearchModal />
        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          commands={commandOptions}
        />
        <Suspense fallback={null}>
          <SettingsPanel
            open={settingsPanelOpen}
            onOpenChange={(v) => (v ? openSettingsDialog() : closeSettingsDialog())}
            initialTab={settingsInitialTab}
          />
        </Suspense>
        <UpdateChecker onUpdateNow={openSettings} />
        <AutomationPermissionsModal />
        <ErrorToastContainer position="top-right" />
        <TimeoutWarningDialog
          warning={timeoutWarning}
          onDismiss={handleDismissTimeoutWarning}
          isOpen={isTimeoutWarningOpen}
        />
        <QuickQuery
          open={quickQueryOpen}
          onClose={() => setQuickQueryOpen(false)}
          onSubmit={handleQuickQuerySubmit}
        />
      </div>
    </Suspense>
  );
};

const App = () => {
  const { i18n } = useTranslation();

  // Set document direction for RTL language support (Arabic)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
  }, [i18n.language]);

  useEffect(() => {
    // Single consolidated auth orchestrator - replaces individual store initializers
    // This prevents race conditions from multiple auth listeners firing simultaneously
    const unsubscribeOrchestrator = initializeAuthOrchestrator();

    // Force sync account data after store hydration is complete
    let cancelled = false;
    void (async () => {
      try {
        const { useAccountStore, waitForHydration } = await import('./stores/auth');
        const { supabaseAuth } = await import('./services/supabaseAuth');
        if (cancelled) return;

        // Wait for store hydration from localStorage before syncing
        await waitForHydration();
        if (cancelled) return;

        if (supabaseAuth.isAuthenticated()) {
          console.debug('[App] Store hydrated, forcing account sync with backend...');
          await useAccountStore.getState().syncWithBackend();
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[App] Auth orchestrator bootstrap failed:', error);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeOrchestrator();
    };
  }, []);

  useDeepLink();

  const windowMode = (() => {
    if (typeof window === 'undefined') return 'default';

    try {
      // Check URL path first (for Tauri windows)
      const pathname = window.location.pathname;
      if (pathname === '/floating') return 'floating';
      if (pathname === '/overlay') return 'overlay';

      // Fallback to query params
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode');

      if (mode === 'overlay') return 'overlay';
      if (mode === 'floating') return 'floating';
      return 'default';
    } catch {
      return 'default';
    }
  })();

  const renderContent = () => {
    switch (windowMode) {
      case 'overlay':
        return <VisualizationLayer />;
      case 'floating':
        return <FloatingChat />;
      default:
        return <DesktopShell />;
    }
  };

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.body.dataset['windowMode'] = windowMode;
    const root = document.getElementById('root');
    if (root) {
      root.dataset['windowMode'] = windowMode;
    }

    return () => {
      delete document.body.dataset['windowMode'];
      if (root) {
        delete root.dataset['windowMode'];
      }
    };
  }, [windowMode]);

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        <Suspense fallback={<LoadingFallback />}>{renderContent()}</Suspense>
      </TooltipProvider>
    </ErrorBoundary>
  );
};

export default App;
