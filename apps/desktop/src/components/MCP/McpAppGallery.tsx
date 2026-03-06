/**
 * McpAppGallery
 *
 * Panel showing all MCP apps registered in the current session.
 * Provides server-based filtering and a clear-all action.
 */

import React, { memo, useMemo, useState } from 'react';
import { Filter, LayoutGrid, Trash2, X, Boxes } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useMcpAppStore } from '../../stores/mcpAppStore';
import { McpAppCard } from './McpAppCard';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface McpAppGalleryProps {
  onClose?: () => void;
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

const McpAppGalleryComponent: React.FC<McpAppGalleryProps> = ({ onClose, className }) => {
  const apps = useMcpAppStore((state) => state.apps);
  const clearAll = useMcpAppStore((state) => state.clearAll);
  const removeApp = useMcpAppStore((state) => state.removeApp);

  const [serverFilter, setServerFilter] = useState<string | null>(null);

  // Derive sorted apps array and unique server list
  const { sortedApps, servers } = useMemo(() => {
    const appsArray = Object.values(apps).sort((a, b) => b.timestamp - a.timestamp);
    const uniqueServers = Array.from(new Set(appsArray.map((a) => a.mcpServer))).sort();
    return { sortedApps: appsArray, servers: uniqueServers };
  }, [apps]);

  const filteredApps = useMemo(() => {
    if (!serverFilter) return sortedApps;
    return sortedApps.filter((a) => a.mcpServer === serverFilter);
  }, [sortedApps, serverFilter]);

  const appCount = sortedApps.length;

  return (
    <div
      className={cn('flex flex-col h-full bg-zinc-950 text-zinc-100', className)}
      aria-label="MCP Apps Gallery"
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-teal-400" />
          <h2 className="text-sm font-semibold text-white">MCP Apps</h2>
          {appCount > 0 && (
            <span className="rounded-full bg-teal-900/50 border border-teal-500/30 px-1.5 py-0.5 text-[10px] font-medium text-teal-400">
              {appCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {appCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
              aria-label="Clear all MCP apps"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear all
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close MCP Apps panel"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Server filter bar ────────────────────────────────────────────────── */}
      {servers.length > 1 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 shrink-0 overflow-x-auto">
          <Filter className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
          <button
            type="button"
            onClick={() => setServerFilter(null)}
            className={cn(
              'shrink-0 rounded-full px-2.5 py-0.5 text-xs transition-colors',
              serverFilter === null
                ? 'bg-teal-500/20 text-teal-400 border border-teal-500/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent',
            )}
          >
            All
          </button>
          {servers.map((server) => (
            <button
              key={server}
              type="button"
              onClick={() => setServerFilter(server === serverFilter ? null : server)}
              className={cn(
                'shrink-0 rounded-full px-2.5 py-0.5 text-xs transition-colors',
                serverFilter === server
                  ? 'bg-teal-500/20 text-teal-400 border border-teal-500/40'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent',
              )}
            >
              {server}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {filteredApps.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 border border-white/10">
              <Boxes className="h-7 w-7 text-zinc-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-300">
                {serverFilter ? 'No apps from this server' : 'No MCP apps loaded this session'}
              </p>
              <p className="mt-1 text-xs text-zinc-500 max-w-[260px]">
                {serverFilter
                  ? `Switch the filter to see apps from other servers.`
                  : 'Connect MCP tools that support rich UI. When a tool returns an interactive app, it will appear here.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4">
            {filteredApps.map((app) => (
              <div key={app.id} className="relative group">
                <McpAppCard app={app} defaultExpanded={false} />
                {/* Per-card remove button */}
                <button
                  type="button"
                  onClick={() => removeApp(app.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 rounded-md p-1 text-zinc-500 hover:text-red-400 hover:bg-red-900/20 transition-all"
                  aria-label={`Remove app ${app.toolName}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

McpAppGalleryComponent.displayName = 'McpAppGallery';

export const McpAppGallery = memo(McpAppGalleryComponent);
