'use client';

import React from 'react';
import { ExternalLink, Loader2, Lock, MoreHorizontal, Plus, Zap } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
import { cn } from '@shared/lib/utils';
import { getConnectorLogo, hasOfficialLogo } from '../config/connector-logos';
import type { Connector } from '../data/connectors';

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

// ─── ConnectorLogo ────────────────────────────────────────────────────────────

interface ConnectorLogoProps {
  connector: Connector;
}

export const ConnectorLogo: React.FC<ConnectorLogoProps> = ({ connector }) => {
  const logoInfo = getConnectorLogo(connector.id);
  const [imageError, setImageError] = React.useState(false);

  if (logoInfo && !imageError && hasOfficialLogo(connector.id)) {
    return (
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 shadow-lg overflow-hidden"
        style={logoInfo.bgColor ? { backgroundColor: logoInfo.bgColor } : {}}
      >
        <Image
          src={logoInfo.url}
          alt={connector.name}
          width={logoInfo.width || 28}
          height={logoInfo.height || 28}
          className="object-contain"
          onError={() => setImageError(true)}
          unoptimized={logoInfo.url.startsWith('http')}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-lg',
        connector.iconBg,
      )}
    >
      {connector.iconEmoji ?? connector.iconText}
    </div>
  );
};

// ─── ConnectorCard ────────────────────────────────────────────────────────────

export interface ConnectorCardProps {
  connector: Connector;
  connected: boolean;
  mutating: boolean;
  connectedAt?: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const ConnectorCard: React.FC<ConnectorCardProps> = ({
  connector,
  connected,
  mutating,
  connectedAt,
  onConnect,
  onDisconnect,
}) => {
  const isComingSoon = connector.phase > 1;
  const isOAuth = connector.authType === 'oauth';
  const hasRealCredentials = connected && !isOAuth;

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border bg-card p-5 transition-all duration-200',
        hasRealCredentials
          ? 'border-primary/30 bg-primary/5'
          : 'border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.02]',
        connector.exclusive && 'border-amber-500/20 bg-amber-500/5 hover:border-amber-500/30',
      )}
    >
      {/* Exclusive badge */}
      {connector.exclusive && (
        <div className="absolute right-3 top-3">
          <Badge className="border-0 bg-amber-500/20 px-1.5 py-0 text-[10px] font-semibold text-amber-400">
            EXCLUSIVE
          </Badge>
        </div>
      )}

      {/* Coming Soon badge for phase > 1 non-exclusive connectors */}
      {isComingSoon && !connector.exclusive && (
        <div className="absolute right-3 top-3">
          <Badge
            variant="outline"
            className="border-white/10 px-1.5 py-0 text-[10px] text-muted-foreground"
          >
            Phase {connector.phase}
          </Badge>
        </div>
      )}

      {/* Coming Soon badge for phase-1 OAuth connectors */}
      {!isComingSoon && isOAuth && !connector.exclusive && (
        <div className="absolute right-3 top-3">
          <Badge
            variant="outline"
            className="border-white/10 px-1.5 py-0 text-[10px] text-muted-foreground"
          >
            Coming Soon
          </Badge>
        </div>
      )}

      {/* Icon + Name */}
      <div className="mb-3 flex items-start gap-3">
        <ConnectorLogo connector={connector} />
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
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                aria-label="Open in new tab"
              >
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={onDisconnect}
                disabled={mutating}
                aria-label="More options"
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </>
        ) : (isComingSoon && !connector.exclusive) || isOAuth ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full cursor-not-allowed text-xs text-muted-foreground opacity-50"
            disabled
          >
            <Lock className="mr-1.5 h-3 w-3" />
            Coming Soon
          </Button>
        ) : (
          <Button
            size="sm"
            className={cn(
              'h-7 w-full text-xs',
              connector.exclusive
                ? 'bg-amber-500 text-black hover:bg-amber-400'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
            onClick={onConnect}
            disabled={mutating}
          >
            {mutating ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : connector.exclusive ? (
              <>
                <Zap className="mr-1.5 h-3 w-3" />
                Enable
              </>
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
