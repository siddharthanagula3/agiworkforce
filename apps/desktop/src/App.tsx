import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatHostBridge } from '@agiworkforce/unified-chat';
import { isTauri, invoke, listen } from './lib/tauri-mock';
import { toast } from 'sonner';
import { useVoiceHotkey } from './hooks/useVoiceHotkey';
import { API_BASE_URL } from './api/client';
import { initializeAgentTaskEventListeners } from './stores/agentTaskStore';
import {
  cleanupAgentWorkflowEventListeners,
  initializeAgentWorkflowEventListeners,
} from './stores/chat/agentWorkflowEvents';
import {
  cleanupExecutionListeners,
  initializeExecutionGoalSubscription,
  initializeExecutionListeners,
} from './stores/executionStore';
import {
  cleanupRuntimeActivityEventListeners,
  initializeRuntimeActivityEventListeners,
} from './hooks/useAgenticEvents';

import { useChatStore as useDesktopChatStore } from './stores/chat/chatStore';
import { TauriRuntime } from './runtime/TauriRuntime';
import { WebRuntime } from './runtime/WebRuntime';
import type { CommandOption } from './components/UnifiedAgenticChat/CommandPalette';
import { useSearchModal } from './hooks/useSearchModal';
import { useThemeContext } from './providers/ThemeProvider';
import { useWindowManager } from './hooks/useWindowManager';
import {
  cleanupBackgroundTaskEventListeners,
  dbIdToUuid,
  initializeBackgroundTaskEventListeners,
  initializeAgentStatusListener,
  initializeToolEventListener,
  useUnifiedChatStore,
  uuidToDbId,
} from './stores/unifiedChatStore';
import { useDeepLink } from './hooks/useDeepLink';
import { useTierBridge } from './hooks/useTierBridge';
import type { TimeoutWarningData } from './components/Execution/TimeoutWarningDialog';

import {
  AlertTriangle,
  Bot,
  CircleUserRound,
  Maximize2,
  Minimize2,
  Moon,
  Plus,
  RefreshCcw,
  Sun,
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorHandling';
import { TooltipProvider } from './components/ui/Tooltip';
import { getModelMetadata, getProviderDefaultModel } from './constants/llm';
import { errorReportingService } from './services/errorReporting';
import { initializeWebAuth, supabaseAuth } from './services/supabaseAuth';
import {
  useAuthStore,
  useAccountStore,
  useBillingStore,
  waitForAuthReady,
  waitForHydration,
} from './stores/auth';
import { initializeAuthOrchestrator } from './stores/authOrchestrator';
import { initializeModelStoreFromSettings, useModelStore } from './stores/modelStore';
import useErrorStore, { useSimpleModeStore, selectOnboardingCompleted } from './stores/ui';
import { useAppModeStore } from './stores/appModeStore';
import { useSettingsDialogStore } from './stores/settingsStore';
import { useSettingsStore, waitForSettingsHydration } from './stores/settingsStore';
import { useVoiceInputStore } from './stores/settingsStore';
import { applyTheme, getThemeById } from './themes/index';

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
const ChatInterface = lazy(() =>
  import('@agiworkforce/unified-chat').then((m) => ({
    default: m.ChatInterface,
  })),
);
const SearchModal = lazy(() =>
  import('./components/UnifiedAgenticChat/SearchModal').then((m) => ({
    default: m.SearchModal,
  })),
);
const CommandPalette = lazy(() =>
  import('./components/UnifiedAgenticChat/CommandPalette').then((m) => ({
    default: m.CommandPalette,
  })),
);
const QuickQuery = lazy(() =>
  import('./components/QuickQuery').then((m) => ({
    default: m.QuickQuery,
  })),
);
const VoiceInputOverlay = lazy(() =>
  import('./components/Voice/VoiceInputOverlay').then((m) => ({
    default: m.VoiceInputOverlay,
  })),
);
const OnboardingWelcome = lazy(() =>
  import('./components/Onboarding').then((m) => ({
    default: m.OnboardingWelcome,
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
const UpdateChecker = lazy(() =>
  import('./components/Updates').then((m) => ({
    default: m.UpdateChecker,
  })),
);
const AutomationPermissionsModal = lazy(() =>
  import('./components/Settings/AutomationPermissionsModal').then((m) => ({
    default: m.AutomationPermissionsModal,
  })),
);
const TimeoutWarningDialog = lazy(() =>
  import('./components/Execution/TimeoutWarningDialog').then((m) => ({
    default: m.TimeoutWarningDialog,
  })),
);
const StatusBanner = lazy(() =>
  import('./components/StatusBanner').then((m) => ({
    default: m.StatusBanner,
  })),
);
const OfflineIndicator = lazy(() =>
  import('./components/OfflineIndicator').then((m) => ({
    default: m.OfflineIndicator,
  })),
);
const ErrorToastContainer = lazy(() =>
  import('./components/Errors/ErrorToast').then((m) => ({
    default: m.default,
  })),
);
import { useSessionPersistence } from './hooks/useSessionPersistence';
import { initializeSyncManager, cleanupSyncManager } from './lib/offline/offlineSync';
import { CHAT_COMPOSER_CAPTURE_EVENT } from './lib/chatComposerEvents';
import type { CaptureResult } from './types/capture';
import { PlansModal } from './components/Pricing/PlansModal';

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full w-full bg-background">
    <div className="animate-pulse flex flex-col items-center gap-4">
      <Bot className="h-12 w-12 text-blue-500" />
      <span className="text-2xl font-bold tracking-tighter text-foreground">AGI Workforce</span>
      <span className="text-sm text-muted-foreground">Loading your workspace...</span>
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
  const [plansModalOpen, setPlansModalOpen] = useState(false);
  const [timeoutWarning, setTimeoutWarning] = useState<TimeoutWarningData | null>(null);
  const [isTimeoutWarningOpen, setIsTimeoutWarningOpen] = useState(false);
  const [subscriptionFetchFailed, setSubscriptionFetchFailed] = useState(false);
  const isSearchModalOpen = useSearchModal((state) => state.isOpen);
  const { theme, setTheme } = useThemeContext();

  // Onboarding state - show mode picker only on first-ever launch
  const onboardingCompleted = useSimpleModeStore(selectOnboardingCompleted);
  const hasSelectedMode = useAppModeStore((s) => s.hasSelectedMode);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Show mode picker only when neither onboarding nor mode selection has been persisted
  useEffect(() => {
    if (!onboardingCompleted && !hasSelectedMode) {
      setShowOnboarding(true);
    }
  }, [onboardingCompleted, hasSelectedMode]);

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
  const sessionValidated = useAuthStore((state) => state.sessionValidated);

  // Mode selection is handled inside the OnboardingWizard (single onboarding flow).
  // The legacy `hasSelectedMode` flag is still flipped by the wizard for any
  // downstream consumers that read it from the appModeStore.

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
    registerCleanup(() => cleanupBackgroundTaskEventListeners());
    registerCleanup(() => cleanupExecutionListeners());
    registerCleanup(() => cleanupAgentWorkflowEventListeners());
    registerCleanup(() => cleanupRuntimeActivityEventListeners());

    void runStartupStep('Execution goal subscription', async () => {
      initializeExecutionGoalSubscription();
    });

    if (isTauri) {
      void runStartupStep('Agent status listener', () => initializeAgentStatusListener());
      void runStartupStep('Background task event listener', () =>
        initializeBackgroundTaskEventListeners(),
      );
      void runStartupStep('Tool event listener', () => initializeToolEventListener());
      void runStartupStep('Agent task event listener', () => initializeAgentTaskEventListeners());
      void runStartupStep('Agent workflow event listener', () =>
        initializeAgentWorkflowEventListeners(),
      );
      void runStartupStep('Execution event listener', () => initializeExecutionListeners());
      void runStartupStep('Runtime activity event listener', () =>
        initializeRuntimeActivityEventListeners(),
      );
    }

    // Wire up mcpb:install_progress Tauri event into the MCPB store (Tauri-only)
    if (isTauri) {
      void (async () => {
        try {
          const { initializeMcpbInstallListener } = await import('./stores/mcpStore');
          await runStartupStep('MCP bundle install listener', () =>
            initializeMcpbInstallListener(),
          );
        } catch (error) {
          if (!disposed) {
            reportStartupFailure('MCP bundle install listener', error);
          }
        }
      })();
    }

    void (async () => {
      try {
        // Wait for settings store hydration from localStorage before loading from backend
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
            const theme = getThemeById(themeId);
            if (theme) applyTheme(theme);
          }
        });

        if (disposed) return;
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
              // Forward Supabase credentials to Rust only in cloud mode.
              // Local-mode users have no use for the Supabase anon key in the
              // Rust process — forwarding it unconditionally violates least-
              // privilege and lets local-mode code accidentally reach Supabase
              // (e.g. submit_feedback).
              if (useAppModeStore.getState().mode === 'cloud') {
                await invoke('set_supabase_credentials', {
                  url: import.meta.env['VITE_SUPABASE_URL'] ?? '',
                  anonKey: import.meta.env['VITE_SUPABASE_ANON_KEY'] ?? '',
                }).catch(() => {});
              }
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

  // Initialize cloud provider + load available models into the chat package's model store
  useEffect(() => {
    async function initModels() {
      try {
        // Enable ManagedCloud provider if user is authenticated (subscription-based models)
        await invoke<boolean>('llm_ensure_managed_cloud').catch(() => false);

        const { useChatModelStore } = await import('@agiworkforce/unified-chat');
        interface RustModelInfo {
          id: string;
          name: string;
          provider: string;
          available: boolean;
        }
        const rustModels = await invoke<RustModelInfo[]>('llm_get_available_models');
        const validProviders = new Set([
          'anthropic',
          'openai',
          'google',
          'mistral',
          'meta',
          'xai',
          'deepseek',
          'local',
        ]);
        const chatModels = rustModels.map((m) => ({
          id: m.id,
          name: m.name,
          provider: (validProviders.has(m.provider.toLowerCase())
            ? m.provider.toLowerCase()
            : 'openai') as import('@agiworkforce/unified-chat').ModelInfo['provider'],
          tier: (m.name.toLowerCase().includes('opus') ||
          m.name.toLowerCase().includes('4o') ||
          m.name.toLowerCase().includes('pro')
            ? 'flagship'
            : m.name.toLowerCase().includes('haiku') ||
                m.name.toLowerCase().includes('mini') ||
                m.name.toLowerCase().includes('flash')
              ? 'fast'
              : 'standard') as import('@agiworkforce/unified-chat').ModelInfo['tier'],
          supportsThinking:
            m.name.toLowerCase().includes('think') || m.provider.toLowerCase() === 'anthropic',
          supportsVision: true,
          supportsTools: true,
          contextWindow: 128000,
          isLocal: m.provider.toLowerCase() === 'ollama' || m.provider.toLowerCase() === 'local',
          isByok: m.available,
        }));
        useChatModelStore.getState().setModels(chatModels);
      } catch {
        // Backend unavailable — try cloud API in web mode, then fall back to hardcoded defaults
        try {
          if (!isTauri) {
            const res = await fetch(`${API_BASE_URL}/api/models`);
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data?.models) && data.models.length > 0) {
                const { useChatModelStore } = await import('@agiworkforce/unified-chat');
                useChatModelStore.getState().setModels(
                  data.models.map((m: { id: string; name: string; provider: string }) => ({
                    id: m.id,
                    name: m.name,
                    provider: (m.provider ||
                      'openai') as import('@agiworkforce/unified-chat').ModelInfo['provider'],
                    tier: 'standard' as const,
                    supportsThinking: false,
                    supportsVision: true,
                    supportsTools: true,
                    contextWindow: 128000,
                    isLocal: false,
                    isByok: false,
                  })),
                );
                toast.info('Loaded models from cloud API.');
                return; // cloud API succeeded, skip hardcoded fallback
              }
            }
          }
        } catch {
          // Cloud API also failed — continue to hardcoded fallback
        }

        // Build fallback models from the shared catalog helpers (single source of truth)
        try {
          const { useChatModelStore } = await import('@agiworkforce/unified-chat');
          const fallbackProviders = ['anthropic', 'openai', 'google', 'xai', 'deepseek', 'ollama'];
          const fallbackModels: import('@agiworkforce/unified-chat').ModelInfo[] =
            fallbackProviders.flatMap((p) => {
              const defaultModelId = getProviderDefaultModel(
                p as import('./types/provider').Provider,
              );
              if (!defaultModelId) return [];
              const m = getModelMetadata(defaultModelId);
              if (!m) return [];
              return [
                {
                  id: m.id,
                  name: m.name,
                  provider: p as import('@agiworkforce/unified-chat').ModelInfo['provider'],
                  tier:
                    m.speed === 'very-fast' || m.speed === 'fast'
                      ? ('fast' as const)
                      : ('standard' as const),
                  supportsThinking: m.capabilities?.['thinking'] ?? false,
                  supportsVision: m.capabilities?.['vision'] ?? false,
                  supportsTools: m.capabilities?.['tools'] ?? false,
                  contextWindow: m.contextWindow ?? 128000,
                  isLocal: p === 'ollama',
                  isByok: p !== 'ollama',
                },
              ];
            });
          useChatModelStore.getState().setModels(fallbackModels);
          toast.error('Could not load models from backend. Using defaults.');
        } catch {
          // Even the fallback import failed — chat will use its own internal default
        }
      }
    }
    void initModels();
  }, []);

  // Sync desktop auth user profile → chat package's settingsStore
  useEffect(() => {
    async function syncProfile() {
      try {
        const { useChatSettingsStore } = await import('@agiworkforce/unified-chat');

        const syncFromAuth = () => {
          const authState = useAuthStore.getState();
          const billingState = useBillingStore.getState();
          const user = authState.user;
          if (!user) return;

          useChatSettingsStore.getState().updateProfile({
            fullName: user.name || user.email?.split('@')[0] || 'User',
            email: user.email || '',
            plan: billingState.getCurrentPlan?.() || 'free',
          });
        };

        // Sync immediately
        syncFromAuth();

        // Re-sync when auth changes
        const unsub = useAuthStore.subscribe(syncFromAuth);
        return unsub;
      } catch {
        // Non-fatal
        return undefined;
      }
    }
    const cleanup = syncProfile();
    return () => {
      void cleanup?.then((unsub) => unsub?.());
    };
  }, []);

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

  // Listen for chat:action events dispatched by the shared chat package
  useEffect(() => {
    const handleChatAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type: string; tab?: string };
      if (detail.type === 'open-settings') {
        openSettingsDialog((detail.tab as Parameters<typeof openSettingsDialog>[0]) ?? 'general');
      } else if (detail.type === 'keyboard-shortcuts') {
        useSettingsDialogStore.getState().openShortcuts();
      } else if (detail.type === 'logout') {
        supabaseAuth.signOut();
      } else if (detail.type === 'open-plans-modal') {
        setPlansModalOpen(true);
      }
    };
    window.addEventListener('chat:action', handleChatAction);
    return () => window.removeEventListener('chat:action', handleChatAction);
  }, [openSettingsDialog]);

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

  // Listen for online/offline events and update appModeStore
  useEffect(() => {
    const handleOnline = () => {
      useAppModeStore.getState().setOnline(true);
    };

    const handleOffline = () => {
      useAppModeStore.getState().setOnline(false);

      // Show toast warning if user is in Cloud Mode
      const isCloudMode = useAppModeStore.getState().mode === 'cloud';
      if (isCloudMode) {
        toast.error("You're offline. Switch to Local Mode or reconnect.");
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const startNewChat = useCallback(async () => {
    clearHistory();
  }, [clearHistory]);

  const routeToChatSurface = useCallback(
    async (draft?: string) => {
      if (isTauri) {
        await actions.show();
      }

      const chatStore = useUnifiedChatStore.getState();
      chatStore.setActiveView('chat');

      const trimmedDraft = draft?.trim();
      if (trimmedDraft) {
        chatStore.setDraftContent(trimmedDraft);
      }
    },
    [actions],
  );

  const handleQuickQueryOpenConversation = useCallback(
    async (conversationDbId: number) => {
      await routeToChatSurface();
      useUnifiedChatStore.getState().selectConversation(dbIdToUuid(conversationDbId));
      setQuickQueryOpen(false);
    },
    [routeToChatSurface],
  );

  const handleQuickQueryStartNewChat = useCallback(async () => {
    await routeToChatSurface();
    await startNewChat();
    setQuickQueryOpen(false);
  }, [routeToChatSurface, startNewChat]);

  const handleVoiceInputRequest = useCallback(
    async (draft = '') => {
      await routeToChatSurface(draft);
      setQuickQueryOpen(false);

      const voiceInputState = useVoiceInputStore.getState();

      if (voiceInputState.voiceMode === 'listening') {
        await voiceInputState.stopListening();
      } else {
        await voiceInputState.startListening();
      }
    },
    [routeToChatSurface],
  );

  const handleCaptureRequest = useCallback(
    async (captureResult?: CaptureResult, draft = '') => {
      await routeToChatSurface(draft);
      setQuickQueryOpen(false);
      window.dispatchEvent(
        new CustomEvent(CHAT_COMPOSER_CAPTURE_EVENT, {
          detail: captureResult ? { captureResult } : {},
        }),
      );
    },
    [routeToChatSurface],
  );

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

      void (async () => {
        try {
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

          useDesktopChatStore.getState().addPendingMessage({
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
              void handleVoiceInputRequest();
              break;
            case 'quick_capture':
              void handleCaptureRequest();
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
  }, [handleCaptureRequest, handleVoiceInputRequest, startNewChat]);

  const openSettings = useCallback(() => openSettingsDialog(), [openSettingsDialog]);

  const handleDismissTimeoutWarning = useCallback(() => {
    setIsTimeoutWarningOpen(false);
    setTimeoutWarning(null);
  }, []);

  const tauriRuntime = useMemo(() => (isTauri ? new TauriRuntime() : new WebRuntime()), []);
  const chatHostBridge = useMemo<ChatHostBridge>(
    () => ({
      getSnapshot: () => {
        const state = useDesktopChatStore.getState();
        return {
          activeConversationId: state.activeConversationId,
          conversations: state.conversations.map((conversation) => ({
            id: conversation.id,
            title: conversation.title,
            createdAt: conversation.updatedAt,
            updatedAt: conversation.updatedAt,
            pinned: conversation.pinned,
            archived: conversation.archived,
            lastMessage: conversation.lastMessage,
          })),
        };
      },
      subscribe: (listener) => {
        const unsubscribeActiveConversation = useDesktopChatStore.subscribe(
          (state) => state.activeConversationId,
          () => listener(),
        );
        const unsubscribeConversations = useDesktopChatStore.subscribe(
          (state) => state.conversations,
          () => listener(),
        );

        return () => {
          unsubscribeActiveConversation();
          unsubscribeConversations();
        };
      },
      addMessage: (message) =>
        useDesktopChatStore.getState().addMessage({
          ...message,
          role: message.role as 'user' | 'assistant' | 'system',
        }),
      createConversation: (title) => useDesktopChatStore.getState().createConversation(title),
      selectConversation: (id) => {
        if (!id) return;
        useDesktopChatStore.getState().selectConversation(id);
      },
    }),
    [],
  );

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

  if (isAuthLoading || !sessionValidated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        {/* Skeleton layout — shown while Supabase session is being validated */}
        <div className="flex w-full max-w-sm flex-col items-center gap-4 px-6">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-3 w-48 animate-pulse rounded bg-muted" />
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
      <div
        className="flex h-screen w-full flex-col overflow-hidden bg-surface-base text-foreground font-sans"
        data-theme-managed=""
      >
        {!isTauri && import.meta.env.DEV && (
          <div className="bg-amber-500/20 border-b border-amber-500/50 px-4 py-2 text-center text-sm text-amber-200">
            <strong>Web Development Mode</strong> - Running without Tauri. Some features are mocked.
          </div>
        )}
        {!isTauri && !import.meta.env.DEV && (
          <div className="bg-gradient-to-r from-teal-600 to-blue-600 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold text-sm">AGI Workforce</span>
              <span className="text-white/60 text-xs">Web Chat</span>
            </div>
            <a
              href="https://agiworkforce.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/90 hover:text-white bg-white/15 hover:bg-white/25 px-3 py-1 rounded-full transition-colors"
            >
              Download Desktop App
            </a>
          </div>
        )}
        {isTauri && (
          <Suspense fallback={null}>
            <VoiceInputOverlay />
          </Suspense>
        )}
        {isTauri && showOnboarding && !onboardingCompleted && (
          <Suspense fallback={null}>
            <OnboardingWelcome onComplete={() => setShowOnboarding(false)} />
          </Suspense>
        )}
        <div className="flex flex-col gap-1">
          <Suspense fallback={null}>
            <StatusBanner />
          </Suspense>
          <Suspense fallback={null}>
            <OfflineIndicator position="top" />
          </Suspense>
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
              <ChatInterface
                runtime={tauriRuntime}
                className="h-full w-full"
                manageTheme={false}
                enableShortcuts={true}
                hostBridge={chatHostBridge}
                onModelSelectorClick={() => openSettingsDialog('models-keys')}
                onVoiceClick={() => {
                  // Toggle voice input overlay
                  const event = new CustomEvent('toggle-voice-input');
                  window.dispatchEvent(event);
                }}
                onNavigateView={(view) => {
                  if (view === 'customize') {
                    openSettingsDialog('mcp-skills');
                  } else if (view === 'connectors') {
                    openSettingsDialog('connectors');
                  } else if (view === 'skills') {
                    openSettingsDialog('mcp-skills');
                  } else if (view === 'projects') {
                    openSettingsDialog('account');
                  }
                }}
              />
            </ErrorBoundary>
          </div>
        </main>
        <Suspense fallback={null}>{isSearchModalOpen ? <SearchModal /> : null}</Suspense>
        <Suspense fallback={null}>
          {commandPaletteOpen ? (
            <CommandPalette
              isOpen={commandPaletteOpen}
              onClose={() => setCommandPaletteOpen(false)}
              commands={commandOptions}
            />
          ) : null}
        </Suspense>
        <Suspense fallback={null}>
          <SettingsPanel
            open={settingsPanelOpen}
            onOpenChange={(v) => (v ? openSettingsDialog() : closeSettingsDialog())}
            initialTab={settingsInitialTab}
          />
        </Suspense>
        {isTauri && (
          <Suspense fallback={null}>
            <UpdateChecker onUpdateNow={openSettings} />
          </Suspense>
        )}
        {isTauri && (
          <Suspense fallback={null}>
            <AutomationPermissionsModal />
          </Suspense>
        )}
        <Suspense fallback={null}>
          <ErrorToastContainer position="top-right" />
        </Suspense>
        {/* Plans/Pricing modal — triggered by chat:action open-plans-modal */}
        <PlansModal open={plansModalOpen} onOpenChange={setPlansModalOpen} />
        <Suspense fallback={null}>
          <TimeoutWarningDialog
            warning={timeoutWarning}
            onDismiss={handleDismissTimeoutWarning}
            isOpen={isTimeoutWarningOpen}
          />
        </Suspense>
        <Suspense fallback={null}>
          {quickQueryOpen ? (
            <QuickQuery
              open={quickQueryOpen}
              onClose={() => setQuickQueryOpen(false)}
              onSubmit={handleQuickQuerySubmit}
              onOpenConversation={handleQuickQueryOpenConversation}
              onStartNewChat={() => {
                void handleQuickQueryStartNewChat();
              }}
              onRequestVoice={(draft) => {
                void handleVoiceInputRequest(draft);
              }}
              onRequestCapture={(captureResult, draft) => {
                void handleCaptureRequest(captureResult, draft);
              }}
            />
          ) : null}
        </Suspense>
      </div>
    </Suspense>
  );
};

const App = () => {
  const { i18n } = useTranslation();
  const [isWebAuthReady, setIsWebAuthReady] = useState(isTauri);

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

  useEffect(() => {
    if (isTauri) {
      return;
    }

    let cancelled = false;

    void initializeWebAuth()
      .then((ready) => {
        if (!cancelled && ready) {
          setIsWebAuthReady(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[App] Web auth initialization failed:', error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useDeepLink();
  useTierBridge();

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

  if (!isWebAuthReady) {
    return <LoadingFallback />;
  }

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        <Suspense fallback={<LoadingFallback />}>{renderContent()}</Suspense>
      </TooltipProvider>
    </ErrorBoundary>
  );
};

export default App;
