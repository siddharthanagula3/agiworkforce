/**
 * ConnectorDiscoveryBar Component
 *
 * Slim discovery bar shown in the empty chat state, prompting users to connect
 * their tools. Clicking opens the connectors settings tab; the X dismisses it
 * and persists the dismissal in localStorage.
 */

import React, { useState } from 'react';
import { Link, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSettingsDialogStore } from '../../stores/settingsDialogStore';

const DISMISS_KEY = 'connectorBarDismissed';

interface ConnectorPlaceholder {
  name: string;
  initial: string;
  color: string;
}

const CONNECTORS: ConnectorPlaceholder[] = [
  { name: 'Gmail', initial: 'G', color: 'bg-red-500/20 text-red-300' },
  { name: 'Slack', initial: 'S', color: 'bg-purple-500/20 text-purple-300' },
  { name: 'GitHub', initial: 'G', color: 'bg-muted-foreground/20 text-foreground' },
  { name: 'Notion', initial: 'N', color: 'bg-muted-foreground/20 text-foreground' },
  { name: 'Calendar', initial: 'C', color: 'bg-blue-500/20 text-blue-300' },
];

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
        {CONNECTORS.map((connector) => (
          <span
            key={connector.name}
            title={connector.name}
            aria-label={connector.name}
            className={cn(
              'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold shrink-0',
              connector.color,
            )}
          >
            {connector.initial}
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
