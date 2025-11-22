import React, { useState, useEffect } from 'react';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { Sidebar } from './Sidebar';
import { SidecarPanel } from './SidecarPanel';
import { CommandPalette } from './CommandPalette';
import { cn } from '../../lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
  onOpenSettings?: () => void;
}

export function AppLayout({ children, onOpenSettings }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const sidecarState = useUnifiedChatStore((state) => state.sidecar);
  const messages = useUnifiedChatStore((state) => state.messages);

  // Global Cmd/Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
      />

      {/* Main Content Area */}
      <main
        className={cn(
          'flex flex-1 min-h-0 flex-col overflow-hidden transition-all duration-300',
          sidecarState.isOpen && 'mr-[600px]', // Account for sidecar width
        )}
      >
        {/* Content Container - Full height to allow proper floating input positioning */}
        <div className="relative flex h-full flex-col">
          {/* Message Area - Takes full height minus floating input space */}
          <div className="flex-1 overflow-y-auto pb-32">
            <div className="mx-auto w-full max-w-3xl px-4 py-6">{children}</div>
          </div>

          {/* Empty State Branding */}
          {isEmptyState && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="mb-4 mx-auto w-24 h-24 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-lg">
                  <span className="text-4xl font-bold text-white">AGI</span>
                </div>
                <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  AGI Workforce
                </h1>
                <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                  Your intelligent workspace assistant. Start a conversation or choose a focus mode
                  to begin.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Sidecar Panel - Fixed position */}
      {sidecarState.isOpen && <SidecarPanel />}

      {/* Command Palette (Cmd+K) */}
      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />

      {/* Gradient Overlay for depth */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-cream-50 dark:from-charcoal-900 to-transparent pointer-events-none z-30" />
    </div>
  );
}

export default AppLayout;
