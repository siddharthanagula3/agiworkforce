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
import { resolveAccountDisplayName } from '@agiworkforce/utils/display-name';
import { registerChatStoreStateReader } from './stores/chat/chatStoreRef';
import { useUnifiedAuthStore } from './stores/auth';
import { isElectronHost, isTauri, invoke, listen } from './lib/tauri-mock';
import { toast } from 'sonner';
import { useVoiceHotkey } from './hooks/useVoiceHotkey';
import { onGlobalVoiceHotkey } from './lib/tauri-electron/voice-hotkey';
import { useQuickQueryDoubleTap } from './hooks/useQuickQueryDoubleTap';
import { useDesktopCloudResearchCapability } from './hooks/useDesktopCloudResearchCapability';
import { guardedFetch } from './lib/egressGuard';
import { subscribeToLocalModelCatalogChanges } from './lib/localModelCatalog';
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
import { undoLastChange } from './features/undo/undoLastChange';
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
import { getDesktopSubscriptionOwnerPolicy } from './lib/subscriptionOwnership';

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
const SpokenReplies = lazy(() =>
  import('./features/voice/SpokenReplies').then((m) => ({
    default: m.SpokenReplies,
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

  const hasSelectedMode = useAppModeStore((s) => s.hasSelectedMode);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    setShowOnboarding(!hasSelectedMode);
  }, [hasSelectedMode]);

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
  const subscriptionSource = useAuthStore((state) => state.subscriptionSource);
  const subscriptionStatus = useAuthStore((state) => state.subscriptionStatus);
  const appMode = useAppModeStore((s) => s.mode);
  const isCloudMode = useAppModeStore((s) => s.mode === 'cloud');
  const hasCloudSession = useAuthStore(selectHasCloudAccountSession);
  const conversationBoundaryRef = useRef<string | null>(null);
  const [conversationBoundaryReady, setConversationBoundaryReady] = useState(false);
  const [conversationBoundaryError, setConversationBoundaryError] = useState<string | null>(null);
  const [conversationBoundaryRetry, setConversationBoundaryRetry] = useState(0);
  const [modelCatalogError, setModelCatalogError] = useState<string | null>(null);
  const [modelCatalogRetry, setModelCatalogRetry] = useState(0);
  const modelCatalogBoundaryRef = useRef<string | null>(null);
  const expectedConversationBoundaryKey = `${appMode}:${
    appMode === 'cloud'
      ? `${authenticatedUserId ?? 'signed-out'}:${hasCloudSession ? 'connected' : 'disconnected'}`
      : 'device'
  }`;

  useEffect(
    () =>
      subscribeToLocalModelCatalogChanges(() => {
        if (useAppModeStore.getState().mode === 'local') {
          setModelCatalogRetry((currentRevision) => currentRevision + 1);
        }
      }),
    [],
  );

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

          if (boundaryIsCurrent && boundaryCanCompose) {
            useDesktopChatStore.getState().ensureActiveConversation();
          }

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

  useEffect(() => {
    if (sessionValidated) return;
    const id = window.setTimeout(() => {
      if (!useAuthStore.getState().sessionValidated) {
        useAuthStore.getState().setSessionValidated(true);
      }
    }, 8_000);
    return () => window.clearTimeout(id);
  }, [sessionValidated]);

  const subscriptionFetchStatus = useAccountStore((state) => state.subscriptionFetchStatus);
  const modelCatalogBoundaryKey =
    appMode === 'local'
      ? 'local:device'
      : `cloud:${authenticatedUserId ?? 'signed-out'}:${cloudSessionEpoch}`;
  const modelCatalogDependencyKey =
    appMode === 'local'
      ? modelCatalogBoundaryKey
      : `${modelCatalogBoundaryKey}:${hasCloudSession ? 'connected' : 'disconnected'}:${
          accountPlan ?? 'resolving'
        }:${subscriptionFetchStatus}`;

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

      if (message.includes('listeners[eventId]')) {
        console.debug('[Tauri] Suppressed internal event cleanup error');
        return;
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
      registerCleanup(initCloudSyncScheduler());
    }

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
        await runStartupStep('Settings hydration', () => waitForSettingsHydration());
        if (disposed) return;

        await runStartupStep(
          'Settings synchronization',
          () => useSettingsStore.getState().loadSettings(),
          { notify: true },
        );
        if (!disposed) {
          registerCleanup(initManagedCloudSettingsSync());
        }

        if (isTauri) {
          await runStartupStep('Window preference restore', async () => {
            const settings = useSettingsStore.getState();
            const prefs = settings.windowPreferences;

            if (prefs?.dockOnStartup === 'left' || prefs?.dockOnStartup === 'right') {
              await invoke('window_dock', { position: prefs.dockOnStartup });
            } else if (prefs?.startupPosition === 'center') {
              const { getCurrentWindow } = await import('@tauri-apps/api/window');
              const win = getCurrentWindow();
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

        if (isTauri) {
          await runStartupStep('Ollama health monitor', async () => {
            const { initializeOllamaHealthService } =
              await import('./services/ollamaHealthService');
            const cleanup = initializeOllamaHealthService();
            registerCleanup(cleanup);
          });
        }

        if (disposed) return;
        const { useCustomInstructionsStore } = await import('./stores/customInstructionsStore');
        await runStartupStep('Custom instructions sync', async () => {
          await useCustomInstructionsStore.getState().loadFromBackend();
        });
        if (disposed) return;

        if (isTauri) {
          await runStartupStep(
            'Managed cloud provider initialization',
            async () => {
              if (selectPrivacyMode(useAppModeStore.getState()) !== 'managed') {
                return;
              }

              await waitForAuthReady();
              if (disposed) return;

              const authState = cloudAccountAuth.getState();
              if (!authState.session?.access_token || disposed) {
                return;
              }

              await invoke('llm_ensure_managed_cloud');

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
      cleanupFns.forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          console.warn('[App] Cleanup function failed:', error);
        }
      });
    };
  }, [addError]);

  useEffect(() => {
    restoreSession();
    ensureActiveConversation();
  }, [restoreSession, ensureActiveConversation]);

  useLayoutEffect(() => {
    let cancelled = false;
    const initialModelStore = useChatModelStore.getState();
    const previousSelectedModelId = initialModelStore.selectedModelId;
    const clearForBoundaryChange = modelCatalogBoundaryRef.current !== modelCatalogBoundaryKey;
    modelCatalogBoundaryRef.current = modelCatalogBoundaryKey;
    initialModelStore.beginModelCatalogLoad(clearForBoundaryChange);
    setModelCatalogError(null);

    async function initModels() {
      const currentMode = appMode;
      const currentAuthState = useAuthStore.getState();
      const currentHasCloudSession = selectHasCloudAccountSession(currentAuthState);
      const currentPlan = currentAuthState.plan;
      const currentSubscriptionFetchStatus = useAccountStore.getState().subscriptionFetchStatus;
      try {
        if (cancelled) return;

        if (currentMode === 'cloud' && !currentHasCloudSession) {
          const modelStore = useChatModelStore.getState();
          modelStore.completeModelCatalogLoad([], '');
          return;
        }

        if (currentMode === 'cloud') {
          const effectivePlan =
            currentPlan ?? (currentSubscriptionFetchStatus === 'failed' ? ('free' as const) : null);
          if (!effectivePlan) {
            return;
          }

          const discoveredModels = await getCloudModels();
          if (cancelled) return;
          const entitledModels = resolveDesktopCloudPickerModels(discoveredModels, effectivePlan);
          if (entitledModels.length === 0) {
            throw new Error('No managed models are available for this account and Desktop.');
          }

          const managedModels = entitledModels.map((model) =>
            createChatModelInfo({
              id: model.id,
              name: model.name,
              provider: model.provider,
              isLocal: false,
              isByok: false,
            }),
          );
          const nextManagedModelId = managedModels.some(
            (model) => model.id === previousSelectedModelId,
          )
            ? previousSelectedModelId
            : managedModels.some((model) => model.id === 'auto')
              ? 'auto'
              : (managedModels[0]?.id ?? '');
          useChatModelStore.getState().completeModelCatalogLoad(managedModels, nextManagedModelId);
          return;
        }

        let rustModels: ReturnType<typeof parseDiscoveredChatModels>;
        if (currentMode === 'local') {
          const catalogFetches: Array<{ source: string; command: string }> = [
            { source: 'registered providers', command: 'llm_get_available_models' },
            { source: 'ollama', command: 'llm_list_ollama_models' },
            { source: 'lmstudio', command: 'llm_list_lmstudio_models' },
            { source: 'llamacpp', command: 'llm_list_llamacpp_models' },
            { source: 'vllm', command: 'llm_list_vllm_models' },
          ];
          const results = await Promise.allSettled(
            catalogFetches.map(({ command }) => invoke<unknown>(command)),
          );
          if (cancelled) return;

          const seenModelIds = new Set<string>();
          rustModels = results.flatMap((result, index) => {
            if (result.status === 'rejected') {
              console.warn(
                `Failed to load ${catalogFetches[index]?.source ?? 'unknown'} models for local picker:`,
                result.reason,
              );
              return [];
            }
            return parseDiscoveredChatModels(result.value).filter((model) => {
              if (seenModelIds.has(model.id)) return false;
              seenModelIds.add(model.id);
              return true;
            });
          });
        } else {
          const rawRustModels = await invoke<unknown>('llm_get_available_models');
          if (cancelled) return;
          rustModels = parseDiscoveredChatModels(rawRustModels);
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
            ...(model.runtimeCapabilities
              ? { runtimeCapabilities: model.runtimeCapabilities }
              : {}),
          });
        });
        if (cancelled) return;
        {
          const nextId =
            currentMode === 'local' &&
            chatModels.some((model) => model.id === previousSelectedModelId)
              ? previousSelectedModelId
              : '';
          useChatModelStore.getState().completeModelCatalogLoad(chatModels, nextId);
        }
      } catch {
        if (cancelled) return;
        const modelStore = useChatModelStore.getState();
        const message =
          currentMode === 'local'
            ? 'No verified local or BYOK model is reachable. Start a local runtime or configure a provider in Settings.'
            : 'The managed model catalog is unavailable. Retry after the connection recovers.';
        modelStore.failModelCatalogLoad(message, clearForBoundaryChange);
        setModelCatalogError(message);
        toast.error(message);
      }
    }
    void initModels();
    return () => {
      cancelled = true;
    };
  }, [appMode, modelCatalogBoundaryKey, modelCatalogDependencyKey, modelCatalogRetry]);

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
            fullName: resolveAccountDisplayName(user.name, user.email),
            email: user.email || '',
            plan: billingState.getCurrentPlan?.() || 'free',
          });
        };

        syncFromAuth();

        const unsub = useAuthStore.subscribe(syncFromAuth);
        return unsub;
      } catch {
        return undefined;
      }
    }
    const cleanup = syncProfile();
    return () => {
      void cleanup?.then((unsub) => unsub?.());
    };
  }, []);

  useQuickQueryDoubleTap(() => setQuickQueryOpen((prev) => !prev));

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
        ensureActiveConversation();
        setExternalSendRequest({ id: crypto.randomUUID(), content: detail.content });
      }
    };
    window.addEventListener('chat:action', handleChatAction);
    return () => window.removeEventListener('chat:action', handleChatAction);
  }, [openSettingsDialog, ensureActiveConversation]);

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

  useEffect(() => {
    const handleOnline = () => {
      useAppModeStore.getState().setOnline(true);
    };

    const handleOffline = () => {
      useAppModeStore.getState().setOnline(false);

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

  const handleQuickQuerySubmit = useCallback(
    (query: string, model: string) => {
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

  useEffect(() => {
    if (!isTauri) return;

    let isMounted = true;
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      try {
        const unlisten = await listen<string>('shortcut_action', (event) => {
          if (!isMounted) return;
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
            // The Rust handler emits `global-hotkey-triggered` as well, and
            // that listener opens the overlay. Acting here too fires it twice.
            case 'quick_query':
              break;
            case 'voice_input':
              void handleVoiceInputRequest();
              break;
            case 'quick_capture':
              void handleCaptureRequest();
              break;
          }
        });

        if (isMounted) {
          unlistenFn = unlisten;
        } else {
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

  useEffect(
    () => onGlobalVoiceHotkey(() => void handleVoiceInputRequest()),
    [handleVoiceInputRequest],
  );

  const openSettings = useCallback(() => openSettingsDialog(), [openSettingsDialog]);

  const shortcutHandlers = useMemo<Record<RendererShortcutAction, () => void>>(
    () => ({
      'app.search': () => useSearchModal.getState().toggle(),
      'app.commandPalette': () => setCommandPaletteOpen((open) => !open),
      'model.select': () => openSettingsDialog(isCloudMode ? 'capabilities' : 'models-keys'),
      'edit.undoLast': () => void undoLastChange(),
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
  const canOfferStripePlanChanges = getDesktopSubscriptionOwnerPolicy(
    subscriptionSource,
    subscriptionStatus,
    subscriptionFetchStatus === 'succeeded',
  ).canStartStripePlanChange;
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
      ...(canOfferStripePlanChanges
        ? {
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
          }
        : {}),
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
    [canOfferStripePlanChanges],
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
    !conversationBoundaryReady ||
    conversationBoundaryRef.current !== expectedConversationBoundaryKey ||
    (isCloudMode && (isAuthLoading || !sessionValidated))
  ) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        {/* Skeleton layout, shown while the cloud session is being validated */}
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
        {isTauri && (
          <Suspense fallback={null}>
            <SpokenReplies />
          </Suspense>
        )}
        {isTauri && showOnboarding && !hasSelectedMode && (
          <Suspense fallback={null}>
            <OnboardingWelcome
              onComplete={() => setShowOnboarding(false)}
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
        {(isTauri || isElectronHost) && (
          <Suspense fallback={null}>
            <UpdateChecker onUpdateNow={openSettings} />
          </Suspense>
        )}
        {(isTauri || isElectronHost) && (
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
        {/* Plans/Pricing modal, triggered by chat:action open-plans-modal */}
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

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
  }, [i18n.language]);

  useEffect(() => {
    if (windowMode !== 'default') return;

    const unsubscribeOrchestrator = initializeAuthOrchestrator();
    const unsubscribeTierRestriction = initializeTaskRoutingTierRestriction();

    let cancelled = false;
    void (async () => {
      try {
        if (cancelled) return;

        await waitForHydration();
        if (cancelled) return;

        if (
          !cloudAccountAuth.isAuthenticated() &&
          isTauri &&
          selectPrivacyMode(useAppModeStore.getState()) === 'local' &&
          !useAuthStore.getState().accessToken
        ) {
          const applyLocalAccount = (id: string) => {
            useAuthStore.getState().setAccount({
              id,
              email: '',
              displayName: 'Local User',
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
