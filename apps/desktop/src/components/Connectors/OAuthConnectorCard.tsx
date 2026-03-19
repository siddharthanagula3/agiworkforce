import { useCallback, useState } from 'react';
import { Check, ExternalLink, Loader2, LogOut, X } from 'lucide-react';
import { toast } from 'sonner';
import { McpClient } from '@/api/mcp';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import type { ConnectorDef } from './connectorDefinitions';

interface OAuthConnectorCardProps {
  connector: ConnectorDef;
  connected: boolean;
  loading: boolean;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

/**
 * OAuth-specific connector card that shows connector identity, connection
 * status (green checkmark / red X), and a connect or disconnect button.
 *
 * When "Connect" is clicked it calls `mcp_oauth_start_auth` (via McpClient)
 * to get the auth URL, then opens it in the system browser.
 *
 * When "Disconnect" is clicked it calls `mcp_oauth_revoke` (via McpClient)
 * to revoke the token.
 */
export function OAuthConnectorCard({
  connector,
  connected,
  loading,
  error,
  onConnect,
  onDisconnect,
}: OAuthConnectorCardProps) {
  const [revoking, setRevoking] = useState(false);

  const handleDisconnect = useCallback(async () => {
    setRevoking(true);
    try {
      await McpClient.oauthDisconnectRaw(connector.id);
      onDisconnect();
      toast.success(`Disconnected from ${connector.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Disconnect failed';
      toast.error(`Failed to disconnect ${connector.name}: ${message}`);
    } finally {
      setRevoking(false);
    }
  }, [connector.id, connector.name, onDisconnect]);

  const isLoading = loading || revoking;

  return (
    <div
      className={cn(
        'group relative flex flex-col items-center gap-3 rounded-xl border bg-card p-5',
        'transition-all duration-200 hover:shadow-md hover:border-foreground/10',
        connected
          ? 'border-green-500/30 bg-green-500/5'
          : error
            ? 'border-destructive/30 bg-destructive/5'
            : 'border-border',
      )}
    >
      {/* Status indicator */}
      <div className="absolute top-3 right-3">
        {connected ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/20">
                <Check className="h-3 w-3 text-green-500" />
              </div>
            </TooltipTrigger>
            <TooltipContent>Connected</TooltipContent>
          </Tooltip>
        ) : error ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive/20">
                <X className="h-3 w-3 text-destructive" />
              </div>
            </TooltipTrigger>
            <TooltipContent>{error}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {/* Icon */}
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
        {connector.iconUrl ? (
          <img
            src={connector.iconUrl}
            alt={connector.name}
            className="h-7 w-7 rounded"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const sibling = e.currentTarget.nextElementSibling;
              if (sibling) (sibling as HTMLElement).style.display = 'inline';
            }}
          />
        ) : null}
        <span
          className={cn('text-2xl leading-none', connector.iconUrl ? 'hidden' : '')}
          role="img"
          aria-label={connector.name}
        >
          {connector.icon}
        </span>
      </div>

      {/* Name + description */}
      <div className="text-center min-w-0 space-y-1">
        <h4 className="text-sm font-semibold truncate">{connector.name}</h4>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {connector.description}
        </p>
      </div>

      {/* Auth type badge */}
      <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {connector.authType === 'oauth'
          ? 'OAuth'
          : connector.authType === 'api_key'
            ? 'API Key'
            : connector.authType === 'mcp_remote'
              ? 'MCP'
              : 'Auto'}
      </span>

      {/* Action button */}
      <div className="w-full mt-auto pt-1">
        {connector.comingSoon ? (
          <div className="w-full py-1.5 text-center text-xs text-muted-foreground bg-muted/40 rounded-lg">
            Coming Soon
          </div>
        ) : isLoading ? (
          <button
            type="button"
            disabled
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs
              font-medium bg-muted text-muted-foreground cursor-not-allowed"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {revoking ? 'Disconnecting...' : 'Connecting...'}
          </button>
        ) : connected ? (
          <button
            type="button"
            onClick={handleDisconnect}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs
              font-medium border border-destructive/30 text-destructive hover:bg-destructive/10
              transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs
              font-medium bg-teal-600 hover:bg-teal-500 text-white transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Connect
          </button>
        )}
      </div>

      {/* Error text below button */}
      {error && !connected && (
        <p className="text-[11px] text-destructive text-center truncate w-full">{error}</p>
      )}
    </div>
  );
}
