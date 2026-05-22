/**
 * McpAppCard
 *
 * Wrapper card for displaying a sandboxed MCP app in the chat stream.
 * Shows tool name, MCP server badge, security label, collapse/expand, and timestamp.
 */

import React, { memo, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Server } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { McpApp } from '../../stores/mcpAppStore';
import { McpAppRenderer, McpAppSecurityBadge } from './McpAppRenderer';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface McpAppCardProps {
  app: McpApp;
  onAction?: (action: string, data: unknown) => void;
  /** If false the card starts collapsed. Defaults to true. */
  defaultExpanded?: boolean;
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMs / 3_600_000);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

/** Convert snake_case or kebab-case tool name to readable label */
function formatToolName(name: string): string {
  return name.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Component ───────────────────────────────────────────────────────────────

const McpAppCardComponent: React.FC<McpAppCardProps> = ({
  app,
  onAction,
  defaultExpanded = true,
  className,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      className={cn(
        'rounded-xl border border-white/10 bg-zinc-900/60 backdrop-blur-sm overflow-hidden',
        className,
      )}
      role="region"
      aria-label={`MCP App: ${app.toolName}`}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-zinc-900/80 border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          {/* Expand / collapse toggle */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 flex items-center justify-center w-5 h-5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-colors"
            aria-label={expanded ? 'Collapse MCP app' : 'Expand MCP app'}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Tool name */}
          <span className="text-sm font-medium text-zinc-200 truncate">
            {formatToolName(app.toolName)}
          </span>

          {/* "Interactive App" pill */}
          <span className="hidden sm:inline-flex items-center rounded-full bg-teal-900/40 border border-teal-500/30 px-2 py-0.5 text-[10px] font-medium text-teal-400 shrink-0">
            Interactive App
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* MCP server badge */}
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400">
            <Server className="h-2.5 w-2.5" />
            {app.mcpServer}
          </span>

          {/* Security badge */}
          <McpAppSecurityBadge />

          {/* Timestamp */}
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-zinc-500">
            <Clock className="h-2.5 w-2.5" />
            {formatRelativeTime(app.timestamp)}
          </span>
        </div>
      </div>

      {/* ── Body (collapsible) ──────────────────────────────────────────────── */}
      {expanded && (
        <div className="p-2">
          <McpAppRenderer app={app} onAction={onAction} className="rounded-lg" />
        </div>
      )}
    </div>
  );
};

McpAppCardComponent.displayName = 'McpAppCard';

export const McpAppCard = memo(McpAppCardComponent);
