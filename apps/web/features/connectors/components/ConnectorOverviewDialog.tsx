'use client';

/**
 * ConnectorOverviewDialog
 *
 * Shown before the user connects a connector. Displays:
 * - Developer/publisher info
 * - The plain-language consent summary (ConnectorConsentSummary)
 * - The connector's real tools, when any are implemented
 * - Connect / Cancel buttons
 *
 * HONESTY CONSTRAINTS (do not regress these):
 *
 *  1. This dialog used to render `accessScopes()`, which built its lines from the
 *     connector's declared authType and asserted storage that does not exist —
 *     "OAuth tokens stored securely in your account", "Token stored in local
 *     secure storage", "Grants access to your local machine resources". On web
 *     there is NO OAuth flow for any branded catalog connector (POST
 *     /api/connectors 501s every id that is not operator-mapped) and
 *     `user_connectors` stores only connector_id + auth_type + is_active — no
 *     tokens, no endpoints (lib/user-connector-tools.ts header). That function
 *     is gone; ConnectorConsentSummary states what is true instead.
 *
 *  2. The "Provided tools" list came from CONNECTOR_TOOLS in
 *     config/connector-logos.ts, which advertises tool names for connectors with
 *     no runtime implementation anywhere ("Read emails", "Send email", ...). The
 *     only entry that mirrors real wire names is `github`
 *     (lib/user-connector-tools.ts L180-240). We now render tools only for
 *     connectors whose tools actually exist, and say so honestly otherwise.
 *
 *  3. `actionCount` on the connector record has no backing implementation, so it
 *     is not rendered as a capability count.
 */

import { Wrench } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@agiworkforce/ui';
import { getConnectorTools } from '../config/connector-logos';
import { ConnectorConsentSummary } from './ConnectorConsentSummary';
import { OfficialConnectorLogo } from './OfficialConnectorLogo';

/**
 * Connector ids whose advertised tool list matches tools that actually exist in
 * a runtime path. Today that is exactly the GitHub App built-in, whose three
 * tools are defined in lib/user-connector-tools.ts. Adding an id here is a claim
 * that invoking those tools works — do not add one speculatively.
 */
const CONNECTORS_WITH_REAL_TOOLS = new Set(['github']);

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ConnectorInfo {
  id: string;
  name: string;
  description: string;
  authType: 'oauth' | 'api_key' | 'connection_string' | 'pat';
  actionCount: number;
  iconBg: string;
  iconText: string;
  iconEmoji?: string;
  exclusive?: boolean;
}

interface ConnectorOverviewDialogProps {
  connector: ConnectorInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: () => void;
}

// ─── Auth type helpers ─────────────────────────────────────────────────────────

function authLabel(authType: ConnectorInfo['authType']): string {
  switch (authType) {
    case 'oauth':
      return 'OAuth 2.0';
    case 'api_key':
      return 'API Key';
    case 'connection_string':
      return 'Connection String';
    case 'pat':
      return 'Personal Access Token';
  }
}

// ─── ConnectorOverviewDialog ──────────────────────────────────────────────────

export function ConnectorOverviewDialog({
  connector,
  open,
  onOpenChange,
  onConnect,
}: ConnectorOverviewDialogProps) {
  if (!connector) return null;

  const tools = CONNECTORS_WITH_REAL_TOOLS.has(connector.id) ? getConnectorTools(connector.id) : [];

  const handleConnect = () => {
    onConnect();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/[0.08] bg-[#0f0e0d] sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <OfficialConnectorLogo connector={connector} className="h-10 w-10 rounded-xl" />
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-foreground">
                Connect {connector.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {authLabel(connector.authType)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">{connector.description}</p>

          {/* Plain-language consent summary — every line traceable, see
              docs/legal/agent-authority-and-connector-scopes.md */}
          <ConnectorConsentSummary />

          {/* Tools list — only for connectors whose tools actually exist. */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
            <div className="mb-2 flex items-center gap-2">
              <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs font-semibold text-foreground">
                {tools.length > 0 ? `Tools (${tools.length})` : 'Tools'}
              </span>
            </div>
            {tools.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {tools.map((tool) => (
                  <Badge
                    key={tool}
                    variant="outline"
                    className="border-white/[0.08] px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {tool}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                This connector&rsquo;s tools are listed after it connects. We don&rsquo;t show a
                tool list here that we can&rsquo;t confirm it provides.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-4 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 bg-primary px-4 text-xs text-primary-foreground hover:bg-primary/90"
              onClick={handleConnect}
            >
              Connect
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
