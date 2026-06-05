'use client';

/**
 * ConnectorOverviewDialog
 *
 * Shown before the user connects a connector. Displays:
 * - Developer/publisher info
 * - Trust disclaimer listing what the connector can access
 * - List of tools it provides
 * - Connect / Cancel buttons
 */

import { ShieldAlert, Wrench } from 'lucide-react';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@shared/ui/dialog';
import { getConnectorTools } from '../config/connector-logos';
import { OfficialConnectorLogo } from './OfficialConnectorLogo';

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

function accessScopes(connector: ConnectorInfo): string[] {
  // Build a human-readable list of what the connector can access based on its
  // category/id. This is intentionally conservative - we surface the broadest
  // reasonable scope to prompt an informed consent decision.
  const base: string[] = [`Data readable and writable via ${connector.name}`];
  if (connector.authType === 'oauth') {
    base.push('OAuth tokens stored securely in your account');
    base.push('Can act on your behalf until you revoke access');
  } else if (connector.authType === 'api_key') {
    base.push('API key stored in encrypted storage');
    base.push('Access limited by the key scope you provide');
  } else if (connector.authType === 'pat') {
    base.push('Token stored in local secure storage');
    base.push('Grants access to your local machine resources');
  } else {
    base.push('Credentials stored securely for the duration of the session');
  }
  return base;
}

// ─── ConnectorOverviewDialog ──────────────────────────────────────────────────

export function ConnectorOverviewDialog({
  connector,
  open,
  onOpenChange,
  onConnect,
}: ConnectorOverviewDialogProps) {
  if (!connector) return null;

  const tools = getConnectorTools(connector.id);

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
                {authLabel(connector.authType)} &middot; {connector.actionCount} actions
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">{connector.description}</p>

          {/* Trust disclaimer */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5">
            <div className="mb-2 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
              <span className="text-xs font-semibold text-amber-400">
                This connector will have access to:
              </span>
            </div>
            <ul className="space-y-1">
              {accessScopes(connector).map((scope) => (
                <li key={scope} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/50" />
                  {scope}
                </li>
              ))}
            </ul>
          </div>

          {/* Tools list */}
          {tools.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
              <div className="mb-2 flex items-center gap-2">
                <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-xs font-semibold text-foreground">
                  Provided tools ({tools.length})
                </span>
              </div>
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
            </div>
          )}

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
