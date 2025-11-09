import { useCallback, useEffect, useMemo, useState } from 'react';

import TitleBar from './components/Layout/TitleBar';
import { Sidebar } from './components/Layout/Sidebar';
import { ChatInterface } from './components/Chat/ChatInterface';
import { AgentChatInterface } from './components/Chat/AgentChatInterface';
import { useWindowManager } from './hooks/useWindowManager';
import { VisualizationLayer } from './components/Overlay/VisualizationLayer';
import CommandPalette, { type CommandOption } from './components/Layout/CommandPalette';
import { useTheme } from './hooks/useTheme';
import { useChatStore } from './stores/chatStore';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { Button } from './components/ui/Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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

const DesktopShell = () => {
  const { state, actions } = useWindowManager();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [agentChatPosition] = useState<'left' | 'right'>('right');
  const [agentChatVisible, setAgentChatVisible] = useState(true);
  const { theme, toggleTheme } = useTheme();

  const createConversation = useChatStore((store) => store.createConversation);
  const selectConversation = useChatStore((store) => store.selectConversation);

  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
  const commandShortcutHint = isMac ? 'Cmd+K' : 'Ctrl+K';

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

  return (
    <div className="flex flex-col h-screen w-screen bg-background overflow-hidden">
      <TitleBar
        state={{ focused: state.focused, maximized: state.maximized }}
        actions={actions}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        commandShortcutHint={commandShortcutHint}
      />
      <main className="flex flex-1 overflow-hidden min-h-0">
        {!sidebarCollapsed && <Sidebar className="shrink-0" />}
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
      </main>
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        options={commandOptions}
      />
      <SettingsPanel open={settingsPanelOpen} onOpenChange={setSettingsPanelOpen} />
    </div>
  );
};

const App = () => {
  const isOverlayMode =
    typeof window !== 'undefined' && window.location.search.includes('mode=overlay');

  if (isOverlayMode) {
    return <VisualizationLayer />;
  }

  return <DesktopShell />;
};

export default App;
