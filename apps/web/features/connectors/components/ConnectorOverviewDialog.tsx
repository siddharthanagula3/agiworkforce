'use client';

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
import { getConnectorCapability } from '@/lib/connectors/catalog';
import { RISK_CLASS_COPY } from '../data/connectors';
import { ConnectorConsentSummary } from './ConnectorConsentSummary';
import { OfficialConnectorLogo } from './OfficialConnectorLogo';

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

export function ConnectorOverviewDialog({
  connector,
  open,
  onOpenChange,
  onConnect,
}: ConnectorOverviewDialogProps) {
  if (!connector) return null;

  const capability = getConnectorCapability(connector.id);
  const tools = capability?.supportedActions ?? [];
  const riskClass = capability?.riskClass ?? 'high-impact';

  const handleConnect = () => {
    onConnect();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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

          {/* What a working credential for this provider could reach at most.
              Stated before consent, and deliberately about the CEILING rather
              than about whichever tools happen to be wired today. */}
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Access level:</span>{' '}
            {RISK_CLASS_COPY[riskClass]}
          </p>

          {/* Plain-language consent summary — every line traceable, see
              docs/legal/agent-authority-and-connector-scopes.md */}
          <ConnectorConsentSummary />

          {/* Tools list — only for connectors whose tools actually exist. */}
          <div className="rounded-xl border border-border bg-muted/50 p-3.5">
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
                    className="border-border px-2 py-0.5 text-[11px] text-muted-foreground"
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
          <div className="flex justify-end gap-2 border-t border-border pt-3">
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
