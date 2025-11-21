import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, GripVertical, Plus } from 'lucide-react';

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

const MIN_SIDECAR_WIDTH = 360;
const MAX_SIDECAR_WIDTH = 960;

export const AppLayout: React.FC<AppLayoutProps> = ({
  headerLeft,
  headerRight,
  activeModel: _activeModel,
  sidebarItems,
  onNewChat,
  children,
  composer,
  isEmptyState = false,
  sidecar,
  sidecarOpen,
  onToggleSidecar: _onToggleSidecar,
}) => {
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [sidecarWidth, setSidecarWidth] = useState(() => {
    if (typeof window === 'undefined') return 560;
    return Math.min(Math.max(window.innerWidth * 0.45, MIN_SIDECAR_WIDTH), MAX_SIDECAR_WIDTH);
  });
  const dragRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.min(
        Math.max(window.innerWidth - event.clientX, MIN_SIDECAR_WIDTH),
        MAX_SIDECAR_WIDTH,
      );
      setSidecarWidth(newWidth);
    };
    const handleUp = () => {
      isDragging.current = false;
      document.body.style.cursor = 'default';
    };
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
  }, []);

  const navWidth = navCollapsed ? 72 : 260;
  const sidecarStyle = useMemo(() => ({ width: sidecarWidth }), [sidecarWidth]);

  return (
    <div className="flex h-full w-full bg-zinc-950 font-sans text-zinc-100 antialiased">
      {/* Left Sidebar */}
      <aside
        className={cn(
          'flex h-full flex-shrink-0 flex-col border-r border-white/5 bg-zinc-900/50 backdrop-blur transition-all duration-200',
        )}
        style={{ width: navWidth }}
      >
        <div className="flex items-center justify-between px-3 py-4">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-zinc-300 hover:border-white/30 hover:text-white"
            onClick={() => setNavCollapsed((prev) => !prev)}
          >
            <ChevronLeft
              className={cn('h-4 w-4 transition-transform', navCollapsed && '-rotate-180')}
            />
          </button>
          {!navCollapsed && (
            <button
              type="button"
              onClick={onNewChat}
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-white"
            >
              <Plus className="h-4 w-4" />
              <span>New chat</span>
            </button>
          )}
        </div>

        {!navCollapsed && (
          <div className="px-4 pb-2 text-xs uppercase tracking-[0.14em] text-zinc-500">
            Chat History
          </div>
        )}
        <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-6">
          {sidebarItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-zinc-900/60 px-4 py-5 text-sm text-zinc-400">
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
                    ? 'border-white/20 bg-white/5 shadow-lg shadow-black/20'
                    : 'bg-zinc-900/40 hover:border-white/10 hover:bg-zinc-900',
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
        <header className="flex h-[48px] items-center justify-between border-b border-white/5 bg-transparent px-6">
          <div className="flex items-center gap-3">{headerLeft}</div>
          <div className="flex items-center gap-3">{headerRight}</div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
            <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col px-6 py-8">
              {isEmptyState ? (
                <div className="flex flex-1 items-center justify-center">
                  {composer ? <motion.div layoutId="composer">{composer}</motion.div> : null}
                </div>
              ) : (
                <>
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1">{children}</div>
                  {composer ? (
                    <motion.div layoutId="composer" className="mt-6">
                      {composer}
                    </motion.div>
                  ) : null}
                </>
              )}
            </div>
          </main>

          {/* Right Sidecar */}
          <AnimatePresence>
            {sidecarOpen && sidecar ? (
              <motion.aside
                className="relative flex h-full shrink-0 flex-col border-l border-white/5 bg-zinc-900/50 backdrop-blur"
                style={sidecarStyle}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: sidecarWidth, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 140, damping: 22 }}
              >
                <div
                  ref={dragRef}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    isDragging.current = true;
                    document.body.style.cursor = 'col-resize';
                  }}
                  className="absolute left-0 top-0 flex h-full w-2 -translate-x-1/2 cursor-col-resize items-center justify-center"
                >
                  <div className="flex h-10 w-6 items-center justify-center rounded-full bg-white/5 text-white/60 shadow-lg shadow-black/30">
                    <GripVertical className="h-4 w-4" />
                  </div>
                </div>
                {sidecar}
              </motion.aside>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
