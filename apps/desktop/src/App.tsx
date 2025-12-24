import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { isTauri } from './lib/tauri-mock';

import CommandPalette, { type CommandOption } from './components/Layout/CommandPalette';
import TitleBar from './components/Layout/TitleBar';
import { useTheme } from './hooks/useTheme';
import { useWindowManager } from './hooks/useWindowManager';
import { initializeAgentStatusListener, useUnifiedChatStore } from './stores/unifiedChatStore';
import { useDeepLink } from './hooks/useDeepLink';

import { CircleUserRound, Maximize2, Minimize2, Moon, Plus, RefreshCcw, Sun } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
import ErrorToastContainer from './components/Errors/ErrorToast';
import { Spinner } from './components/ui/Spinner';
import { TooltipProvider } from './components/ui/Tooltip';
import { errorReportingService } from './services/errorReporting';
import { initializeAccountStore } from './stores/accountStore';
import { initializeAuthStore, useAuthStore } from './stores/authStore';
import { initializeBillingStore } from './stores/billingStore';
import { initializeUsageStore } from './stores/usageStore';
import useErrorStore from './stores/errorStore';

const VisualizationLayer = lazy(() =>
  import('./components/Overlay/VisualizationLayer').then((m) => ({
    default: m.VisualizationLayer,
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
import { UpdateNotifier } from './components/Settings/UpdateNotifier';

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
  const { theme, toggleTheme } = useTheme();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const clearHistory = useUnifiedChatStore((store) => store.clearHistory);
  const ensureActiveConversation = useUnifiedChatStore((store) => store.ensureActiveConversation);
  const addError = useErrorStore((store) => store.addError);

  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
  const commandShortcutHint = isMac ? 'Cmd+K' : 'Ctrl+K';

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
      const { initializeModelStoreFromSettings } = await import('./stores/modelStore');
      await initializeModelStoreFromSettings();
    })();

    return () => {
      void errorReportingService.flush();
    };
  }, []);

  useEffect(() => {
    ensureActiveConversation();
  }, [ensureActiveConversation]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
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
      <div className="flex h-screen w-full flex-col overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
        {!isTauri && (
          <div className="bg-amber-500/20 border-b border-amber-500/50 px-4 py-2 text-center text-sm text-amber-200">
            <strong>Web Development Mode</strong> - Running without Tauri. Some features are mocked.
          </div>
        )}
        <TitleBar
          state={{ focused: state.focused, maximized: state.maximized }}
          actions={actions}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          commandShortcutHint={commandShortcutHint}
        />
        <main className="flex flex-1 min-h-0 min-w-0 bg-zinc-950">
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<LoadingFallback />}>
              <UnifiedAgenticChat
                className="h-full w-full"
                layout="default"
                defaultSidecarOpen={false}
                onOpenSettings={() => setSettingsPanelOpen(true)}
              />
            </Suspense>
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
        <UpdateNotifier onOpenSettings={openSettings} />
        <ErrorToastContainer position="top-right" />
      </div>
    </Suspense>
  );
};

const App = () => {
  useEffect(() => {
    const unsubscribeAuth = initializeAuthStore();
    const unsubscribeAccount = initializeAccountStore();
    const unsubscribeBilling = initializeBillingStore();
    const unsubscribeUsage = initializeUsageStore();
    return () => {
      if (typeof unsubscribeAuth === 'function') {
        unsubscribeAuth();
      }
      if (typeof unsubscribeAccount === 'function') {
        unsubscribeAccount();
      }
      if (typeof unsubscribeBilling === 'function') {
        unsubscribeBilling();
      }
      if (typeof unsubscribeUsage === 'function') {
        unsubscribeUsage();
      }
    };
  }, []);

  useDeepLink();

  const isOverlayMode = (() => {
    if (typeof window === 'undefined') return false;

    try {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode');

      return mode === 'overlay';
    } catch {
      return false;
    }
  })();

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        <Suspense fallback={<LoadingFallback />}>
          {isOverlayMode ? <VisualizationLayer /> : <DesktopShell />}
        </Suspense>
      </TooltipProvider>
    </ErrorBoundary>
  );
};

export default App;
