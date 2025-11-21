import React from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';

type SidebarItem = {
  id: string;
  title: string;
  subtitle?: string;
  active?: boolean;
  onClick?: () => void;
};

interface AppLayoutProps {
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  activeModel?: string;
  sidebarItems: SidebarItem[];
  onNewChat: () => void;
  children: React.ReactNode;
  composer?: React.ReactNode;
  isEmptyState?: boolean;
  sidecar?: React.ReactNode;
  sidecarOpen: boolean;
  onToggleSidecar: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  headerLeft,
  headerRight,
  activeModel: _activeModel,
  sidebarItems: _sidebarItems,
  onNewChat,
  children,
  composer,
  isEmptyState = false,
  sidecar: _sidecar,
  sidecarOpen: _sidecarOpen,
  onToggleSidecar: _onToggleSidecar,
}) => {
  return (
    <div className="flex h-full w-full flex-col bg-zinc-950 font-sans text-zinc-100 antialiased">
      {/* Simplified Header */}
      <header className="flex h-[52px] items-center justify-between border-b border-white/5 bg-transparent px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onNewChat}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-white"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New chat</span>
          </button>
          {headerLeft}
        </div>
        <div className="flex items-center gap-3">{headerRight}</div>
      </header>

      {/* Centered Main Content */}
      <div className="flex min-h-0 flex-1 flex-col">
        <main className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-4 py-6">
            {isEmptyState ? (
              <div className="flex flex-1 items-center justify-center">
                {composer ? <motion.div layoutId="composer">{composer}</motion.div> : null}
              </div>
            ) : (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
                {composer ? (
                  <motion.div layoutId="composer" className="mt-4">
                    {composer}
                  </motion.div>
                ) : null}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
