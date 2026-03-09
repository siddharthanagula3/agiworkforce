/**
 * AgentStatusPanel
 *
 * Dashboard panel showing all active and recent agent sessions.
 * Subscribes to real-time updates via the agentStatusStore.
 */

'use client';

import React, { useEffect } from 'react';
import { Bot, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import {
  useAgentStatusStore,
  useActiveSessions,
  useRecentAgentSessions,
  useAgentStatusSummary,
} from '@/stores/agentStatusStore';
import { AgentStatusCard } from './AgentStatusCard';
import { AgentStatusBadge } from './AgentStatusBadge';
import { Button } from '@shared/ui/button';
import { cn } from '@shared/lib/utils';

interface AgentStatusPanelProps {
  /** Additional CSS classes. */
  className?: string;
  /** Maximum number of recent sessions to show. */
  maxRecent?: number;
}

export const AgentStatusPanel: React.FC<AgentStatusPanelProps> = ({ className, maxRecent = 5 }) => {
  const { isLoading, isSubscribed, fetchSessions, subscribe, unsubscribe } = useAgentStatusStore();
  const activeSessions = useActiveSessions();
  const recentSessions = useRecentAgentSessions();
  const summary = useAgentStatusSummary();

  // Subscribe on mount, unsubscribe on unmount
  useEffect(() => {
    void fetchSessions();
    subscribe();

    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayRecent = recentSessions.slice(0, maxRecent);
  const hasAnyData = activeSessions.length > 0 || displayRecent.length > 0;

  return (
    <section className={cn('space-y-4', className)} aria-label="Agent status">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Agent Status</h2>
          <AgentStatusBadge variant="compact" />
        </div>
        <div className="flex items-center gap-2">
          {/* Connection status indicator */}
          <div
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
              isSubscribed
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-amber-500/10 text-amber-400',
            )}
            title={isSubscribed ? 'Live updates active' : 'Polling for updates'}
          >
            {isSubscribed ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            <span>{isSubscribed ? 'Live' : 'Polling'}</span>
          </div>

          {/* Manual refresh */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/50 hover:text-foreground"
            onClick={() => void fetchSessions()}
            disabled={isLoading}
            aria-label="Refresh agent status"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && !hasAnyData && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <p className="mt-3 text-xs text-muted-foreground/60">Loading agent status...</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !hasAnyData && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] py-12 backdrop-blur-xl">
          <Bot className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground/60">No agent sessions</p>
          <p className="mt-1 text-xs text-muted-foreground/40">
            Agent status will appear here when tasks are running
          </p>
        </div>
      )}

      {/* Active sessions */}
      {activeSessions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
            Active ({activeSessions.length})
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {activeSessions.map((session) => (
              <AgentStatusCard key={session.id} session={session} />
            ))}
          </div>
        </div>
      )}

      {/* Recent sessions */}
      {displayRecent.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
            Recent
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {displayRecent.map((session) => (
              <AgentStatusCard key={session.id} session={session} />
            ))}
          </div>
        </div>
      )}

      {/* Summary footer */}
      {summary.total > 0 && (
        <div className="flex items-center justify-center gap-6 border-t border-white/[0.06] pt-3 text-xs text-muted-foreground/50">
          <span>{summary.running} running</span>
          <span>{summary.completed} completed</span>
          <span>{summary.failed} failed</span>
        </div>
      )}
    </section>
  );
};

export default AgentStatusPanel;
