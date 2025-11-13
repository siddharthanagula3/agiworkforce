import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

import TitleBar from './components/Layout/TitleBar';
import { Sidebar } from './components/Layout/Sidebar';
import { ChatInterface } from './components/Chat/ChatInterface';
import { AgentChatInterface } from './components/Chat/AgentChatInterface';
import { useWindowManager } from './hooks/useWindowManager';
import { VisualizationLayer } from './components/Overlay/VisualizationLayer';
import CommandPalette, { type CommandOption } from './components/Layout/CommandPalette';
import { useTheme } from './hooks/useTheme';
import { useChatStore } from './stores/chatStore';
import { useTemplateStore } from './stores/templateStore';
import { useOrchestrationStore } from './stores/orchestrationStore';
import { useTeamStore } from './stores/teamStore';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { Button } from './components/ui/Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
import { OnboardingWizard } from './components/Onboarding/OnboardingWizard';
import ErrorToastContainer from './components/errors/ErrorToast';
import useErrorStore from './stores/errorStore';
import { errorReportingService } from './services/errorReporting';
import {
  Plus,
  History,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Minimize2,
  Maximize2,
  RefreshCcw,
} from 'lucide-react';
import { TemplateMarketplace } from './components/templates/TemplateMarketplace';
import { WorkflowBuilder } from './components/orchestration/WorkflowBuilder';
import { TeamDashboard } from './components/teams/TeamDashboard';
import { GovernanceDashboard } from './components/governance/GovernanceDashboard';
import { EmployeesPage } from './pages/EmployeesPage';

export type AppView = 'chat' | 'templates' | 'workflows' | 'teams' | 'governance' | 'employees';

const DesktopShell = () => {
  const { state, actions } = useWindowManager();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [agentChatPosition] = useState<'left' | 'right'>('right');
  const [agentChatVisible, setAgentChatVisible] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [currentView, setCurrentView] = useState<AppView>('chat');
  const { theme, toggleTheme } = useTheme();

  const createConversation = useChatStore((store) => store.createConversation);
  const selectConversation = useChatStore((store) => store.selectConversation);
  const addError = useErrorStore((store) => store.addError);

  const fetchTemplates = useTemplateStore((store) => store.fetchTemplates);
  const fetchInstalledTemplates = useTemplateStore((store) => store.fetchInstalledTemplates);
  const loadWorkflows = useOrchestrationStore((store) => store.loadWorkflows);
  const getUserTeams = useTeamStore((store) => store.getUserTeams);

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

    return () => {
      // Flush error reports on unmount
      void errorReportingService.flush();
    };
  }, []);

  // Check onboarding status on mount
  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const status = await invoke<{ completed: boolean }>('get_onboarding_status');
        setOnboardingComplete(status.completed);
      } catch (error) {
        console.error('Failed to check onboarding status:', error);
        addError({
          type: 'ONBOARDING_ERROR',
          severity: 'warning',
          message: 'Failed to check onboarding status',
          details: error instanceof Error ? error.message : String(error),
        });
        setOnboardingComplete(true); // Assume complete on error
      }
    };
    void checkOnboarding();
  }, [addError]);

  // Initialize stores on mount
  useEffect(() => {
    const initializeStores = async () => {
      try {
        // Initialize templates
        await Promise.all([fetchTemplates(), fetchInstalledTemplates()]);

        // Initialize workflows (using default user ID for now)
        await loadWorkflows('default-user');

        // Initialize teams (using default user ID for now)
        await getUserTeams('default-user');
      } catch (error) {
        console.error('Failed to initialize stores:', error);
        addError({
          type: 'INITIALIZATION_ERROR',
          severity: 'warning',
          message: 'Failed to initialize some features',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    };

    if (onboardingComplete) {
      void initializeStores();
    }
  }, [
    onboardingComplete,
    fetchTemplates,
    fetchInstalledTemplates,
    loadWorkflows,
    getUserTeams,
    addError,
  ]);

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

  const startNewAutomation = useCallback(async () => {
    const id = await createConversation('New Task');
    await selectConversation(id);
  }, [createConversation, selectConversation]);

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
        id: 'agent.new-task',
        title: 'Start new automation task',
        group: 'Agent',
        icon: Plus,
        action: () => void startNewAutomation(),
      }),
      buildOption({
        id: 'agent.toggle-sidebar',
        title: sidebarCollapsed ? 'Show conversation list' : 'Hide conversation list',
        group: 'Navigation',
        icon: History,
        action: () => setSidebarCollapsed((prev) => !prev),
        active: !sidebarCollapsed,
      }),
      buildOption({
        id: 'agent.open-settings',
        title: 'Open settings',
        group: 'Navigation',
        icon: SettingsIcon,
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
  }, [
    actions,
    sidebarCollapsed,
    openSettings,
    startNewAutomation,
    state.maximized,
    theme,
    toggleTheme,
    isMac,
  ]);

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
    return <OnboardingWizard onComplete={() => setOnboardingComplete(true)} />;
  }

  const renderMainContent = () => {
    switch (currentView) {
      case 'employees':
        return <EmployeesPage />;
      case 'templates':
        return <TemplateMarketplace />;
      case 'workflows':
        return <WorkflowBuilder />;
      case 'teams':
        return <TeamDashboard />;
      case 'governance':
        return <GovernanceDashboard />;
      case 'chat':
      default:
        return (
          <div className="flex flex-1 overflow-hidden min-w-0">
            {/* Agent Chat (Left) */}
            {agentChatVisible && agentChatPosition === 'left' && (
              <>
                <AgentChatInterface className="w-96 shrink-0" position="left" />
                <div className="w-px bg-border shrink-0" />
              </>
            )}

            {/* Main Chat Interface */}
            <div className="flex-1 overflow-hidden min-w-0">
              <ChatInterface className="h-full" />
            </div>

            {/* Agent Chat (Right) */}
            {agentChatVisible && agentChatPosition === 'right' && (
              <>
                <div className="w-px bg-border shrink-0" />
                <AgentChatInterface className="w-96 shrink-0" position="right" />
              </>
            )}

            {/* Toggle Button */}
            {!agentChatVisible && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute bottom-4 right-4 z-10"
                onClick={() => setAgentChatVisible(true)}
              >
                {agentChatPosition === 'right' ? (
                  <ChevronLeft className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      <TitleBar
        state={{ focused: state.focused, maximized: state.maximized }}
        actions={actions}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        commandShortcutHint={commandShortcutHint}
      />
      <main className="flex flex-1 overflow-hidden min-h-0 min-w-0">
        {!sidebarCollapsed && (
          <Sidebar
            className="shrink-0"
            onOpenSettings={() => setSettingsPanelOpen(true)}
            currentView={currentView}
            onViewChange={setCurrentView}
          />
        )}
        {renderMainContent()}
      </main>
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        options={commandOptions}
      />
      <SettingsPanel open={settingsPanelOpen} onOpenChange={setSettingsPanelOpen} />
      <ErrorToastContainer position="top-right" />
    </div>
  );
};

const App = () => {
  const isOverlayMode =
    typeof window !== 'undefined' && window.location.search.includes('mode=overlay');

  return <ErrorBoundary>{isOverlayMode ? <VisualizationLayer /> : <DesktopShell />}</ErrorBoundary>;
};

export default App;
