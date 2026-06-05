'use client';

import React from 'react';
import { Loader2, Lock, Plus } from 'lucide-react';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
import { cn } from '@shared/lib/utils';
import type { Connector } from '../data/connectors';
import { getConnectorAvailabilityLabel, isConnectorReady } from '../data/connectors';
import { OfficialConnectorLogo } from './OfficialConnectorLogo';

// ─── Time helper ──────────────────────────────────────────────────────────────

export function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── ConnectorCard ────────────────────────────────────────────────────────────

export interface ConnectorCardProps {
  connector: Connector;
  connected: boolean;
  mutating: boolean;
  connectedAt?: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onUpgrade: () => void;
}

export const ConnectorCard: React.FC<ConnectorCardProps> = ({
  connector,
  connected,
  mutating,
  connectedAt,
  onConnect,
  onDisconnect,
  onUpgrade,
}) => {
  const isAvailable = isConnectorReady(connector);
  const hasRealCredentials = connected && isAvailable;
  const availabilityLabel = getConnectorAvailabilityLabel(connector);

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border bg-card p-5 transition-all duration-200',
        hasRealCredentials
          ? 'border-primary/30 bg-primary/5'
          : 'border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.02]',
      )}
    >
      {!isAvailable && (
        <div className="absolute right-3 top-3">
          <Badge
            variant="outline"
            className="border-white/10 px-1.5 py-0 text-[10px] text-muted-foreground"
          >
            {availabilityLabel}
          </Badge>
        </div>
      )}

      {/* Icon + Name */}
      <div className="mb-3 flex items-start gap-3">
        <OfficialConnectorLogo connector={connector} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{connector.name}</h3>
          <p className="text-xs text-muted-foreground">{connector.actionCount} actions</p>
        </div>
      </div>

      {/* Description */}
      <p className="mb-4 flex-1 text-xs leading-relaxed text-muted-foreground/80">
        {connector.description}
      </p>

      {/* Activity timestamp */}
      {hasRealCredentials && connectedAt && (
        <p className="mb-3 text-[10px] text-muted-foreground/60">
          Connected {formatRelativeTime(connectedAt)}
        </p>
      )}

      {/* Action Row */}
      <div className="flex items-center justify-between">
        {hasRealCredentials ? (
          <>
            <div className="flex items-center gap-1.5">
              {mutating ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : (
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
              <span className="text-xs font-medium text-emerald-400">Connected</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={onDisconnect}
                disabled={mutating}
              >
                Disconnect
              </Button>
            </div>
          </>
        ) : !isAvailable ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full text-xs text-muted-foreground hover:text-foreground"
            onClick={onUpgrade}
          >
            <Lock className="mr-1.5 h-3 w-3" />
            Request access
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 w-full bg-primary text-xs text-primary-foreground hover:bg-primary/90"
            onClick={onConnect}
            disabled={mutating}
          >
            {mutating ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <>
                <Plus className="mr-1.5 h-3 w-3" />
                Connect
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};
