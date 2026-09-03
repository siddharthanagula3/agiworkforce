import { memo, useEffect, useMemo, useState } from 'react';
import { Plug, RotateCw, ShieldAlert } from 'lucide-react';

import { cn } from '../lib/utils';
import { buildConnectHref, type ConnectorConnectRequest } from '../lib/connector-connect-required';

const MAX_VISIBLE_SCOPES = 8;

export interface ConnectorConnectCardProps {
  request: ConnectorConnectRequest;
  onRetryTurn?: () => void;
  className?: string;
}

function headlineFor(request: ConnectorConnectRequest): string {
  if (request.connectUrl === null) return `${request.connectorName} can’t be connected here`;
  switch (request.reason) {
    case 'not_connected':
      return `Connect ${request.connectorName}`;
    case 'insufficient_scope':
      return `${request.connectorName} needs more permission`;
    default:
      return `Reconnect ${request.connectorName}`;
  }
}

function explanationFor(request: ConnectorConnectRequest, toolLabel: string): string {
  if (request.connectUrl === null) {
    return `${toolLabel} needs your authorization, but this deployment has no ${request.connectorName} authorization app configured, so there is nothing to connect to yet.`;
  }
  switch (request.reason) {
    case 'not_connected':
      return `${toolLabel} needs access to your ${request.connectorName} account, which isn’t connected yet.`;
    case 'authorization_expired':
      return `Your ${request.connectorName} authorization expired or was revoked, so ${toolLabel} couldn’t run.`;
    case 'insufficient_scope':
      return `Your ${request.connectorName} authorization doesn’t cover what ${toolLabel} asked for.`;
    case 'authorization_unavailable':
      return `${request.connectorName} rejected the stored authorization for this account, so ${toolLabel} couldn’t run.`;
  }
}

function ConnectorConnectCardImpl({ request, onRetryTurn, className }: ConnectorConnectCardProps) {
  const [returnPath, setReturnPath] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setReturnPath(`${window.location.pathname}${window.location.search}`);
  }, []);

  const href = useMemo(
    () => (request.connectUrl ? buildConnectHref(request.connectUrl, returnPath) : null),
    [request.connectUrl, returnPath],
  );

  const toolLabel = `${request.connectorName} · ${request.toolName}`;
  const headline = headlineFor(request);
  const explanation = explanationFor(request, toolLabel);
  const visibleScopes = request.scopes.slice(0, MAX_VISIBLE_SCOPES);
  const hiddenScopeCount = request.scopes.length - visibleScopes.length;

  return (
    <div
      role="group"
      aria-label={headline}
      data-testid="connector-connect-card"
      data-connector-id={request.connectorId}
      className={cn(
        'rounded-lg border border-border/60 bg-muted/30 p-3 text-sm',
        href === null ? 'border-dashed' : null,
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">
          {href === null ? (
            <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <Plug className="h-4 w-4 text-primary" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <p className="font-medium text-foreground">{headline}</p>
            <p className="text-xs text-muted-foreground">{explanation}</p>
            <p className="text-[12px] text-muted-foreground">
              Requested by <span className="font-mono">{request.qualifiedToolName}</span>
            </p>
          </div>

          {visibleScopes.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[12px] font-medium text-muted-foreground">
                {href === null ? 'Would request' : 'This will request'}
              </p>
              <ul className="flex flex-wrap gap-1" aria-label="Requested permissions">
                {visibleScopes.map((scope) => (
                  <li
                    key={scope}
                    className="max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] text-muted-foreground"
                    title={scope}
                  >
                    {scope}
                  </li>
                ))}
                {hiddenScopeCount > 0 ? (
                  <li className="rounded-md px-1.5 py-0.5 text-[12px] text-muted-foreground">
                    +{hiddenScopeCount} more
                  </li>
                ) : null}
              </ul>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              This deployment lists no scopes for {request.connectorName}.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {href !== null ? (
              <a
                href={href}
                data-testid="connector-connect-link"
                className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {request.reason === 'not_connected' ? 'Connect' : 'Reconnect'}{' '}
                {request.connectorName}
              </a>
            ) : null}
            {onRetryTurn && href !== null ? (
              <button
                type="button"
                onClick={onRetryTurn}
                data-testid="connector-connect-retry"
                className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <RotateCw className="mr-1 h-3 w-3" aria-hidden="true" />
                Retry this turn
              </button>
            ) : null}
          </div>

          {href !== null ? (
            <p className="text-[12px] text-muted-foreground">
              Connecting opens {request.connectorName} in this tab and brings you back here. It does
              not resume this turn, use Retry after you return to re-run it from your last message.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const ConnectorConnectCard = memo(ConnectorConnectCardImpl);
ConnectorConnectCard.displayName = 'ConnectorConnectCard';
