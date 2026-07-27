/**
 * ConnectorDiscoveryBar Component
 *
 * Slim discovery bar shown in the empty chat state, prompting users to connect
 * their tools. Clicking opens the connectors settings tab; the X dismisses it
 * and persists the dismissal in localStorage.
 */

import React, { useMemo, useState } from 'react';
import { Link, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSettingsDialogStore } from '../../stores/settingsDialogStore';
import { useConnectorsStore } from '../../stores/connectorsStore';
import { CONNECTORS as CONNECTOR_DEFS } from '../connectors/connectorDefinitions';

const DISMISS_KEY = 'connectorBarDismissed';
const MAX_DISPLAYED = 5;

interface ConnectorDiscoveryBarProps {
  className?: string;
}

export const ConnectorDiscoveryBar: React.FC<ConnectorDiscoveryBarProps> = ({ className }) => {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const openSettings = useSettingsDialogStore((s) => s.openSettings);
  const connectedIds = useConnectorsStore((s) => s.connectedIds);

  // Show featured connectors not yet connected, then fall back to featured connectors
  const displayedConnectors = useMemo(() => {
    const featured = CONNECTOR_DEFS.filter((c) => c.featured && !c.comingSoon);
    const unconnected = featured.filter((c) => !connectedIds.includes(c.id));
    const pool = unconnected.length >= MAX_DISPLAYED ? unconnected : featured;
    return pool.slice(0, MAX_DISPLAYED);
  }, [connectedIds]);

  const handleDismiss = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // localStorage may be unavailable in some sandboxed environments
    }
  };

  const handleBarClick = () => {
    openSettings('connectors');
  };

  if (dismissed) {
    return null;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleBarClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleBarClick();
        }
      }}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg border border-white/10 bg-white/5',
        'hover:bg-white/10 hover:border-white/20 transition-all duration-150 cursor-pointer',
        'w-full max-w-xl',
        className,
      )}
      aria-label="Connect your tools — open connectors settings"
    >
      {/* Link icon */}
      <Link className="h-3.5 w-3.5 text-white/40 shrink-0" aria-hidden="true" />

      {/* Label */}
      <span className="text-xs text-white/50 font-medium shrink-0">Connect your tools</span>

      {/* Connector icons */}
      <div className="flex items-center gap-1.5 flex-1">
        {displayedConnectors.map((connector) => (
          <span
            key={connector.id}
            title={connector.name}
            aria-label={connector.name}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold shrink-0 bg-muted/30 text-muted-foreground"
          >
            {connector.icon}
          </span>
        ))}
      </div>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss connector bar"
        className="ml-auto shrink-0 p-0.5 rounded text-white/30 hover:text-white/70 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
