import React from 'react';
import { PanelRightClose, PanelRightOpen, Plus } from 'lucide-react';

import { cn } from '../../lib/utils';

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
  sidebarItems: SidebarItem[];
  onNewChat: () => void;
  children: React.ReactNode;
  composer: React.ReactNode;
  sidecar?: React.ReactNode;
  sidecarOpen?: boolean;
  onToggleSidecar?: () => void;
  isEmptyState?: boolean;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  headerLeft,
  headerRight,
  sidebarItems,
  onNewChat,
  children,
  composer,
  sidecar,
  sidecarOpen = true,
  onToggleSidecar,
  isEmptyState = false,
}) => {
  return (
    <div className="flex h-full w-full bg-zinc-950 font-sans text-zinc-100">
      {/* Left Sidebar */}
      <aside className="flex h-full w-[260px] flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-300">
            New Chat
          </div>
          <button
            type="button"
            onClick={onNewChat}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-white"
          >
            <Plus className="h-4 w-4" />
            <span>Start</span>
          </button>
        </div>

        <div className="px-4 pb-2 text-xs uppercase tracking-[0.1em] text-zinc-500">History</div>
        <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-6">
          {sidebarItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/60 px-4 py-5 text-sm text-zinc-400">
              No conversations yet. Start a new chat to begin.
            </div>
          ) : (
            sidebarItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={cn(
                  'w-full rounded-xl border border-transparent px-3 py-3 text-left transition-all duration-150',
                  item.active
                    ? 'border-zinc-700 bg-zinc-800 shadow-inner'
                    : 'bg-zinc-900/40 hover:border-zinc-800 hover:bg-zinc-900',
                )}
              >
                <div className="text-sm font-semibold text-zinc-50">{item.title}</div>
                {item.subtitle ? (
                  <div className="mt-1 line-clamp-1 text-xs text-zinc-400">{item.subtitle}</div>
                ) : null}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main + Sidecar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[60px] items-center justify-between border-b border-zinc-800 bg-zinc-950/90 px-6 backdrop-blur">
          <div className="flex items-center gap-3">{headerLeft}</div>
          <div className="flex items-center gap-3">
            {onToggleSidecar ? (
              <button
                type="button"
                onClick={onToggleSidecar}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/80 text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
                aria-label={sidecarOpen ? 'Hide side panel' : 'Show side panel'}
              >
                {sidecarOpen ? (
                  <PanelRightClose className="h-5 w-5" />
                ) : (
                  <PanelRightOpen className="h-5 w-5" />
                )}
              </button>
            ) : null}
            {headerRight}
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          <main className="flex flex-1 min-h-0 overflow-hidden">
            <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col px-6 py-8">
              {isEmptyState ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-8">
                  {children ? (
                    <div className="w-full text-center text-sm text-zinc-400">{children}</div>
                  ) : null}
                  <div className="w-full max-w-2xl">{composer}</div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
                  <div className="mt-6 w-full max-w-3xl self-center">{composer}</div>
                </>
              )}
            </div>
          </main>

          {sidecar && sidecarOpen ? (
            <aside className="flex h-full w-[350px] flex-col border-l border-zinc-800 bg-zinc-900/80 backdrop-blur">
              {sidecar}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
