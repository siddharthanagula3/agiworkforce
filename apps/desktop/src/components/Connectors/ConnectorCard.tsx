import { useState } from 'react';
import { Check, Loader2, MoreHorizontal, Plus, Puzzle, Settings } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import type { ConnectorDef } from './connectorDefinitions';
import { ConnectorDetailView } from './ConnectorDetailView';

interface ConnectorCardProps {
  connector: ConnectorDef;
  connected: boolean;
  loading: boolean;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onConfigure?: () => void;
}

export function ConnectorCard({
  connector,
  connected,
  loading,
  error,
  onConnect,
  onDisconnect,
  onConfigure,
}: ConnectorCardProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  if (showDetail) {
    return <ConnectorDetailView connector={connector} onBack={() => setShowDetail(false)} />;
  }

  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3
        transition-colors hover:bg-muted/50"
    >
      {/* Logo/Icon */}
      <div className="shrink-0 flex items-center justify-center h-8 w-8">
        {connector.iconUrl && !logoFailed ? (
          <img
            src={connector.iconUrl}
            alt={connector.name}
            className="h-8 w-8 rounded"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <Puzzle className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium truncate">{connector.name}</h4>
        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{connector.description}</p>
        {error && <p className="text-xs text-destructive mt-1 truncate">{error}</p>}
      </div>

      {/* Action area */}
      <div className="shrink-0 flex items-center gap-1.5">
        {connector.comingSoon ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap">
            Coming Soon
          </span>
        ) : loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : connected ? (
          <>
            <span className="flex items-center gap-1 text-xs text-green-500 whitespace-nowrap">
              <Check className="h-3 w-3" />
              Connected
            </span>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="p-1 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                  aria-label="Connector options"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-40 p-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent transition-colors"
                  onClick={() => {
                    if (onConfigure) {
                      onConfigure();
                    } else {
                      setShowDetail(true);
                    }
                  }}
                >
                  <Settings className="h-3.5 w-3.5" />
                  Configure
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={onDisconnect}
                >
                  Disconnect
                </button>
              </PopoverContent>
            </Popover>
          </>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            className="flex items-center justify-center h-7 w-7 rounded-full border border-border
              hover:bg-accent hover:border-foreground/20 transition-colors text-muted-foreground hover:text-foreground"
            aria-label={`Connect ${connector.name}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
