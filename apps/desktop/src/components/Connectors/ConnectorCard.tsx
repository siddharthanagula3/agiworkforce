import { Loader2 } from 'lucide-react';
import type { ConnectorDef } from './connectorDefinitions';

interface ConnectorCardProps {
  connector: ConnectorDef;
  connected: boolean;
  loading: boolean;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

const COLOR_MAP: Record<string, string> = {
  red: 'border-red-500/30 hover:border-red-500/60',
  blue: 'border-blue-500/30 hover:border-blue-500/60',
  green: 'border-green-500/30 hover:border-green-500/60',
  purple: 'border-purple-500/30 hover:border-purple-500/60',
  gray: 'border-zinc-500/30 hover:border-zinc-500/60',
};

export function ConnectorCard({
  connector,
  connected,
  loading,
  error,
  onConnect,
  onDisconnect,
}: ConnectorCardProps) {
  return (
    <div
      className={`
        rounded-xl border bg-card p-4
        transition-all duration-200
        hover:scale-[1.02] hover:shadow-lg
        ${COLOR_MAP[connector.color] ?? COLOR_MAP['gray']}
      `}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" role="img" aria-label={connector.name}>
          {connector.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm truncate">{connector.name}</h4>
            {connected ? (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                Not connected
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{connector.description}</p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive mt-2 bg-destructive/10 rounded px-2 py-1">{error}</p>
      )}

      <div className="mt-3">
        {connected ? (
          <button
            onClick={onDisconnect}
            disabled={loading}
            className="w-full py-1.5 px-3 text-xs font-medium rounded-lg
              text-red-400 hover:text-red-300 hover:bg-red-500/10
              border border-red-500/20 hover:border-red-500/40
              transition-colors disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Disconnecting...
              </span>
            ) : (
              'Disconnect'
            )}
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={loading}
            className="w-full py-1.5 px-3 text-xs font-medium rounded-lg
              text-white bg-teal-600 hover:bg-teal-500
              transition-colors disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Connecting...
              </span>
            ) : (
              'Connect'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
