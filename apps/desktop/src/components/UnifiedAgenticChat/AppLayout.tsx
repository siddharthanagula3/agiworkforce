import React, { useCallback, useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { CommandPalette } from './CommandPalette';
import { EmptyState } from './EmptyState';
import { Sidebar } from './Sidebar';
import { SidecarPanel } from './SidecarPanel';

interface AppLayoutProps {
  children: React.ReactNode;
  onOpenSettings?: () => void;
  onOpenBilling?: () => void;
}

export function AppLayout({ children, onOpenSettings, onOpenBilling }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const sidecarState = useUnifiedChatStore((state) => state.sidecar);
  const messages = useUnifiedChatStore((state) => state.messages);
  const createConversation = useUnifiedChatStore((state) => state.createConversation);
  const addMessage = useUnifiedChatStore((state) => state.addMessage);

  // Handle New Chat Action
  const handleNewChat = useCallback(() => {
    createConversation('New chat');
  }, [createConversation]);

  // Handle suggestion click
  const handleSuggestionClick = useCallback(
    (prompt: string) => {
      addMessage({ role: 'user', content: prompt });
    },
    [addMessage],
  );

  // Global Shortcuts (Cmd+K, Cmd+Shift+O, Cmd+Shift+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Cmd+K: Toggle Command Palette
      if (isMeta && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }

      // Cmd+Shift+S: Toggle Sidebar
      if (isMeta && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }

      // Cmd+Shift+O: New Chat
      if (isMeta && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleNewChat();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewChat]);

  const isEmptyState = messages.length === 0;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-cream-50 dark:bg-charcoal-900 font-sans text-gray-900 dark:text-gray-100 antialiased">
      {/* Background gradient for empty state */}
      {isEmptyState && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 via-transparent to-terra-cotta-500/5" />
        </div>
      )}

      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onOpenSettings={onOpenSettings}
        onOpenBilling={onOpenBilling}
      />

      {/* Main Content Area */}
      <main
        className={cn(
          'flex flex-1 min-h-0 flex-col overflow-hidden transition-all duration-300',
          sidecarState.isOpen && 'mr-[600px]', // Account for sidecar width
        )}
      >
        {/* Content Container */}
        <div className="relative flex h-full flex-col">
          {/* Message Area */}
          <div className="flex-1 overflow-y-auto pb-32 scroll-smooth">
            <div className="mx-auto w-full max-w-3xl px-4 py-6">{children}</div>
          </div>

          {/* Empty State - Content behind input */}
          {isEmptyState && <EmptyState onSuggestionClick={handleSuggestionClick} />}
        </div>
      </main>

      {/* Sidecar Panel - Fixed position */}
      {sidecarState.isOpen && <SidecarPanel />}

      {/* Command Palette (Cmd+K) */}
      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />

      {/* Gradient Overlay for depth at bottom */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-cream-50 via-cream-50/80 to-transparent dark:from-charcoal-900 dark:via-charcoal-900/80 pointer-events-none z-10" />
    </div>
  );
}

export default AppLayout;
