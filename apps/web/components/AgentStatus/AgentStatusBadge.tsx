/**
 * AgentStatusBadge
 *
 * Compact badge showing the number of active agents. Designed for use in
 * the sidebar or dashboard header. Pulses when agents are running.
 */

'use client';

import React from 'react';
import { Bot } from 'lucide-react';
import { useAgentStatusSummary } from '@/stores/agentStatusStore';
import { cn } from '@shared/lib/utils';

interface AgentStatusBadgeProps {
  /** Additional CSS classes. */
  className?: string;
  /** Show the full label (e.g., "2 agents running") or just the count. */
  variant?: 'compact' | 'full';
}

export const AgentStatusBadge: React.FC<AgentStatusBadgeProps> = ({
  className,
  variant = 'compact',
}) => {
  const summary = useAgentStatusSummary();
  const isActive = summary.running > 0;

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'relative flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
          'border transition-colors duration-200',
          isActive
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-white/[0.06] bg-white/[0.03] text-muted-foreground/60',
          className,
        )}
        title={
          isActive
            ? `${summary.running} agent${summary.running === 1 ? '' : 's'} running`
            : 'No active agents'
        }
      >
        <Bot className="h-3.5 w-3.5" />
        {isActive && (
          <>
            <span>{summary.running}</span>
            {/* Pulse indicator */}
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          </>
        )}
        {!isActive && <span>0</span>}
      </div>
    );
  }

  // Full variant — shows descriptive label
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium',
        'border transition-colors duration-200',
        isActive
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-white/[0.06] bg-white/[0.03] text-muted-foreground/60',
        className,
      )}
    >
      <Bot className="h-3.5 w-3.5" />
      {isActive ? (
        <span>
          {summary.running} agent{summary.running === 1 ? '' : 's'} running
        </span>
      ) : (
        <span>Idle</span>
      )}
      {isActive && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
      )}
    </div>
  );
};

export default AgentStatusBadge;
