/**
 * ConnectorConnectCard — the inline Connect card for lazy authentication.
 *
 * A connector tool was called, the provider answered 401/403, and the server
 * turned that into a structured "connect required" tool result instead of
 * failing the turn (`apps/web/lib/connectors/connect-required.ts`). This card
 * is what the user sees in the conversation: which connector needs
 * authorization, which tool asked for it, what scopes the flow will request,
 * and a Connect action pointing at the same-origin OAuth broker.
 *
 * Surface-neutral: plain DOM + `cn`, no Next.js/Tauri/Chrome APIs. The Connect
 * action is an ordinary same-origin anchor, which every shell that renders this
 * package can follow.
 *
 * HONESTY RULES THIS CARD ENFORCES
 * - No Connect button when the envelope carries `connectUrl: null`. That is the
 *   state of every connector in a deployment with no OAuth application
 *   configured — which is the default today, since the provider registry ships
 *   empty — and the card says so rather than rendering a button that would
 *   bounce off a 501.
 * - No claim of an automatic retry. Nothing resumes the suspended turn after
 *   the OAuth callback returns, so the card offers an explicit Retry that
 *   re-runs the turn from the user's last message and says exactly that.
 *
 * UNTRUSTED DISPLAY DATA. `connectorName` and `scopes` originate from an
 * operator-supplied provider descriptor and, for a step-up challenge, from a
 * provider's `WWW-Authenticate` header. They are rendered as React text nodes
 * only. The href is the pre-verified `connectUrl` (see
 * `readConnectorConnectRequest`); no URL is ever built from display data.
 *
 * No markdown renderer and no `dangerouslySetInnerHTML` anywhere below.
 * llm-guardrail-allow: the line above is the prohibition, not a call site.
 */

import { memo, useEffect, useMemo, useState } from 'react';
import { Plug, RotateCw, ShieldAlert } from 'lucide-react';

import { cn } from '../lib/utils';
import { buildConnectHref, type ConnectorConnectRequest } from '../lib/connector-connect-required';

/** How many scopes to list before collapsing the rest into a count. */
const MAX_VISIBLE_SCOPES = 8;

export interface ConnectorConnectCardProps {
  request: ConnectorConnectRequest;
  /**
   * Re-runs the whole exchange from the user's last message (the same
   * mechanism as Regenerate). Omitted when the surface has no regenerate
   * wiring, in which case no Retry button is shown rather than a dead one.
   */
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
  // Read on the client only: the first client render must match the server
  // render, so the returnPath is attached after mount. Without it the broker
  // sends the user to /connectors and they lose the conversation.
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
            <p className="text-[11px] text-muted-foreground/80">
              Requested by <span className="font-mono">{request.qualifiedToolName}</span>
            </p>
          </div>

          {visibleScopes.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">
                {href === null ? 'Would request' : 'This will request'}
              </p>
              <ul className="flex flex-wrap gap-1" aria-label="Requested permissions">
                {visibleScopes.map((scope) => (
                  <li
                    key={scope}
                    className="max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    title={scope}
                  >
                    {scope}
                  </li>
                ))}
                {hiddenScopeCount > 0 ? (
                  <li className="rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    +{hiddenScopeCount} more
                  </li>
                ) : null}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/80">
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
            <p className="text-[11px] text-muted-foreground/80">
              Connecting opens {request.connectorName} in this tab and brings you back here. It does
              not resume this turn — use Retry after you return to re-run it from your last message.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const ConnectorConnectCard = memo(ConnectorConnectCardImpl);
ConnectorConnectCard.displayName = 'ConnectorConnectCard';
