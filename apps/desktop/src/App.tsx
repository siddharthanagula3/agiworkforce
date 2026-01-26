import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { isTauri, invoke, listen } from './lib/tauri-mock';
import { API_BASE_URL } from './api/client';

import CommandPalette, { type CommandOption } from './components/Layout/CommandPalette';
import { useThemeContext } from './providers/ThemeProvider';
import { useWindowManager } from './hooks/useWindowManager';
import { initializeAgentStatusListener, useUnifiedChatStore } from './stores/unifiedChatStore';
import { useDeepLink } from './hooks/useDeepLink';

import { CircleUserRound, Maximize2, Minimize2, Moon, Plus, RefreshCcw, Sun } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorHandling';
import ErrorToastContainer from './components/Errors/ErrorToast';
import { Spinner } from './components/ui/Spinner';
import { TooltipProvider } from './components/ui/Tooltip';
import { errorReportingService } from './services/errorReporting';
import { useAuthStore } from './stores/auth';
import { initializeAuthOrchestrator } from './stores/authOrchestrator';
import useErrorStore from './stores/errorStore';

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
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const { theme, setTheme } = useThemeContext();

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  }, [theme, setTheme]);

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const clearHistory = useUnifiedChatStore((store) => store.clearHistory);
  const ensureActiveConversation = useUnifiedChatStore((store) => store.ensureActiveConversation);
  const addError = useErrorStore((store) => store.addError);

  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();

      const error = event.reason;
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

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

    trackAction('app_loaded');

    void initializeAgentStatusListener();

    void (async () => {
      // Wait for settings store hydration from localStorage before loading from backend
      const { useSettingsStore, waitForSettingsHydration } = await import('./stores/settingsStore');
      await waitForSettingsHydration();

      // Initialize settings (syncs with backend and configures providers)
      await useSettingsStore.getState().loadSettings();

      // Apply window preferences on startup (dock/position)
      if (isTauri) {
        try {
          const settings = useSettingsStore.getState();
          const prefs = settings.windowPreferences;

          // Dock takes precedence over centering.
          if (prefs?.dockOnStartup === 'left' || prefs?.dockOnStartup === 'right') {
            await invoke('window_dock', { position: prefs.dockOnStartup });
          } else if (prefs?.startupPosition === 'center') {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            const win = getCurrentWindow();
            // Small delay so any window-state restore has already run.
            setTimeout(() => {
              void win.center();
            }, 50);
          }
        } catch (error) {
          console.warn('[App] Failed to apply window preferences on startup:', error);
        }
      }

      const { initializeModelStoreFromSettings } = await import('./stores/modelStore');
      await initializeModelStoreFromSettings();

      // Initialize Ollama health service for graceful degradation of local models
      if (isTauri) {
        const { initializeOllamaHealthService } = await import('./services/ollamaHealthService');
        initializeOllamaHealthService();
      }

      // Load custom instructions from backend (syncs with stored data)
      const { useCustomInstructionsStore } = await import('./stores/customInstructionsStore');
      await useCustomInstructionsStore.getState().loadFromBackend();

      // Sync access token to keyring if user is already authenticated
      if (isTauri) {
        try {
          const { supabaseAuth } = await import('./services/supabaseAuth');
          const { waitForAuthReady } = await import('./stores/auth');
          const { invoke } = await import('@tauri-apps/api/core');

          // Ensure Rust uses the same backend base URL as the UI (critical in local dev).
          await invoke('account_store_api_base_url', { apiBaseUrl: API_BASE_URL });

          // Wait for auth state to be ready before accessing session data
          // This prevents race conditions where we read stale/empty state
          await waitForAuthReady();

          const authState = supabaseAuth.getState();
          if (authState.session?.access_token) {
            await invoke('account_store_access_token', {
              accessToken: authState.session.access_token,
            });
            if (authState.session.refresh_token) {
              await invoke('account_store_refresh_token', {
                refreshToken: authState.session.refresh_token,
              });
            }
            await invoke('llm_ensure_managed_cloud');
          }
        } catch (error) {
          console.warn('[App] Failed to sync access token on startup:', error);
        }
      }
    })();

    return () => {
      void errorReportingService.flush();
    };
  }, []);

  // Run once on mount - ensureActiveConversation is a stable store function
  useEffect(() => {
    ensureActiveConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key?.toLowerCase();
      if (!key) return; // Guard against undefined event.key
      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const startNewChat = useCallback(async () => {
    clearHistory();
  }, [clearHistory]);

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
              void invoke('window_toggle_floating');
              break;
            case 'new_composer':
              void startNewChat();
              break;
            case 'open_chat':
              setCommandPaletteOpen(true);
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

  const openSettings = useCallback(() => setSettingsPanelOpen(true), []);

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
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-zinc-400">Loading...</p>
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
        {!isTauri && (
          <div className="bg-amber-500/20 border-b border-amber-500/50 px-4 py-2 text-center text-sm text-amber-200">
            <strong>Web Development Mode</strong> - Running without Tauri. Some features are mocked.
          </div>
        )}
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
                  onOpenSettings={() => setSettingsPanelOpen(true)}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          options={commandOptions}
        />
        <Suspense fallback={null}>
          <SettingsPanel open={settingsPanelOpen} onOpenChange={setSettingsPanelOpen} />
        </Suspense>
        <UpdateChecker onUpdateNow={openSettings} />
        <ErrorToastContainer position="top-right" />
      </div>
    </Suspense>
  );
};

const App = () => {
  useEffect(() => {
    // Single consolidated auth orchestrator - replaces individual store initializers
    // This prevents race conditions from multiple auth listeners firing simultaneously
    const unsubscribeOrchestrator = initializeAuthOrchestrator();

    // Force sync account data after store hydration is complete
    let cancelled = false;
    (async () => {
      const { useAccountStore, waitForHydration } = await import('./stores/accountStore');
      const { supabaseAuth } = await import('./services/supabaseAuth');

      // Wait for store hydration from localStorage before syncing
      await waitForHydration();

      if (cancelled) return;

      if (supabaseAuth.isAuthenticated()) {
        console.log('[App] Store hydrated, forcing account sync with backend...');
        await useAccountStore.getState().syncWithBackend();
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

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        <Suspense fallback={<LoadingFallback />}>{renderContent()}</Suspense>
      </TooltipProvider>
    </ErrorBoundary>
  );
};

export default App;
