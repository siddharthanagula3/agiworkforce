import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { invoke, isTauri } from './lib/tauri-mock';

import CommandPalette, { type CommandOption } from './components/Layout/CommandPalette';
import TitleBar from './components/Layout/TitleBar';
import { useTheme } from './hooks/useTheme';
import { useWindowManager } from './hooks/useWindowManager';
import { initializeAgentStatusListener, useUnifiedChatStore } from './stores/unifiedChatStore';
// Unused imports removed Nov 16, 2025 (for future use)
import { CircleUserRound, Maximize2, Minimize2, Moon, Plus, RefreshCcw, Sun } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
import ErrorToastContainer from './components/errors/ErrorToast';
import { Spinner } from './components/ui/Spinner';
import { errorReportingService } from './services/errorReporting';
import useErrorStore from './stores/errorStore';
// Lazy load heavy components for better bundle splitting
const VisualizationLayer = lazy(() =>
  import('./components/Overlay/VisualizationLayer').then((m) => ({
    default: m.VisualizationLayer,
  })),
);
const OnboardingWizard = lazy(() =>
  import('./components/onboarding/OnboardingWizardNew').then((m) => ({
    default: m.OnboardingWizardNew,
  })),
);
const SettingsPanel = lazy(() =>
  import('./components/Settings/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
);
const BillingPageDialog = lazy(() =>
  import('./components/pricing/BillingPageDialog').then((m) => ({
    default: m.BillingPageDialog,
  })),
);
const UnifiedAgenticChat = lazy(() =>
  import('./components/UnifiedAgenticChat').then((m) => ({
    default: m.UnifiedAgenticChat,
  })),
);

// Loading fallback component for Suspense
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
  const [billingPageOpen, setBillingPageOpen] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const { theme, toggleTheme } = useTheme();

  const clearHistory = useUnifiedChatStore((store) => store.clearHistory);
  const ensureActiveConversation = useUnifiedChatStore((store) => store.ensureActiveConversation);
  const addError = useErrorStore((store) => store.addError);

  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
  const commandShortcutHint = isMac ? 'Cmd+K' : 'Ctrl+K';

  // Global error handlers
  useEffect(() => {
    // Handle unhandled promise rejections
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

    // Handle general window errors
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

  // Track user actions for error reporting
  useEffect(() => {
    const trackAction = (action: string) => {
      errorReportingService.trackAction(action);
    };

    // Track important user actions
    trackAction('app_loaded');

    // Initialize agent status listener for unified chat
    void initializeAgentStatusListener();

    // Initialize model store from settings if no model is selected
    void (async () => {
      const { initializeModelStoreFromSettings } = await import('./stores/modelStore');
      await initializeModelStoreFromSettings();
    })();

    return () => {
      // Flush error reports on unmount
      void errorReportingService.flush();
    };
  }, []);

  useEffect(() => {
    ensureActiveConversation();
  }, [ensureActiveConversation]);

  // Check onboarding status on mount
  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        // Add timeout to prevent infinite loading
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Onboarding status check timed out')), 3000),
        );

        const statusPromise = invoke<{ completed: boolean }>('get_onboarding_status');

        const status = await Promise.race([statusPromise, timeoutPromise]);
        setOnboardingComplete(status.completed);
      } catch (error) {
        console.error('Failed to check onboarding status:', error);
        addError({
          type: 'ONBOARDING_ERROR',
          severity: 'warning',
          message: 'Failed to check onboarding status',
          details: error instanceof Error ? error.message : String(error),
        });
        // Default to true (skip onboarding) on error to prevent app from being stuck
        setOnboardingComplete(true);
      }
    };
    void checkOnboarding();
  }, [addError]);

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

  // Show loading state while checking onboarding
  if (onboardingComplete === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show onboarding if not complete
  if (!onboardingComplete) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <OnboardingWizard onComplete={() => setOnboardingComplete(true)} />
      </Suspense>
    );
  }

  return (
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
              onOpenBilling={() => setBillingPageOpen(true)}
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
      <Suspense fallback={null}>
        <BillingPageDialog open={billingPageOpen} onOpenChange={setBillingPageOpen} />
      </Suspense>
      <ErrorToastContainer position="top-right" />
    </div>
  );
};

const App = () => {
  // Updated Nov 16, 2025: Added proper URL parameter validation for security
  const isOverlayMode = (() => {
    if (typeof window === 'undefined') return false;

    try {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode');
      // Only accept specific allowed values
      return mode === 'overlay';
    } catch {
      return false;
    }
  })();

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
        {isOverlayMode ? <VisualizationLayer /> : <DesktopShell />}
      </Suspense>
    </ErrorBoundary>
  );
};

export default App;
