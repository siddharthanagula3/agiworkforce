import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatHostBridge } from '@agiworkforce/unified-chat';
import {
  createChatModelInfo,
  parseDiscoveredChatModels,
  useChatModelStore,
  useChatSettingsStore,
  useChatStore as useSharedChatStore,
} from '@agiworkforce/unified-chat';
import { registerChatStoreStateReader } from './stores/chat/chatStoreRef';
import { useUnifiedAuthStore } from './stores/auth';
import { isTauri, invoke, listen } from './lib/tauri-mock';
import { toast } from 'sonner';
import { useVoiceHotkey } from './hooks/useVoiceHotkey';
import { useDesktopCloudResearchCapability } from './hooks/useDesktopCloudResearchCapability';
import { guardedFetch } from './lib/egressGuard';
import { isLocalProvider } from './types/provider';
import { getCloudModels, CLOUD_API_BASE_URL } from './api/cloudApi';
import { clearSessionToolApprovals } from './api/toolConfirmation';
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
import { useCodingCheckpointStore } from './stores/codingCheckpointStore';
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
import { TooltipProvider } from './ui/Tooltip';
import { errorReportingService } from './services/errorReporting';
import { initializeCoworkDispatchRuntime } from './services/coworkDispatch';
import { initializeWebAuth, cloudAccountAuth } from './services/cloudAccountAuth';
import {
  canUseDesktopCloudCodeExecution,
  resolveDesktopCloudPickerModels,
} from './services/desktopCloudEntitlements';
import {
  selectHasCloudAccountSession,
  useAuthStore,
  useAccountStore,
  useBillingStore,
  waitForAuthReady,
  waitForHydration,
} from './stores/auth';
import { initializeAuthOrchestrator } from './stores/authOrchestrator';
import { initializeModelStoreFromSettings, useModelStore } from './stores/modelStore';
import useErrorStore, { useSidecarStore } from './stores/ui';
import {
  GLOBAL_SHORTCUTS,
  RENDERER_SHORTCUTS,
  matchesBinding,
  resolveBinding,
  toBackendAccelerator,
  type RendererShortcutAction,
} from './constants/shortcuts';
import { useShortcutStore } from './stores/shortcutStore';
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

// Managed Cloud turns stream through the SHARED unified-chat store, not the
// desktop execution store, so the Local/Cloud mode-switch guard in
// `appModeStore.setMode` cannot see them on its own. Registering it here (the
// shell is the only module that owns both sides) makes a mid-stream Cloud
// toggle refuse instead of disposing CloudRuntime under a live response.
registerChatStoreStateReader(useSharedChatStore);

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
const RecorderHud = lazy(() =>
  import('./features/automation/RecorderHud').then((m) => ({
    default: m.RecorderHud,
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
import { createManagedCloudRequestContext } from './services/managedCloudRequestContext';
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

type DesktopWindowMode = 'default' | 'overlay' | 'floating' | 'recorder-hud';

function resolveDesktopWindowMode(): DesktopWindowMode {
  if (typeof window === 'undefined') return 'default';

  try {
    const pathname = window.location.pathname;
    if (pathname === '/floating') return 'floating';
    if (pathname === '/overlay') return 'overlay';
    if (pathname === '/recorder-hud') return 'recorder-hud';

    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'overlay') return 'overlay';
    if (mode === 'floating') return 'floating';
    if (mode === 'recorder-hud') return 'recorder-hud';
  } catch {
    // Invalid location state falls back to the main Desktop shell.
  }
  return 'default';
}

// Renderer zoom is document font scaling. The native View menu and the zoom
// shortcuts turn the same dial, so both go through these.
const ZOOM_STEP = 1.1;

function zoomBy(factor: number) {
  const current = parseFloat(getComputedStyle(document.documentElement).fontSize);
  document.documentElement.style.fontSize = `${current * factor}px`;
}

function resetZoom() {
  document.documentElement.style.fontSize = '';
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
  const uiScale = useSettingsStore((s) => s.windowPreferences?.uiScale ?? 100);
  const reduceMotion = useSettingsStore((s) => s.windowPreferences?.reduceMotion ?? false);
  useEffect(() => {
    if (dyslexicFont) {
      document.documentElement.classList.add('dyslexic-font');
    } else {
      document.documentElement.classList.remove('dyslexic-font');
    }
  }, [dyslexicFont]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${uiScale}%`;
  }, [uiScale]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  }, [theme, setTheme]);

  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const sessionValidated = useAuthStore((state) => state.sessionValidated);
  const authenticatedUserId = useAuthStore((state) => state.user?.id ?? null);
  const cloudSessionEpoch = useAuthStore((state) => state.cloudSessionEpoch);
  const accountPlan = useAuthStore((state) => state.plan);
  const appMode = useAppModeStore((s) => s.mode);
  const isCloudMode = useAppModeStore((s) => s.mode === 'cloud');
  const hasCloudSession = useAuthStore(selectHasCloudAccountSession);
  const conversationBoundaryRef = useRef<string | null>(null);
  const [conversationBoundaryReady, setConversationBoundaryReady] = useState(false);
  const [conversationBoundaryError, setConversationBoundaryError] = useState<string | null>(null);
  const [conversationBoundaryRetry, setConversationBoundaryRetry] = useState(0);
  const [modelCatalogError, setModelCatalogError] = useState<string | null>(null);
  const [modelCatalogRetry, setModelCatalogRetry] = useState(0);
  const expectedConversationBoundaryKey = `${appMode}:${
    appMode === 'cloud'
      ? `${authenticatedUserId ?? 'signed-out'}:${hasCloudSession ? 'connected' : 'disconnected'}`
      : 'device'
  }`;

  // Hydrate the conversation set owned by the active execution boundary.
  // `chatStorageMode` is a separate, explicit synchronization preference and
  // must never be rewritten as a side effect of switching Local/Cloud mode.
  useEffect(() => {
    let cancelled = false;
    const boundaryKey = expectedConversationBoundaryKey;
    setConversationBoundaryReady(false);
    setConversationBoundaryError(null);

    const hydrateBoundary = async () => {
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
        // Projects are NOT part of the chat boundary: a 429/500/cold-start on
        // `/api/projects` must not decide whether chat can open. `loadProjects`
        // already records its own `error` on the project store for the projects
        // surface to render, so it is loaded without `throwOnError` and only a
        // conversation-list failure can reach the boundary error path below.
        await Promise.all([
          useDesktopChatStore.getState().loadConversations(authenticatedUserId),
          useProjectStore.getState().loadProjects(),
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

      // Same reasoning as the cloud branch: a project-list failure is scoped to
      // the projects surface and must never gate Local chat either.
      await Promise.all([
        useDesktopChatStore.getState().loadConversations(resolveDesktopChatOwnerId()),
        useProjectStore.getState().loadProjects(),
      ]);
    };

    void hydrateBoundary()
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
          const boundaryIsCurrent = conversationBoundaryRef.current === boundaryKey;
          const boundaryCanCompose =
            appMode !== 'cloud' || (hasCloudSession && Boolean(authenticatedUserId));

          // Loading an empty conversation list leaves activeConversationId
          // null. The shared picker can still project the persisted Cloud mode,
          // but useChat deliberately requires an explicit conversation
          // executionMode before sending. Seed one boundary-owned draft before
          // mounting the shell so an empty or degraded boundary never exposes
          // a composer whose Send action only produces a fail-closed toast.
          if (boundaryIsCurrent && boundaryCanCompose) {
            useDesktopChatStore.getState().ensureActiveConversation();
          }

          // A failed hydration must NOT strand the app on the boot skeleton or
          // a full-screen alert. Once the boundary itself has been established
          // (stores reset + ref claimed) the shell mounts and the failure is
          // reported inline, so composer, sidebar and ChatInterface stay usable
          // (web precedent: `useConversations` only calls setError and the chat
          // page keeps rendering).
          setConversationBoundaryReady(boundaryIsCurrent);
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

  useEffect(() => {
    if (!isTauri) return;

    return useDesktopChatStore.subscribe(
      (state) => state.activeConversationId,
      (conversationId, previousConversationId) => {
        if (conversationId === previousConversationId) return;
        void clearSessionToolApprovals().catch((error) => {
          console.error(
            '[FolderAccess] Failed to revoke task-scoped approvals after changing chats:',
            error,
          );
          toast.error(
            'Folder permissions from the previous chat could not be cleared. Restart AGI before running another local tool.',
          );
        });
      },
    );
  }, []);

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
    registerCleanup(initializeCoworkDispatchRuntime());

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

        // Register the Managed Cloud provider if a validated session already
        // exists. CloudAccountAuth is the sole owner of native credential/base
        // URL persistence and completes that work before auth becomes ready;
        // duplicating token writes here could let an older account overwrite a
        // newer session after an account switch.
        if (isTauri) {
          await runStartupStep(
            'Managed cloud provider initialization',
            async () => {
              // Initialize only in Managed Cloud mode. Local and BYOK chat must
              // not wait on or hydrate managed auth.
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
  useLayoutEffect(() => {
    let cancelled = false;
    // Clear the previous execution plane synchronously. Model discovery is
    // asynchronous, so retaining the old list would temporarily present a
    // Local/BYOK model as Cloud-capable (or a managed model as Local-capable).
    const initialModelStore = useChatModelStore.getState();
    initialModelStore.setModels([]);
    initialModelStore.selectModel('');
    setModelCatalogError(null);

    async function initModels() {
      const currentMode = appMode;
      try {
        if (cancelled) return;

        if (currentMode === 'cloud' && !hasCloudSession) {
          const modelStore = useChatModelStore.getState();
          modelStore.setModels([]);
          modelStore.selectModel('');
          return;
        }

        if (currentMode === 'cloud') {
          // The native credential is projected before the account snapshot
          // finishes. Do not briefly turn the public all-model catalog into an
          // entitlement claim while the effective plan is still unknown — but
          // do not leave Cloud with zero selectable models forever either.
          // `resolveDesktopCloudPickerModels` returns [] for a null plan, so a
          // transient /api/me failure used to make Cloud chat unusable with no
          // recovery. Once the tier fetch has actually FAILED, fall back to the
          // lowest tier (web's /api/me defaults to 'free' for the same reason);
          // the degraded-account banner above explains the downgrade and its
          // Retry restores the real tier. Entitlement is still enforced
          // server-side on every request.
          const effectivePlan =
            accountPlan ?? (subscriptionFetchStatus === 'failed' ? ('free' as const) : null);
          if (!effectivePlan) {
            const modelStore = useChatModelStore.getState();
            modelStore.setModels([]);
            modelStore.selectModel('');
            return;
          }

          const discoveredModels = await getCloudModels();
          if (cancelled) return;
          const entitledModels = resolveDesktopCloudPickerModels(discoveredModels, effectivePlan);
          if (entitledModels.length === 0) {
            throw new Error('No managed models are available for this account and Desktop.');
          }

          const modelStore = useChatModelStore.getState();
          modelStore.setModels(
            entitledModels.map((model) =>
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
          const isLocal = isLocalProvider(provider);
          const isManagedProvider = provider === 'managed_cloud' || provider === 'managed-cloud';
          const isReachable = model.available === true;
          const isConfiguredByok = isReachable && !isLocal && !isManagedProvider;

          if (currentMode === 'local') {
            return (isLocal && isReachable) || isConfiguredByok;
          }

          return isManagedProvider || model.id.startsWith('auto');
        });
        const chatModels = visibleModels.map((model) => {
          const provider = model.provider.toLowerCase();
          const isLocal = isLocalProvider(provider);
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
        const modelStore = useChatModelStore.getState();
        modelStore.setModels([]);
        modelStore.selectModel('');
        const message =
          currentMode === 'local'
            ? 'No verified local or BYOK model is reachable. Start a local runtime or configure a provider in Settings.'
            : 'The managed model catalog is unavailable. Retry after the connection recovers.';
        setModelCatalogError(message);
        toast.error(message);
      }
    }
    void initModels();
    return () => {
      cancelled = true;
    };
  }, [
    accountPlan,
    appMode,
    authenticatedUserId,
    hasCloudSession,
    modelCatalogRetry,
    subscriptionFetchStatus,
  ]);

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
      const detail = (e as CustomEvent).detail as { type: string; tab?: string; content?: string };
      if (detail.type === 'open-settings') {
        openSettingsDialog((detail.tab as Parameters<typeof openSettingsDialog>[0]) ?? 'general');
      } else if (detail.type === 'keyboard-shortcuts') {
        useSettingsDialogStore.getState().openShortcuts();
      } else if (detail.type === 'logout') {
        void useAuthStore.getState().signOut();
      } else if (detail.type === 'open-plans-modal') {
        setPlansModalOpen(true);
      } else if (detail.type === 'fix-bug' && detail.content) {
        // From ArtifactPanel's "Fix Bug" affordance — queue the error + code
        // as an outgoing user message via the same externalSendRequest path
        // Quick Query uses.
        ensureActiveConversation();
        setExternalSendRequest({ id: crypto.randomUUID(), content: detail.content });
      }
    };
    window.addEventListener('chat:action', handleChatAction);
    return () => window.removeEventListener('chat:action', handleChatAction);
  }, [openSettingsDialog, ensureActiveConversation]);

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
              zoomBy(ZOOM_STEP);
              break;
            case 'zoom_out':
              zoomBy(1 / ZOOM_STEP);
              break;
            case 'actual_size':
              resetZoom();
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
    if (isTauri) {
      try {
        await clearSessionToolApprovals();
      } catch (error) {
        console.error('[FolderAccess] Failed to revoke task-scoped approvals:', error);
        toast.error('Could not start a new chat until task-scoped folder permissions are cleared.');
        return;
      }
    }
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

  // Every in-app shortcut is dispatched here. The map is keyed by
  // RendererShortcutAction, so a row cannot be added to constants/shortcuts.ts
  // without a handler on this side — the build fails first. Keys owned by the
  // native window menu (New Conversation, Settings, Find, Reload, the View
  // menu's zoom items, Fullscreen, Hide) are not routed here: the OS consumes
  // a menu key equivalent before the webview sees the keydown, so they stay in
  // `window_menu.rs` and reach the app through the `menu_action` listener.
  const shortcutHandlers = useMemo<Record<RendererShortcutAction, () => void>>(
    () => ({
      'app.search': () => useSearchModal.getState().toggle(),
      'app.commandPalette': () => setCommandPaletteOpen((open) => !open),
      'model.select': () => openSettingsDialog(isCloudMode ? 'capabilities' : 'models-keys'),
      'window.toggleSidebar': () => {
        const ui = useSidecarStore.getState();
        ui.setSidebarCollapsed(!ui.sidebarCollapsed);
      },
      'window.minimize': () => void actions.minimize(),
    }),
    [actions, isCloudMode, openSettingsDialog],
  );

  const customKeybindings = useSettingsStore((s) => s.customKeybindings);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of RENDERER_SHORTCUTS) {
        if (!matchesBinding(event, resolveBinding(shortcut, customKeybindings))) continue;
        event.preventDefault();
        shortcutHandlers[shortcut.action]();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [customKeybindings, shortcutHandlers]);

  // The Rust registry rebuilds itself from `with_defaults()` on every launch,
  // so a rebound OS-level hotkey only reaches the OS again if the shell
  // re-applies it once settings have hydrated.
  useEffect(() => {
    if (!isTauri) return;

    let cancelled = false;
    void (async () => {
      await waitForSettingsHydration();
      if (cancelled) return;

      const saved = useSettingsStore.getState().customKeybindings;
      const { update } = useShortcutStore.getState();
      for (const shortcut of GLOBAL_SHORTCUTS) {
        const combo = saved[shortcut.id];
        if (!combo) continue;
        try {
          await update(shortcut.backendId, toBackendAccelerator(combo));
        } catch (error) {
          console.error('[App] Failed to re-apply saved hotkey', shortcut.id, error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismissTimeoutWarning = useCallback(() => {
    setIsTimeoutWarningOpen(false);
    setTimeoutWarning(null);
  }, []);

  const runtimeAppMode = isTauri && appMode === 'cloud' && !hasCloudSession ? 'local' : appMode;
  // Credential refreshes keep the same runtime, but a different Cloud account
  // must receive a fresh boundary-scoped runtime. Otherwise the long-lived
  // CloudRuntime correctly rejects account B forever using account A's cached
  // boundary, even though the shell has already rehydrated B's conversations.
  const runtimeAccountId = runtimeAppMode === 'cloud' ? authenticatedUserId : null;
  const runtimeResearchEnabled = useDesktopCloudResearchCapability(
    accountPlan,
    runtimeAppMode === 'cloud',
  );
  const chatRuntime = useMemo(
    () =>
      createDesktopChatRuntimeWithLabeling({
        isTauriHost: isTauri,
        appMode: runtimeAppMode,
        managedAccountId: runtimeAccountId,
        managedResearchEnabled: runtimeResearchEnabled,
      }),
    [runtimeAccountId, runtimeAppMode, runtimeResearchEnabled],
  );
  useEffect(() => registerActiveDesktopChatRuntime(chatRuntime), [chatRuntime]);

  // Keep the shared chat package's "is code execution actually available"
  // signal in sync with this deployment's E2B cut-over flag
  // (`/api/me` `feature_flags.code_execution`, already fetched into
  // `useUnifiedAuthStore` by `cloudAccountAuth.refreshUserData`). The
  // composer's "Run code" toggle (packages/ui/unified-chat) and useChat's
  // send-time gate both read this instead of re-deriving it, so they can
  // never disagree with what the account actually entitles.
  const codeExecutionDeploymentConfigured = useUnifiedAuthStore(
    (s) => s.featureFlags['code_execution'] ?? false,
  );
  const codeExecutionDeploymentEnabled =
    isCloudMode && canUseDesktopCloudCodeExecution(accountPlan, codeExecutionDeploymentConfigured);
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
      // Upgrade CTA on an in-transcript managed quota refusal. Routes to the
      // SAME owned Stripe checkout window the billing settings use — the shared
      // card renders no CTA at all when this is absent, so there is never a
      // button that leads nowhere.
      openUpgrade: (requiredTier: string) => {
        void (async () => {
          const { openCheckout } = await import('./lib/stripeCheckout');
          const { normalizeBillingPlanTier } = await import('@agiworkforce/types');
          const failure = await openCheckout(normalizeBillingPlanTier(requiredTier));
          if (failure) toast.error(failure);
        })().catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : 'Could not open checkout.');
        });
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
        const request = isOurCloudUri
          ? createManagedCloudRequestContext('Managed Cloud generated file')
          : null;
        if (request) {
          const auth = await request.getHeaders();
          if (auth['Authorization']) headers['Authorization'] = auth['Authorization'];
        }
        const res = request
          ? await request.fetch(uri, { headers, credentials: 'include' })
          : await guardedFetch(uri, { headers, credentials: 'include' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const blob = await res.blob();
        request?.assertBoundary();
        return blob;
      },
      fetchCodingCheckpoints: async () => {
        const checkpoints = await useCodingCheckpointStore.getState().listCheckpoints();
        return checkpoints.map((checkpoint) => {
          const firstFilePath = Object.keys(checkpoint.fileSnapshots)[0];
          const parsedTimestamp = Date.parse(checkpoint.timestamp);
          return {
            id: checkpoint.id,
            toolName: 'file-edit',
            ...(firstFilePath ? { filePath: firstFilePath } : {}),
            createdAtMs: Number.isNaN(parsedTimestamp) ? Date.now() : parsedTimestamp,
            description: checkpoint.name,
          };
        });
      },
      rewindCodingCheckpoint: async (checkpointId: string) => {
        const restoredPaths = await useCodingCheckpointStore
          .getState()
          .rewindToCheckpoint(checkpointId);
        if (!restoredPaths) {
          throw new Error('The desktop runtime could not restore this checkpoint.');
        }
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

  // NOTE: a conversation-list failure is reported by the inline
  // `data-testid="conversation-boundary-error"` banner further down, NOT by a
  // full-screen takeover. Blanking the shell for a background list fetch took
  // out chat, composer, sidebar and history at once; the shell now stays
  // mounted and the failure is scoped and retryable.
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
            <OnboardingWelcome
              onComplete={() => setShowOnboarding(false)}
              // Without this the first-run "Cloud Mode" card completed
              // onboarding and dropped the user into Local mode, so the very
              // first screen of a Cloud demo silently chose the wrong trust
              // boundary. Entering Cloud makes the shell render AuthPage.
              onCloudModeSelected={() => useAppModeStore.getState().setMode('cloud')}
            />
          </Suspense>
        )}
        <div className="flex flex-col gap-1">
          <Suspense fallback={null}>
            <StatusBanner />
          </Suspense>
          <Suspense fallback={null}>
            <OfflineIndicator position="top" />
          </Suspense>
          {conversationBoundaryError &&
            conversationBoundaryRef.current === expectedConversationBoundaryKey && (
              <div
                role="alert"
                data-testid="conversation-boundary-error"
                className="border-b border-[var(--chat-destructive)]/30 bg-[var(--chat-destructive)]/10 px-4 py-2 flex items-center justify-between gap-3 text-sm text-[var(--chat-text-primary)]"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--chat-destructive)]" />
                  <span className="truncate">
                    {isCloudMode ? 'Cloud' : 'Local'} conversations could not be loaded.{' '}
                    {conversationBoundaryError}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setConversationBoundaryRetry((attempt) => attempt + 1)}
                    className="inline-flex items-center gap-1.5 text-xs underline hover:opacity-80"
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={() => setConversationBoundaryError(null)}
                    aria-label="Dismiss conversation loading error"
                    className="text-xs underline hover:opacity-80"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          {modelCatalogError && (
            <div
              role="alert"
              data-testid="model-catalog-error"
              className="border-b border-[var(--chat-warning-border)] bg-[var(--chat-warning-bg)] px-4 py-2 flex items-center justify-between gap-3 text-sm text-[var(--chat-warning-fg)]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="truncate">{modelCatalogError}</span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setModelCatalogRetry((attempt) => attempt + 1)}
                  className="inline-flex items-center gap-1.5 text-xs underline hover:opacity-80"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => setModelCatalogError(null)}
                  aria-label="Dismiss model catalog error"
                  className="text-xs underline hover:opacity-80"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
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
                key={
                  isCloudMode
                    ? `managed:${authenticatedUserId ?? 'signed-out'}:${cloudSessionEpoch}`
                    : 'local'
                }
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
                  } else if (view === 'settings') {
                    openSettingsDialog('general');
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
              key={`${authenticatedUserId ?? 'signed-out'}:${cloudSessionEpoch}`}
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
    // Cloud account bootstrap belongs to the main Desktop shell. Auxiliary
    // webviews have independent JS auth services and intentionally do
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
              // The authoritative "this is not a Managed Cloud tenant" marker.
              // selectHasCloudAccountSession reads this flag, not the plan, so
              // the plan field can resolve asynchronously without ever making a
              // real Cloud session look local-only (DES-C17).
              isLocalDeviceAccount: true,
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
      case 'recorder-hud':
        return <RecorderHud />;
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
