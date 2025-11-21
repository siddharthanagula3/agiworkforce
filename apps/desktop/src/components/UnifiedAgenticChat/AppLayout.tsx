import React, { useState, useEffect } from 'react';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { Sidebar } from './Sidebar';
import { SidecarPanel } from './SidecarPanel';
import { CommandPalette } from './CommandPalette';

interface AppLayoutProps {
  children: React.ReactNode;
  onOpenSettings?: () => void;
}

export function AppLayout({ children, onOpenSettings }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const sidecarState = useUnifiedChatStore((state) => state.sidecar);

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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 font-sans text-zinc-100 antialiased">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onOpenSettings={onOpenSettings}
      />

      {/* Main Content Area */}
      <main className="flex flex-1 min-h-0 flex-col overflow-hidden">
        {/* Centered Column */}
        <div className="flex h-full flex-col">
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 py-6">{children}</div>
        </div>
      </main>

      {/* Sidecar Panel */}
      {sidecarState.isOpen && <SidecarPanel />}

      {/* Command Palette (Cmd+K) */}
      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
    </div>
  );
}

export default AppLayout;
