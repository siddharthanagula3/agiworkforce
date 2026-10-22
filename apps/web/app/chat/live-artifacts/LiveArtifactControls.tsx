'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal, RefreshCw } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useConfirmAction,
} from '@agiworkforce/ui';
import { toast } from 'sonner';
import { ArtifactConnectorConsent } from '@/app/shared-artifact/[token]/ArtifactConnectorConsent';
import { formatRelativeTime } from '@shared/utils/format';
import { toUserMessage } from '@/lib/user-error-message';
import { LIVE_ARTIFACTS_PAGE_PATH, connectorDisplayName } from './live-artifact-contract';
import type { LiveArtifactRuntime } from './useLiveArtifactRuntime';

function appList(connectors: readonly string[]): string {
  return new Intl.ListFormat(undefined, { type: 'conjunction' }).format(
    connectors.map(connectorDisplayName),
  );
}

export function LiveArtifactControls({ live }: { live: LiveArtifactRuntime }) {
  const { confirm, dialog } = useConfirmAction();
  const [busy, setBusy] = useState(false);
  const binding = live.binding;

  if (live.asking) {
    return (
      <div className="shrink-0 border-b border-border/30 px-4 py-3">
        <ArtifactConnectorConsent
          request={live.asking}
          appNames={appList(live.asking.connectorIds)}
          onAnswer={live.answer}
        />
      </div>
    );
  }
  if (!binding) return null;

  const updated = binding.lastRefreshedAt
    ? `Updated ${formatRelativeTime(binding.lastRefreshedAt)}`
    : 'Not refreshed yet';
  const manual = binding.refreshPolicy === 'manual';

  const changePolicy = async () => {
    setBusy(true);
    try {
      await live.setRefreshPolicy(manual ? 'on_open' : 'manual');
    } catch (error) {
      toast.error(toUserMessage(error, 'The refresh setting could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const stop = () =>
    confirm({
      title: 'Stop live updates?',
      description: `This artifact stops reading ${appList(binding.connectors)} and leaves Live artifacts. It stays in its chat, and you can allow its connected apps again later.`,
      confirmLabel: 'Stop live updates',
      destructive: true,
      onConfirm: async () => {
        try {
          await live.stopLive();
        } catch (error) {
          toast.error(toUserMessage(error, 'Live updates could not be stopped.'));
        }
      },
    });

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/30 px-4 py-2 text-sm"
      data-testid="live-artifact-controls"
    >
      <Link
        href={LIVE_ARTIFACTS_PAGE_PATH}
        className="rounded-full bg-muted px-2.5 py-0.5 font-medium text-foreground hover:bg-muted/80"
      >
        Live
      </Link>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {binding.readiness === 'needs_connection' && binding.missingConnectors.length > 0
          ? `Connect ${appList(binding.missingConnectors)} to refresh`
          : updated}
      </span>
      <Button size="sm" variant="ghost" onClick={live.refresh} data-testid="live-artifact-refresh">
        <RefreshCw className="me-1 h-4 w-4" aria-hidden="true" />
        Refresh data
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Live options">
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={busy} onSelect={() => void changePolicy()}>
            {manual ? 'Refresh when opened' : 'Refresh only when I ask'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={stop}>Stop live updates</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog}
    </div>
  );
}
