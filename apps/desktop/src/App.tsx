import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatHostBridge } from '@agiworkforce/unified-chat';
import {
  createChatModelInfo,
  parseDiscoveredChatModels,
  useChatSettingsStore,
} from '@agiworkforce/unified-chat';
import { useUnifiedAuthStore } from './stores/auth';
import { isTauri, invoke, listen } from './lib/tauri-mock';
import { toast } from 'sonner';
import { useVoiceHotkey } from './hooks/useVoiceHotkey';
import { API_BASE_URL } from './api/client';
import { guardedFetch } from './lib/egressGuard';
import { cloudFetch, getAuthHeaders, getCloudModels, CLOUD_API_BASE_URL } from './api/cloudApi';
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

import {
  resolveDesktopChatOwnerId,
  useChatStore as useDesktopChatStore,
} from './stores/chat/chatStore';
import { createDesktopChatRuntimeWithLabeling } from './runtime/sessionLabeling';
import { registerActiveDesktopChatRuntime } from './runtime/desktopChatRuntime';
import type { CommandOption } from './features/chat/CommandPalette';
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
} from './stores/unifiedChatStore';
import { useDeepLink } from './hooks/useDeepLink';
import { useTierBridge } from './hooks/useTierBridge';
import type { TimeoutWarningData } from './features/execution/TimeoutWarningDialog';

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
import { ErrorBoundary } from './features/error-handling';
import { TooltipProvider } from './components/ui/Tooltip';
import { errorReportingService } from './services/errorReporting';
import { initializeWebAuth, cloudAccountAuth } from './services/cloudAccountAuth';
import {
  useAuthStore,
  useAccountStore,
  useBillingStore,
  waitForAuthReady,
  waitForHydration,
} from './stores/auth';
import { initializeAuthOrchestrator } from './stores/authOrchestrator';
import { initializeModelStoreFromSettings, useModelStore } from './stores/modelStore';
import useErrorStore from './stores/ui';
import { useAppModeStore, selectPrivacyMode } from './stores/appModeStore';
import {
  initializeTaskRoutingTierRestriction,
  useSettingsDialogStore,
  useSettingsStore,
  useVoiceInputStore,
  waitForSettingsHydration,
} from './stores/settingsStore';
import { useProjectStore } from './stores/projectStore';
import { applyTheme, getThemeById } from './themes/index';

const VisualizationLayer = lazy(() =>
  import('./features/overlay/VisualizationLayer').then((m) => ({
    default: m.VisualizationLayer,
  })),
);
const FloatingChat = lazy(() =>
  import('./features/floating-chat').then((m) => ({
    default: m.FloatingChat,
  })),
);
const DesktopShellV3 = lazy(() =>
  import('./features/v3').then((m) => ({
    default: m.DesktopShellV3,
  })),
);
const SearchModal = lazy(() =>
  import('./features/chat/SearchModal').then((m) => ({
    default: m.SearchModal,
  })),
);
const CommandPalette = lazy(() =>
  import('./features/chat/CommandPalette').then((m) => ({
    default: m.CommandPalette,
  })),
);
const QuickQuery = lazy(() =>
  import('./features/quick-query').then((m) => ({
    default: m.QuickQuery,
  })),
);
const VoiceInputOverlay = lazy(() =>
  import('./features/voice/VoiceInputOverlay').then((m) => ({
    default: m.VoiceInputOverlay,
  })),
);
const OnboardingWelcome = lazy(() =>
  import('./features/onboarding').then((m) => ({
    default: m.OnboardingWelcome,
  })),
);
const AuthPage = lazy(() =>
  import('./features/auth/AuthPage').then((m) => ({
    default: m.AuthPage,
  })),
);
const SettingsPanel = lazy(() =>
  import('./features/settings/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
);
const DesktopCloudSettingsModal = lazy(() =>
  import('./features/settings/DesktopCloudSettingsModal').then((m) => ({
    default: m.DesktopCloudSettingsModal,
  })),
);
const UpdateChecker = lazy(() =>
  import('./features/updates').then((m) => ({
    default: m.UpdateChecker,
  })),
);
const UpdateDialog = lazy(() =>
  import('./features/updates').then((m) => ({
    default: m.UpdateDialog,
  })),
);
const AutomationPermissionsModal = lazy(() =>
  import('./features/settings/AutomationPermissionsModal').then((m) => ({
    default: m.AutomationPermissionsModal,
  })),
);
const TimeoutWarningDialog = lazy(() =>
  import('./features/execution/TimeoutWarningDialog').then((m) => ({
    default: m.TimeoutWarningDialog,
  })),
);
const StatusBanner = lazy(() =>
  import('./features/status-banner').then((m) => ({
    default: m.StatusBanner,
  })),
);
const OfflineIndicator = lazy(() =>
  import('./features/offline-indicator').then((m) => ({
    default: m.OfflineIndicator,
  })),
);
const ErrorToastContainer = lazy(() =>
  import('./features/errors/ErrorToast').then((m) => ({
    default: m.default,
  })),
);
import { useSessionPersistence } from './hooks/useSessionPersistence';
import { initializeSyncManager, cleanupSyncManager } from './lib/offline/offlineSync';
import { initCloudSyncScheduler, triggerCloudSync } from './lib/cloudSyncTrigger';
import { resetCloudConversationCoordinator } from './services/cloudChat';
import { initManagedCloudSettingsSync } from './services/managedCloudSettingsSync';
import { CHAT_COMPOSER_CAPTURE_EVENT } from './lib/chatComposerEvents';
import type { CaptureResult } from './types/capture';
import { PlansModal } from './features/pricing/PlansModal';

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full w-full bg-background">
    <div className="animate-pulse flex flex-col items-center gap-4">
      <Bot className="h-12 w-12 text-[var(--chat-accent-secondary)]" />
      <span className="text-2xl font-bold tracking-tighter text-foreground">AGI</span>
      <span className="text-sm text-muted-foreground">Loading your workspace...</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RefreshCcw className="h-4 w-4" />
        Retry
      </button>
    </div>
  </div>
);

type DesktopWindowMode = 'default' | 'overlay' | 'floating';

function resolveDesktopWindowMode(): DesktopWindowMode {
  if (typeof window === 'undefined') return 'default';

  try {
    const pathname = window.location.pathname;
    if (pathname === '/floating') return 'floating';
    if (pathname === '/overlay') return 'overlay';

    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'overlay') return 'overlay';
    if (mode === 'floating') return 'floating';
  } catch {
    // Invalid location state falls back to the main Desktop shell.
  }
  return 'default';
}

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
  const [externalSendRequest, setExternalSendRequest] = useState<{
    id: string;
    content: string;
  } | null>(null);
  const [plansModalOpen, setPlansModalOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [timeoutWarning, setTimeoutWarning] = useState<TimeoutWarningData | null>(null);
  const [isTimeoutWarningOpen, setIsTimeoutWarningOpen] = useState(false);
  const [subscriptionFetchFailed, setSubscriptionFetchFailed] = useState(false);
  const isSearchModalOpen = useSearchModal((state) => state.isOpen);
  const { theme, setTheme } = useThemeContext();

  // Onboarding state - mode selection is the trust-boundary gate.
  const hasSelectedMode = useAppModeStore((s) => s.hasSelectedMode);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Show mode picker whenever no Local/BYOK/Cloud mode has been selected.
  useEffect(() => {
    setShowOnboarding(!hasSelectedMode);
  }, [hasSelectedMode]);

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
  const accessToken = useAuthStore((state) => state.accessToken);
  const authenticatedUserId = useAuthStore((state) => state.user?.id ?? null);
  const appMode = useAppModeStore((s) => s.mode);
  const isCloudMode = useAppModeStore((s) => s.mode === 'cloud');
  const hasCloudSession = isAuthenticated && !!accessToken;
  const conversationBoundaryRef = useRef<string | null>(null);
  const [conversationBoundaryReady, setConversationBoundaryReady] = useState(false);
  const [conversationBoundaryError, setConversationBoundaryError] = useState<string | null>(null);
  const [conversationBoundaryRetry, setConversationBoundaryRetry] = useState(0);
  const expectedConversationBoundaryKey = `${appMode}:${
    appMode === 'cloud'
      ? `${authenticatedUserId ?? 'signed-out'}:${hasCloudSession ? 'connected' : 'disconnected'}`
      : 'device'
  }`;

  // Project the canonical Local/Cloud product boundary into the legacy native
  // storage flag, then hydrate the matching conversation set. This closes the
  // startup gap where the mode was persisted as Cloud but the Rust sync gate
  // still read its default "local" value and the sidebar was never loaded.
  useEffect(() => {
    let cancelled = false;
    let hydrationSucceeded = false;
    const boundaryKey = expectedConversationBoundaryKey;
    setConversationBoundaryReady(false);
    setConversationBoundaryError(null);

    const hydrateBoundary = async () => {
      await waitForSettingsHydration();
      if (cancelled) return;

      const desiredStorageMode = appMode === 'cloud' ? 'cloud' : 'local';
      const settings = useSettingsStore.getState();
      if (settings.chatPreferences.chatStorageMode !== desiredStorageMode) {
        useSettingsStore.setState((state) => ({
          chatPreferences: {
            ...state.chatPreferences,
            chatStorageMode: desiredStorageMode,
          },
        }));
        await useSettingsStore.getState().saveSettings();
        if (cancelled) return;
      }

      if (conversationBoundaryRef.current !== boundaryKey) {
        resetCloudConversationCoordinator();
        useDesktopChatStore.setState({
          conversations: [],
          messages: [],
          activeConversationId: null,
          messagesByConversation: {},
          isLoadingMessages: false,
        });
        useProjectStore.setState({
          projects: [],
          activeProjectId: null,
          isLoading: false,
          error: null,
        });
        conversationBoundaryRef.current = boundaryKey;
      }

      if (appMode === 'cloud') {
        if (!hasCloudSession || !authenticatedUserId) return;
        await Promise.all([
          useDesktopChatStore.getState().loadConversations(authenticatedUserId),
          useProjectStore.getState().loadProjects({ throwOnError: true }),
        ]);
        const cloudConversations = useDesktopChatStore.getState().conversations;
        useProjectStore.setState((state) => ({
          projects: state.projects.map((project) => {
            const conversationIds = cloudConversations
              .filter((conversation) => conversation.projectId === project.id)
              .map((conversation) => conversation.id);
            return {
              ...project,
              conversationIds,
              conversationCount: Math.max(project.conversationCount ?? 0, conversationIds.length),
            };
          }),
        }));
        if (!cancelled) triggerCloudSync();
        return;
      }

      await Promise.all([
        useDesktopChatStore.getState().loadConversations(resolveDesktopChatOwnerId()),
        useProjectStore.getState().loadProjects({ throwOnError: true }),
      ]);
    };

    void hydrateBoundary()
      .then(() => {
        hydrationSucceeded = true;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error('[App] Failed to hydrate the active chat boundary:', error);
          setConversationBoundaryError(
            error instanceof Error
              ? error.message
              : 'Could not load conversations for the selected mode.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setConversationBoundaryReady(hydrationSucceeded);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    appMode,
    authenticatedUserId,
    expectedConversationBoundaryKey,
    hasCloudSession,
    conversationBoundaryRetry,
  ]);

  // Hard 8 s boot timeout: if sessionValidated is still false (for example,
  // cloud auth warm-up stalls), move to a recoverable state.
  // unreachable and the auth-state listener never fires), force it true so
  // the skeleton never hangs indefinitely. Uses setSessionValidated so that
  // the clearAuth path already ran — this is a last-resort guard only.
  useEffect(() => {
    if (sessionValidated) return;
    const id = window.setTimeout(() => {
      if (!useAuthStore.getState().sessionValidated) {
        useAuthStore.getState().setSessionValidated(true);
      }
    }, 8_000);
    return () => window.clearTimeout(id);
  }, [sessionValidated]);

  // Mode selection is handled inside the OnboardingWizard (single onboarding flow).
  // The legacy `hasSelectedMode` flag is still flipped by the wizard for any
  // downstream consumers that read it from the appModeStore.

  const subscriptionFetchStatus = useAccountStore((state) => state.subscriptionFetchStatus);

  // Track when subscription fetch fails so we can show the degraded-state banner
  useEffect(() => {
    if (!isCloudMode) {
      setSubscriptionFetchFailed(false);
    } else if (subscriptionFetchStatus === 'failed') {
      setSubscriptionFetchFailed(true);
    } else if (subscriptionFetchStatus === 'succeeded') {
      setSubscriptionFetchFailed(false);
    }
  }, [isCloudMode, subscriptionFetchStatus]);

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
      // Cloud sync scheduler: fires on managed-mode entry + every 30 s.
      // Managed-only gate is enforced inside; Local and BYOK never trigger sync.
      registerCleanup(initCloudSyncScheduler());
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
        if (!disposed) {
          registerCleanup(initManagedCloudSettingsSync());
        }

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

        // Sync managed-cloud access token to keyring if user is already authenticated.
        if (isTauri) {
          await runStartupStep(
            'Managed cloud credential sync',
            async () => {
              // Ensure Rust uses the same backend base URL as the UI (critical in local dev).
              await invoke('account_store_api_base_url', {
                apiBaseUrl: CLOUD_API_BASE_URL || API_BASE_URL,
              });

              // Forward cloud credentials only in Managed Cloud mode. Local and
              // BYOK chat must not wait on or hydrate managed auth.
              if (selectPrivacyMode(useAppModeStore.getState()) !== 'managed') {
                return;
              }

              // Wait for auth state to be ready before accessing session data
              // This prevents race conditions where we read stale/empty state
              await waitForAuthReady();
              if (disposed) return;

              const authState = cloudAccountAuth.getState();
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
                const userId = cloudAccountAuth.getState().user?.id;
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

  // Initialize providers + load mode-appropriate models into the chat package's model store.
  useEffect(() => {
    let cancelled = false;

    async function initModels() {
      const currentMode = appMode;
      try {
        const { useChatModelStore } = await import('@agiworkforce/unified-chat');
        if (cancelled) return;

        if (currentMode === 'cloud' && !hasCloudSession) {
          const modelStore = useChatModelStore.getState();
          modelStore.setModels([]);
          modelStore.selectModel('');
          return;
        }

        if (currentMode === 'cloud') {
          const discoveredModels = await getCloudModels();
          if (cancelled) return;
          if (discoveredModels.length === 0) {
            throw new Error('The managed model catalog is empty.');
          }

          const modelStore = useChatModelStore.getState();
          modelStore.setModels(
            discoveredModels.map((model) =>
              createChatModelInfo({
                id: model.id,
                name: model.name,
                provider: model.provider,
                isLocal: false,
                isByok: false,
              }),
            ),
          );
          const updatedModelStore = useChatModelStore.getState();
          if (
            !updatedModelStore.models.some(
              (model) => model.id === updatedModelStore.selectedModelId,
            )
          ) {
            updatedModelStore.selectModel(
              updatedModelStore.models.some((model) => model.id === 'auto')
                ? 'auto'
                : (updatedModelStore.models[0]?.id ?? ''),
            );
          }
          return;
        }

        const rawRustModels = await invoke<unknown>('llm_get_available_models');
        if (cancelled) return;
        let rustModels = parseDiscoveredChatModels(rawRustModels);
        if (currentMode === 'local') {
          // Defensive direct-fetch fallback: `llm_get_available_models` only appends a
          // local runtime's models when the router already has it registered
          // (`has_provider`), which can race with app startup before the settings
          // rehydration callback (or the lazy chat-send registration) has run. Bypass
          // that gate here for each local runtime the same way, so a running server is
          // never hidden from the picker just because of registration timing.
          const localRuntimeFetches: Array<{ provider: string; command: string }> = [
            { provider: 'ollama', command: 'llm_list_ollama_models' },
            { provider: 'lmstudio', command: 'llm_list_lmstudio_models' },
            { provider: 'llamacpp', command: 'llm_list_llamacpp_models' },
            { provider: 'vllm', command: 'llm_list_vllm_models' },
          ];
          const seenModelIds = new Set(rustModels.map((model) => model.id));
          for (const { provider, command } of localRuntimeFetches) {
            if (rustModels.some((model) => model.provider.toLowerCase() === provider)) {
              continue;
            }
            try {
              const rawDirectModels = await invoke<unknown>(command);
              if (cancelled) return;
              const directModels = parseDiscoveredChatModels(rawDirectModels);
              rustModels = [
                ...rustModels,
                ...directModels.filter((model) => {
                  if (seenModelIds.has(model.id)) return false;
                  seenModelIds.add(model.id);
                  return true;
                }),
              ];
            } catch (error) {
              console.warn(`Failed to directly load ${provider} models for local picker:`, error);
            }
          }
        }
        const visibleModels = rustModels.filter((model) => {
          const provider = model.provider.toLowerCase();
          const isLocalProvider =
            provider === 'ollama' ||
            provider === 'local' ||
            provider === 'lmstudio' ||
            provider === 'llamacpp' ||
            provider === 'vllm';
          const isManagedProvider = provider === 'managed_cloud' || provider === 'managed-cloud';
          const isReachable = model.available === true;
          const isConfiguredByok = isReachable && !isLocalProvider && !isManagedProvider;

          if (currentMode === 'local') {
            return (isLocalProvider && isReachable) || isConfiguredByok;
          }

          return isManagedProvider || model.id.startsWith('auto');
        });
        const chatModels = visibleModels.map((model) => {
          const provider = model.provider.toLowerCase();
          const isLocal = ['ollama', 'local', 'lmstudio', 'llamacpp', 'vllm'].includes(provider);
          const isByok =
            currentMode === 'local' &&
            model.available === true &&
            !isLocal &&
            provider !== 'managed_cloud' &&
            provider !== 'managed-cloud';

          return createChatModelInfo({
            id: model.id,
            name: model.name,
            provider,
            isLocal,
            isByok,
          });
        });
        if (cancelled) return;
        useChatModelStore.getState().setModels(chatModels);
        // Mode-safe selection: keep the active model consistent with the mode's
        // available set. In Local mode an auto-routing / cloud model must never
        // stay active — the egress guard blocks cloud calls in Local mode, so a
        // stale "Auto Economy" (managed_cloud) selection routes to a blocked
        // cloud model and fails silently. If the current selection isn't in the
        // set, drop onto the first local/BYOK model (or clear, so the picker's
        // "No local model" empty-state guides the user); in cloud mode fall back
        // to the default auto-routing model.
        {
          const ms = useChatModelStore.getState();
          const nextId = currentMode === 'local' ? (ms.models[0]?.id ?? '') : 'auto';
          if (
            !ms.models.some((m) => m.id === ms.selectedModelId) &&
            nextId !== ms.selectedModelId
          ) {
            ms.selectModel(nextId);
          }
        }
      } catch {
        if (cancelled) return;
        // Reachability is unknown. Never turn static catalog membership into a
        // fake Local/BYOK/Managed availability claim.
        const { useChatModelStore } = await import('@agiworkforce/unified-chat');
        if (cancelled) return;
        const modelStore = useChatModelStore.getState();
        modelStore.setModels([]);
        modelStore.selectModel('');
        toast.error(
          currentMode === 'local'
            ? 'No verified local or BYOK model is reachable. Start a local runtime or configure a provider in Settings.'
            : 'The managed model catalog is unavailable. Retry after the connection recovers.',
        );
      }
    }
    void initModels();
    return () => {
      cancelled = true;
    };
  }, [appMode, hasCloudSession]);

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
        void useAuthStore.getState().signOut();
      } else if (detail.type === 'open-plans-modal') {
        setPlansModalOpen(true);
      }
    };
    window.addEventListener('chat:action', handleChatAction);
    return () => window.removeEventListener('chat:action', handleChatAction);
  }, [openSettingsDialog]);

  // Listen for native menu events from Tauri window menu
  useEffect(() => {
    if (!isTauri) return;

    let isMounted = true;
    let unlistenFn: (() => void) | null = null;

    const setupMenuListener = async () => {
      try {
        const unlisten = await listen<string>('menu_action', (event) => {
          if (!isMounted) return;
          const action = event.payload;
          switch (action) {
            case 'open_settings':
              openSettingsDialog();
              break;
            case 'find':
              useSearchModal.getState().open();
              break;
            case 'zoom_in':
              document.documentElement.style.fontSize = `${parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.1}px`;
              break;
            case 'zoom_out':
              document.documentElement.style.fontSize = `${parseFloat(getComputedStyle(document.documentElement).fontSize) / 1.1}px`;
              break;
            case 'actual_size':
              document.documentElement.style.fontSize = '';
              break;
            case 'restart_to_update':
              setUpdateDialogOpen(true);
              break;
          }
        });
        if (isMounted) unlistenFn = unlisten;
        else unlisten();
      } catch (error) {
        console.error('[App] Failed to setup menu listener:', error);
      }
    };

    void setupMenuListener();

    return () => {
      isMounted = false;
      if (unlistenFn) {
        unlistenFn();
        unlistenFn = null;
      }
    };
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
    async (conversationId: string | number) => {
      await routeToChatSurface();
      useUnifiedChatStore
        .getState()
        .selectConversation(
          typeof conversationId === 'number' ? dbIdToUuid(conversationId) : conversationId,
        );
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
          if (
            useAppModeStore.getState().mode === 'cloud' &&
            model &&
            (selectedModel !== model || selectedProvider !== 'managed_cloud')
          ) {
            await selectModel(model, 'managed_cloud');
          }

          setExternalSendRequest({
            id: crypto.randomUUID(),
            content: query,
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

  const runtimeAppMode = isTauri && appMode === 'cloud' && !hasCloudSession ? 'local' : appMode;
  const chatRuntime = useMemo(
    () => createDesktopChatRuntimeWithLabeling({ isTauriHost: isTauri, appMode: runtimeAppMode }),
    [runtimeAppMode],
  );
  useEffect(() => registerActiveDesktopChatRuntime(chatRuntime), [chatRuntime]);

  // Keep the shared chat package's "is code execution actually available"
  // signal in sync with this deployment's E2B cut-over flag
  // (`/api/me` `feature_flags.code_execution`, already fetched into
  // `useUnifiedAuthStore` by `cloudAccountAuth.refreshUserData`). The
  // composer's "Run code" toggle (packages/ui/unified-chat) and useChat's
  // send-time gate both read this instead of re-deriving it, so they can
  // never disagree with what the account actually entitles.
  const codeExecutionDeploymentEnabled = useUnifiedAuthStore(
    (s) => s.featureFlags['code_execution'] ?? false,
  );
  useEffect(() => {
    useChatSettingsStore
      .getState()
      .setCodeExecutionDeploymentEnabled(codeExecutionDeploymentEnabled);
  }, [codeExecutionDeploymentEnabled]);
  const genericWebSearchDeploymentEnabled = useUnifiedAuthStore(
    (s) => s.featureFlags['generic_web_search'] ?? false,
  );
  useEffect(() => {
    useChatSettingsStore
      .getState()
      .setGenericWebSearchDeploymentEnabled(genericWebSearchDeploymentEnabled);
  }, [genericWebSearchDeploymentEnabled]);
  const chatHostBridge = useMemo<ChatHostBridge>(
    () => ({
      getSnapshot: () => {
        const state = useDesktopChatStore.getState();
        return {
          activeConversationId: state.activeConversationId,
          conversations: state.conversations.map((conversation) => ({
            id: conversation.id,
            title: conversation.title,
            createdAt: conversation.createdAt ?? conversation.updatedAt,
            updatedAt: conversation.updatedAt,
            pinned: conversation.pinned,
            archived: conversation.archived,
            lastMessage: conversation.lastMessage,
            model: conversation.modelOverride,
            executionMode: conversation.executionMode,
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
      setConversationModel: (id, modelId) => {
        useDesktopChatStore.getState().setConversationModel(id, modelId);
      },
      // Managed-cloud generated files (x_generated_files): fetch bytes from
      // the authenticated /api/files route. Bearer is ONLY attached to uris on
      // our cloud API base (never leaked to arbitrary hosts); guardedFetch
      // keeps the Local-mode egress chokepoint in front of the request.
      fetchCloudFile: async (uri: string) => {
        const isOurCloudUri = CLOUD_API_BASE_URL
          ? uri.startsWith(`${CLOUD_API_BASE_URL}/`)
          : uri.startsWith('/');
        const headers: Record<string, string> = {};
        if (isOurCloudUri) {
          const auth = await getAuthHeaders();
          if (auth['Authorization']) headers['Authorization'] = auth['Authorization'];
        }
        const res = isOurCloudUri
          ? await cloudFetch(uri, { headers, credentials: 'include' })
          : await guardedFetch(uri, { headers, credentials: 'include' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.blob();
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

  if (
    conversationBoundaryError &&
    conversationBoundaryRef.current === expectedConversationBoundaryKey
  ) {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-6">
        <div
          role="alert"
          className="w-full max-w-md rounded-2xl border border-[var(--chat-destructive)]/30 bg-[var(--chat-surface-elevated)] p-6 text-center shadow-sm"
        >
          <AlertTriangle className="mx-auto h-8 w-8 text-[var(--chat-destructive)]" />
          <h1 className="mt-4 text-lg font-semibold text-[var(--chat-text-primary)]">
            Could not open {isCloudMode ? 'Cloud Mode' : 'Local Mode'}
          </h1>
          <p className="mt-2 text-sm text-[var(--chat-text-secondary)]">
            {conversationBoundaryError}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setConversationBoundaryRetry((attempt) => attempt + 1)}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--chat-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--chat-accent-primary-contrast)] hover:opacity-90"
            >
              <RefreshCcw className="h-4 w-4" />
              Try again
            </button>
            {isCloudMode ? (
              <button
                type="button"
                onClick={() => useAppModeStore.getState().setMode('local')}
                className="rounded-lg border border-[var(--chat-border)] px-4 py-2 text-sm font-medium text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]"
              >
                Use Local Mode
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (
    !conversationBoundaryReady ||
    conversationBoundaryRef.current !== expectedConversationBoundaryKey ||
    (isCloudMode && (isAuthLoading || !sessionValidated))
  ) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        {/* Skeleton layout — shown while the cloud session is being validated */}
        <div className="flex w-full max-w-sm flex-col items-center gap-4 px-6">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-3 w-48 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (isCloudMode && !hasCloudSession) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <AuthPage />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <div
        className="flex h-screen w-full flex-col overflow-hidden bg-[var(--chat-surface-base)] text-[var(--chat-text-primary)] font-sans"
        data-theme-managed=""
      >
        {!isTauri && import.meta.env.DEV && (
          <div className="border-b border-[var(--chat-warning-border)] bg-[var(--chat-warning-bg)] px-4 py-2 text-center text-sm text-[var(--chat-warning-fg)]">
            <strong>Web Development Mode</strong> - Running without Tauri. Some features are mocked.
          </div>
        )}
        {!isTauri && !import.meta.env.DEV && (
          <div className="border-b border-[var(--chat-border)] bg-[var(--chat-accent-secondary)] px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[var(--chat-accent-primary-contrast)] font-semibold text-sm">
                AGI Workforce
              </span>
              <span className="text-[var(--chat-accent-primary-contrast)]/70 text-xs">
                Web Chat
              </span>
            </div>
            <a
              href="https://agiworkforce.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--chat-accent-primary-contrast)]/90 hover:text-[var(--chat-accent-primary-contrast)] bg-[var(--chat-accent-primary-contrast)]/15 hover:bg-[var(--chat-accent-primary-contrast)]/25 px-3 py-1 rounded-full transition-colors"
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
        {isTauri && showOnboarding && !hasSelectedMode && (
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
          {isCloudMode && subscriptionFetchFailed && (
            <div className="border-b border-[var(--chat-warning-border)] bg-[var(--chat-warning-bg)] px-4 py-2 flex items-center justify-between text-sm text-[var(--chat-warning-fg)]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span>
                  Cloud account details could not be refreshed. Some plan information may be
                  unavailable.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSubscriptionFetchFailed(false);
                  void cloudAccountAuth
                    .refreshUserData()
                    .then((refreshed) => {
                      if (!refreshed) setSubscriptionFetchFailed(true);
                    })
                    .catch(() => {
                      setSubscriptionFetchFailed(true);
                    });
                }}
                className="text-[var(--chat-warning-fg)] underline hover:opacity-80 text-xs"
              >
                Retry
              </button>
            </div>
          )}
        </div>
        <main className="flex flex-1 min-h-0 min-w-0 bg-[var(--chat-surface-base)]">
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary
              fallback={(error, errorInfo) => (
                <div className="flex h-full w-full items-center justify-center bg-[var(--chat-surface-base)]">
                  <div className="max-w-xl px-6 text-center">
                    <p className="mb-4 text-lg font-semibold text-foreground">
                      Chat interface encountered an error
                    </p>
                    {error ? (
                      <p className="mb-4 rounded-md border border-border bg-surface-panel px-3 py-2 text-left font-mono text-xs text-muted-foreground">
                        {error.message || String(error)}
                      </p>
                    ) : null}
                    {import.meta.env.DEV && errorInfo?.componentStack ? (
                      <pre className="mb-4 max-h-48 overflow-auto rounded-md border border-border bg-surface-panel px-3 py-2 text-left font-mono text-xs text-muted-foreground">
                        {errorInfo.componentStack}
                      </pre>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="rounded bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
                    >
                      Reload Application
                    </button>
                  </div>
                </div>
              )}
            >
              <DesktopShellV3
                runtime={chatRuntime}
                className="h-full w-full"
                externalSendRequest={externalSendRequest}
                hostBridge={chatHostBridge}
                onModelSelectorClick={() =>
                  openSettingsDialog(isCloudMode ? 'capabilities' : 'models-keys')
                }
                onOpenSearch={() => useSearchModal.getState().open()}
                onNavigateView={(view) => {
                  if (view === 'connectors') {
                    openSettingsDialog('connectors');
                  } else if (view === 'skills') {
                    openSettingsDialog('skills');
                  } else if (view === 'projects') {
                    openSettingsDialog('account');
                  } else if (view === 'pricing' || view === 'billing' || view === 'byok') {
                    setPlansModalOpen(true);
                  }
                }}
                onBuyTopUp={() => openSettingsDialog('billing')}
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
        {/* Settings: Cloud mode renders the shared SettingsModal shell; Local mode keeps SettingsPanel */}
        <Suspense fallback={null}>
          {isCloudMode ? (
            <DesktopCloudSettingsModal
              open={settingsPanelOpen}
              onClose={closeSettingsDialog}
              initialTab={settingsInitialTab}
            />
          ) : (
            <SettingsPanel
              open={settingsPanelOpen}
              onOpenChange={(v) => (v ? openSettingsDialog() : closeSettingsDialog())}
              initialTab={settingsInitialTab}
            />
          )}
        </Suspense>
        {isTauri && (
          <Suspense fallback={null}>
            <UpdateChecker onUpdateNow={openSettings} />
          </Suspense>
        )}
        {isTauri && (
          <Suspense fallback={null}>
            <UpdateDialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen} />
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
  const windowMode = resolveDesktopWindowMode();
  const [isAuthBootstrapReady, setIsAuthBootstrapReady] = useState(windowMode !== 'default');

  // Set document direction for RTL language support (Arabic)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
  }, [i18n.language]);

  useEffect(() => {
    // Cloud account bootstrap belongs to the main Desktop shell. Overlay and
    // floating webviews have independent JS auth services and intentionally do
    // not restore the native credential; installing an orchestrator there would
    // immediately publish a false signed-out state into shared persistence.
    if (windowMode !== 'default') return;

    // Single consolidated auth orchestrator - replaces individual store initializers
    // This prevents race conditions from multiple auth listeners firing simultaneously
    const unsubscribeOrchestrator = initializeAuthOrchestrator();
    const unsubscribeTierRestriction = initializeTaskRoutingTierRestriction();

    // After auth-store hydration, synthesize only the device-owned Local
    // account when there is no Cloud session. The auth orchestrator already
    // owns Cloud profile, subscription, credits, and token synchronization.
    let cancelled = false;
    void (async () => {
      try {
        if (cancelled) return;

        // Wait for store hydration from localStorage before syncing
        await waitForHydration();
        if (cancelled) return;

        if (
          !cloudAccountAuth.isAuthenticated() &&
          isTauri &&
          selectPrivacyMode(useAppModeStore.getState()) === 'local' &&
          !useAuthStore.getState().accessToken
        ) {
          // W2a-PRO-00A: local-only users have no cloud session — synthesize a
          // stable user.id from the machine install ID so downstream chat stores
          // can own conversations without crashing on a null user.
          const applyLocalAccount = (id: string) => {
            useAuthStore.getState().setAccount({
              id,
              email: '',
              displayName: 'Local User',
              plan: 'local-only',
              planDisplayName: 'Local Mode',
              subscriptionStatus: 'none',
              subscriptionFetchStatus: 'succeeded',
              currentPeriodEnd: null,
              stripeCustomerId: null,
              featureFlags: {},
              credits: null,
              accessToken: null,
              refreshToken: null,
              lastSyncedAt: Date.now(),
            });
          };
          try {
            const localId = await invoke<string>('get_local_user_id');
            if (!cancelled && localId && !useAuthStore.getState().accessToken) {
              applyLocalAccount(localId);
            }
          } catch (e) {
            console.warn('[App] get_local_user_id failed, using fallback id:', e);
            if (!cancelled && !useAuthStore.getState().accessToken) {
              applyLocalAccount('local-fallback');
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[App] Auth orchestrator bootstrap failed:', error);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeTierRestriction();
      unsubscribeOrchestrator();
    };
  }, [windowMode]);

  useEffect(() => {
    if (windowMode !== 'default') return;

    let cancelled = false;

    void initializeWebAuth()
      .then(() => {
        if (!cancelled) {
          setIsAuthBootstrapReady(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[App] Auth initialization failed:', error);
          setIsAuthBootstrapReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [windowMode]);

  useDeepLink(windowMode === 'default');
  useTierBridge(windowMode === 'default');

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

  if (!isAuthBootstrapReady) {
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
