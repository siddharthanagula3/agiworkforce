'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  Check,
  Zap,
  ExternalLink,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { getConnectorCapability } from '@/lib/connectors/catalog';
import { ConnectorOverviewDialog } from '../components/ConnectorOverviewDialog';
import { OfficialConnectorLogo } from '../components/OfficialConnectorLogo';
import {
  useConnectors,
  invalidateConnectorsCache,
  type ConnectorSource,
} from '../hooks/use-connectors';
import { getGitHubCallbackNotice } from '../lib/github-callback-notice';
import { getConnectorOAuthNotice } from '../lib/connector-oauth-notice';

import { ToolPermissionsPanel } from '../components/ToolPermissionsPanel';
import {
  CATEGORIES,
  CONNECTORS,
  getConnectorAvailabilityLabelFor,
  RISK_CLASS_COPY,
  type Connector,
  type ConnectorCategory,
} from '../data/connectors';

const VISIBLE_CONNECTORS = CONNECTORS.filter((connector) => !connector.exclusive);

// ─── Connection status filter ──────────────────────────────────────────────────

type StatusFilter = 'all' | 'connected' | 'ready' | 'request_access';

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Connected', value: 'connected' },
  { label: 'Ready', value: 'ready' },
  // The value stays `request_access` — it is the URL contract the OAuth broker
  // return leg reads (features/connectors/lib/connector-oauth-notice.ts). The
  // LABEL is honest now: nothing is in flight for these, this deployment simply
  // has no way to connect them (audit CRIT-001).
  { label: 'Not available here', value: 'request_access' },
];

function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── ConnectorListRow ─────────────────────────────────────────────────────────
// Compact left-panel list row: icon + name + connected status dot

interface ConnectorListRowProps {
  connector: Connector;
  selected: boolean;
  connected: boolean;
  onClick: () => void;
}

const ConnectorListRow: React.FC<ConnectorListRowProps> = ({
  connector,
  selected,
  connected,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-100',
      selected
        ? 'bg-primary/10 text-foreground'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    )}
  >
    <OfficialConnectorLogo connector={connector} />
    <span className="min-w-0 flex-1 truncate text-xs font-medium">{connector.name}</span>
    {connected ? (
      <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600 dark:bg-emerald-400" />
    ) : null}
  </button>
);

// ─── ConnectorDetailPanel ─────────────────────────────────────────────────────
// Right-side detail view for the selected connector

interface ConnectorDetailPanelProps {
  connector: Connector;
  connected: boolean;
  /** Whether this deployment can actually connect this connector right now. */
  available: boolean;
  source?: ConnectorSource;
  mutating: boolean;
  connectedAt?: string;
  /** `source: 'oauth'` only — the scopes the provider actually granted, verbatim. */
  grantedScopes?: string[];
  /** `source: 'oauth'` only — the stored grant can no longer be used or renewed. */
  needsReauthorization?: boolean;
  onBack: () => void;
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}

function useConnectorTools(connectorId: string): string[] {
  // Canonical registry only (audit CRIT-001). Non-empty exclusively for a
  // connector with a shipped adapter, so the Tools block below can no longer
  // render invented capability badges for an unbuilt integration.
  return React.useMemo(
    () => [...(getConnectorCapability(connectorId)?.supportedActions ?? [])],
    [connectorId],
  );
}

/**
 * What disconnecting actually does, per `DELETE /api/connectors`
 * (app/api/connectors/route.ts). Every clause below is behavior in that route —
 * do not add a consequence the route does not implement.
 */
/**
 * Whether `CONNECTOR_TOOLS[id]` holds real wire tool names — the keys the
 * permission store and the chat tool loop use — rather than human-readable
 * capability prose. Only GitHub qualifies today.
 */
function hasWireToolNames(connectorId: string): boolean {
  return connectorId === 'github';
}

function describeDisconnect(connector: Connector, source?: ConnectorSource): string {
  if (source === 'github-app') {
    return `Your GitHub App installations are unlinked from this account and the per-tool permissions you saved for ${connector.name} are deleted. The app itself stays installed on GitHub until you remove it there.`;
  }
  if (source === 'oauth') {
    return `The authorization stored for your account is revoked and deleted — at ${connector.name} too when it offers a revocation endpoint — live connections using it are closed, and the per-tool permissions you saved for ${connector.name} are deleted. Reconnecting starts over from asking you about every tool.`;
  }
  return `${connector.name} stops being offered to your agents, and the per-tool permissions you saved for it are deleted. Reconnecting starts over from asking you about every tool.`;
}

const ConnectorDetailPanel: React.FC<ConnectorDetailPanelProps> = ({
  connector,
  connected,
  available,
  source,
  mutating,
  connectedAt,
  grantedScopes,
  needsReauthorization,
  onBack,
  onConnect,
  onReconnect,
  onDisconnect,
}) => {
  const isAvailable = available;
  // Label from the SERVER's availability answer, not the static phase/authType
  // heuristic — otherwise the badge said "Coming soon" for a connector this
  // deployment can connect right now, and "Ready" for one that would 501.
  const availabilityLabel = getConnectorAvailabilityLabelFor(connector, available);
  const tools = useConnectorTools(connector.id);
  const isOAuthGrant = connected && source === 'oauth';
  const scopes = grantedScopes ?? [];
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [toolPermissionsOpen, setToolPermissionsOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      {/* Mobile back button */}
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground lg:hidden"
      >
        Back
      </button>

      {/* Header row */}
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <OfficialConnectorLogo connector={connector} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{connector.name}</h2>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {source === 'github-app'
              ? 'GitHub App'
              : // A live OAuth grant is the authoritative answer, whatever the
                // static catalog entry says this connector's auth type is.
                source === 'oauth' || connector.authType === 'oauth'
                ? 'OAuth 2.0'
                : connector.authType === 'api_key'
                  ? 'API Key'
                  : connector.authType === 'pat'
                    ? 'Personal Access Token'
                    : 'Connection String'}
            {(isAvailable || connected) && tools.length > 0 ? (
              <> &middot; {tools.length} tools</>
            ) : null}
          </p>
        </div>

        {/* Primary action */}
        <div className="shrink-0">
          {connected ? (
            <div className="flex items-center gap-1">
              {source === 'github-app' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    window.open(
                      'https://github.com/settings/installations',
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                >
                  Manage on GitHub
                  <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
                </Button>
              )}
              {/*
                Per-tool permissions. The disconnect copy below already tells
                users "the per-tool permissions you saved for X are deleted",
                but there was no UI to save any — the panel existed unmounted.

                Gated on the canonical registry's `supportedActions`, which are
                real wire names. Today that is GitHub only (they mirror
                GITHUB_TOOL_DEFS); every other connector's tools are discovered
                at runtime by catalogToConnectorToolDefs, which no static table
                can mirror.
              */}
              {hasWireToolNames(connector.id) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setToolPermissionsOpen(true)}
                >
                  Tool permissions
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmingDisconnect(true)}
                disabled={mutating}
              >
                {mutating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Disconnect'}
              </Button>
            </div>
          ) : isAvailable ? (
            <Button
              size="sm"
              className="h-7 bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
              onClick={onConnect}
              disabled={mutating}
            >
              {mutating ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Plus className="mr-1.5 h-3 w-3" />
                  Connect
                </>
              )}
            </Button>
          ) : (
            <Badge
              variant="outline"
              className="border-border px-2 py-1 text-[11px] text-muted-foreground"
            >
              {availabilityLabel}
            </Badge>
          )}
        </div>
      </div>

      {connected && connectedAt && (
        <p className="mb-3 text-[10px] text-muted-foreground/60">
          Connected {formatRelativeTime(connectedAt)}
        </p>
      )}

      {/* Expired/revoked grant. `needsReauthorization` means the stored access
          token is past expiry with no refresh token to renew it, so the tool
          loop cannot use this connector until the user authorizes again. */}
      {isOAuthGrant && needsReauthorization && (
        <div className="mb-4 flex flex-wrap items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-500"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-400">
              Authorization needs renewing
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-200/80">
              The {connector.name} authorization saved for your account has expired and cannot be
              renewed automatically. Your agents cannot use {connector.name} until you reconnect.
            </p>
          </div>
          <Button
            size="sm"
            className="h-7 shrink-0 bg-amber-500 px-3 text-xs text-black hover:bg-amber-500/90"
            onClick={onReconnect}
            disabled={mutating}
          >
            {mutating ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3 w-3" aria-hidden="true" />
            )}
            Reconnect
          </Button>
        </div>
      )}

      {/* What the user actually authorized. Scope strings are the provider's
          own wording and are rendered verbatim — there is no sourced
          plain-English description for them here, and inventing one would
          misstate what access was granted. */}
      {isOAuthGrant && (
        <div className="mb-4 rounded-xl border border-border bg-muted/40 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-emerald-600/40 px-2 py-0.5 text-[11px] text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-400"
            >
              Connected with OAuth
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              You authorized {connector.name} for your own account.
            </span>
          </div>
          <p className="text-xs font-semibold text-foreground">
            Scopes you granted ({scopes.length})
          </p>
          {scopes.length > 0 ? (
            <>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {scopes.map((scope) => (
                  <li key={scope}>
                    <Badge
                      variant="outline"
                      className="border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                    >
                      {scope}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/70">
                These are {connector.name}&apos;s own scope names, shown exactly as {connector.name}{' '}
                returned them.
              </p>
            </>
          ) : (
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">
              {connector.name} did not return a scope list for this authorization.
            </p>
          )}
        </div>
      )}

      {/* Description */}
      <p className="mb-2 text-sm leading-relaxed text-muted-foreground">{connector.description}</p>

      {/* Risk ceiling, from the canonical capability registry (audit CRIT-001).
          Shown whether or not the connector is connectable here, because it is
          a fact about the provider rather than about this deployment. */}
      <p className="mb-5 text-xs leading-relaxed text-muted-foreground/80">
        <span className="font-medium text-muted-foreground">Access level:</span>{' '}
        {RISK_CLASS_COPY[connector.riskClass]}
      </p>

      {/* Tools — only shown for connectors that actually work in this deployment,
          so fabricated capability badges never render as product state. */}
      {(isAvailable || connected) && tools.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Tools ({tools.length})</span>
          </div>
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
        </div>
      )}

      <ToolPermissionsPanel
        connector={{
          id: connector.id,
          name: connector.name,
          iconEmoji: connector.iconEmoji,
          iconText: connector.iconText,
          iconBg: connector.iconBg,
        }}
        open={toolPermissionsOpen}
        onOpenChange={setToolPermissionsOpen}
      />

      <Dialog open={confirmingDisconnect} onOpenChange={setConfirmingDisconnect}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">
              Disconnect {connector.name}?
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              {describeDisconnect(connector, source)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-border px-3 text-xs"
              onClick={() => setConfirmingDisconnect(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 bg-destructive px-3 text-xs text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmingDisconnect(false);
                onDisconnect();
              }}
              disabled={mutating}
            >
              Disconnect
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── ConnectorsPage ────────────────────────────────────────────────────────────

export function ConnectorsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ConnectorCategory | 'All'>('All');
  const {
    connectedIds,
    connectedAtMap,
    sources,
    grantedScopes,
    needsReauthorizationIds,
    availableIds,
    loading,
    error: connectorsError,
    mutatingIds,
    connect,
    reconnect,
    disconnect,
    retry: retryConnectors,
  } = useConnectors();
  const [currentPage, setCurrentPage] = useState(1);
  // Master-detail: which connector row is selected in the left list
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null);
  // Overview dialog: shown before connecting
  const [overviewConnector, setOverviewConnector] = useState<Connector | null>(null);

  const ITEMS_PER_PAGE = 20;

  const isAvailable = useCallback(
    (connector: Connector) => availableIds.has(connector.id),
    [availableIds],
  );

  // Surface the GitHub App install callback outcome (?github=...) as a toast,
  // then strip the param so refreshes don't re-toast.
  useEffect(() => {
    const github = searchParams.get('github');
    if (!github) return;
    const notice = getGitHubCallbackNotice(github);
    if (notice?.kind === 'success') {
      toast.success(notice.message);
    } else if (notice) {
      toast.error(notice.message);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete('github');
    router.replace(`${pathname}${params.size > 0 ? `?${params.toString()}` : ''}`, {
      scroll: false,
    });
  }, [searchParams, router, pathname]);

  // Status filter is stored in URL search params so it persists on refresh/share
  const rawStatus = searchParams.get('status');
  const connectorParam = searchParams.get('connector');

  // The connector OAuth broker returns the user here with ?connector=&status=.
  // That `status` key is shared with the filter above, so resolve the broker
  // outcome first and let it win — otherwise a redirect back from a provider
  // would silently re-filter the directory instead of reporting what happened.
  const oauthNotice = useMemo(
    () =>
      getConnectorOAuthNotice(
        rawStatus,
        connectorParam,
        connectorParam ? VISIBLE_CONNECTORS.find((c) => c.id === connectorParam)?.name : undefined,
      ),
    [rawStatus, connectorParam],
  );

  const activeStatus: StatusFilter =
    oauthNotice === null &&
    (rawStatus === 'connected' || rawStatus === 'ready' || rawStatus === 'request_access')
      ? rawStatus
      : 'all';

  // Toast the OAuth outcome once, refresh the grant list on success, then strip
  // both params so a refresh does not replay a stale result.
  useEffect(() => {
    if (!oauthNotice) return;
    if (oauthNotice.kind === 'success') {
      toast.success(oauthNotice.message);
    } else {
      toast.error(oauthNotice.message);
    }
    if (oauthNotice.connected) {
      invalidateConnectorsCache();
      retryConnectors();
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete('connector');
    params.delete('status');
    router.replace(`${pathname}${params.size > 0 ? `?${params.toString()}` : ''}`, {
      scroll: false,
    });
    // `searchParams` is intentionally excluded: it is read through a ref-stable
    // getter here and re-running on every param change would re-toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthNotice, router, pathname, retryConnectors]);

  const setActiveStatus = useCallback(
    (status: StatusFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      if (status === 'all') {
        params.delete('status');
      } else {
        params.set('status', status);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Reset to page 1 whenever filters change
  const prevFiltersRef = React.useRef({ searchQuery, activeCategory, activeStatus });
  React.useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.searchQuery !== searchQuery ||
      prev.activeCategory !== activeCategory ||
      prev.activeStatus !== activeStatus
    ) {
      setCurrentPage(1);
      prevFiltersRef.current = { searchQuery, activeCategory, activeStatus };
    }
  }, [searchQuery, activeCategory, activeStatus]);

  const filteredConnectors = useMemo(() => {
    return VISIBLE_CONNECTORS.filter((c) => {
      const matchesCategory = activeCategory === 'All' || c.category === activeCategory;
      const matchesSearch =
        !searchQuery ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        activeStatus === 'all' ||
        (activeStatus === 'connected' && connectedIds.has(c.id)) ||
        (activeStatus === 'ready' && !connectedIds.has(c.id) && isAvailable(c)) ||
        (activeStatus === 'request_access' && !connectedIds.has(c.id) && !isAvailable(c));
      return matchesCategory && matchesSearch && matchesStatus;
    });
  }, [searchQuery, activeCategory, activeStatus, connectedIds, isAvailable]);

  const connectedConnectors = filteredConnectors.filter((c) => connectedIds.has(c.id));
  const readyConnectors = filteredConnectors.filter(
    (c) => !connectedIds.has(c.id) && isAvailable(c),
  );
  const requestAccessConnectors = filteredConnectors.filter(
    (c) => !connectedIds.has(c.id) && !isAvailable(c),
  );
  const visibleConnectedCount = useMemo(
    () => VISIBLE_CONNECTORS.filter((connector) => connectedIds.has(connector.id)).length,
    [connectedIds],
  );

  const browseConnectors =
    activeStatus === 'ready'
      ? readyConnectors
      : activeStatus === 'request_access'
        ? requestAccessConnectors
        : filteredConnectors.filter((c) => !connectedIds.has(c.id));
  const browseGroupLabel =
    activeStatus === 'ready'
      ? 'Ready'
      : activeStatus === 'request_access'
        ? 'Not available here'
        : 'Browse';
  const totalBrowsePages = Math.ceil(browseConnectors.length / ITEMS_PER_PAGE);
  const pagedBrowseConnectors = browseConnectors.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const handleConnect = useCallback(
    async (id: string) => {
      const connector = VISIBLE_CONNECTORS.find((c) => c.id === id);
      if (!connector) return;
      await connect(id, connector.authType);
    },
    [connect],
  );

  return (
    <ErrorBoundary componentName="ConnectorsPage" compact>
      <div className="min-h-full bg-background">
        {/* Page Header */}
        <div className="border-b border-border bg-muted/20 px-6 py-6">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Connectors</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect your tools and give your AI agents access to the apps you use every day.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-border text-xs text-muted-foreground">
                  {visibleConnectedCount} connected
                </Badge>
                <Badge variant="outline" className="border-border text-xs text-muted-foreground">
                  {VISIBLE_CONNECTORS.length} total
                </Badge>
              </div>
            </div>

            {/* Status filter + Search row */}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* Tri-state status filter */}
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-0.5">
                {STATUS_FILTERS.map((sf) => (
                  <button
                    key={sf.value}
                    onClick={() => setActiveStatus(sf.value)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150',
                      activeStatus === sf.value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    aria-pressed={activeStatus === sf.value}
                  >
                    {sf.label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search connectors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 border-border bg-background pl-9 text-sm placeholder:text-muted-foreground/60 focus:border-primary/50"
                />
              </div>
            </div>

            {/* Category Tabs */}
            <div className="scrollbar-hide mt-3 flex gap-1 overflow-x-auto">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setActiveCategory(cat.value)}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150',
                    activeCategory === cat.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Master-detail layout */}
        <div className="mx-auto max-w-6xl px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : connectorsError ? (
            // Distinct from "zero connectors" — without this, a failed
            // GET /api/connectors rendered identically to a genuinely empty
            // account, with no signal anything went wrong.
            <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-16 text-center">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              <p className="text-sm text-destructive">{connectorsError}</p>
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-destructive/30 px-3 text-xs text-destructive hover:bg-destructive/10"
                onClick={() => retryConnectors()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="flex gap-0 lg:gap-4">
              {/* ── Left: scrollable compact list ───────────────────────────── */}
              <div
                className={cn(
                  'w-full lg:w-64 xl:w-72 shrink-0',
                  // On mobile, hide list when a connector is selected (drill-down)
                  selectedConnector ? 'hidden lg:block' : 'block',
                )}
              >
                {/* Connected group — catalog connectors only. This page is the
                    public directory (unauthenticated visitors only; see
                    app/connectors/page.tsx), so it has no user-added custom
                    MCP connectors to show — that list lives in the settings
                    modal's Connectors section (signed-in only). */}
                {connectedConnectors.length > 0 && (
                  <div className="mb-4">
                    <div className="mb-1.5 flex items-center gap-1.5 px-1">
                      <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Connected ({connectedConnectors.length})
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {connectedConnectors.map((connector) => (
                        <ConnectorListRow
                          key={connector.id}
                          connector={connector}
                          selected={selectedConnector?.id === connector.id}
                          connected
                          onClick={() => setSelectedConnector(connector)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Ready/request-access group */}
                {browseConnectors.length > 0 && (
                  <div className="mb-4">
                    <div className="mb-1.5 px-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {browseGroupLabel} ({browseConnectors.length})
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {pagedBrowseConnectors.map((connector) => (
                        <ConnectorListRow
                          key={connector.id}
                          connector={connector}
                          selected={selectedConnector?.id === connector.id}
                          connected={false}
                          onClick={() => setSelectedConnector(connector)}
                        />
                      ))}
                    </div>

                    {/* Pagination */}
                    {totalBrowsePages > 1 && (
                      <div className="mt-3 flex items-center justify-between px-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 border-border px-2 text-[11px] disabled:opacity-40"
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage <= 1}
                        >
                          Prev
                        </Button>
                        <span className="text-[11px] text-muted-foreground">
                          {currentPage}/{totalBrowsePages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 border-border px-2 text-[11px] disabled:opacity-40"
                          onClick={() => setCurrentPage((p) => Math.min(totalBrowsePages, p + 1))}
                          disabled={currentPage >= totalBrowsePages}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Empty states */}
                {activeStatus === 'connected' && filteredConnectors.length === 0 && (
                  <div className="py-10 text-center">
                    <p className="text-xs text-muted-foreground">No connected connectors yet.</p>
                  </div>
                )}
                {filteredConnectors.length === 0 && activeStatus !== 'connected' && (
                  <div className="py-10 text-center">
                    <p className="text-xs text-muted-foreground">No connectors found.</p>
                  </div>
                )}
              </div>

              {/* ── Right: detail panel ──────────────────────────────────────── */}
              <div
                className={cn(
                  'min-w-0 flex-1',
                  // On mobile show detail panel only when something is selected
                  selectedConnector ? 'block' : 'hidden lg:block',
                )}
              >
                {selectedConnector ? (
                  <ConnectorDetailPanel
                    connector={selectedConnector}
                    connected={connectedIds.has(selectedConnector.id)}
                    available={isAvailable(selectedConnector)}
                    source={sources[selectedConnector.id]}
                    mutating={mutatingIds.has(selectedConnector.id)}
                    connectedAt={connectedAtMap[selectedConnector.id]}
                    grantedScopes={grantedScopes[selectedConnector.id]}
                    needsReauthorization={needsReauthorizationIds.has(selectedConnector.id)}
                    onBack={() => setSelectedConnector(null)}
                    onConnect={() => setOverviewConnector(selectedConnector)}
                    onReconnect={() => void reconnect(selectedConnector.id)}
                    onDisconnect={() => void disconnect(selectedConnector.id)}
                  />
                ) : (
                  /* Placeholder shown on desktop when nothing is selected */
                  <div className="hidden h-full items-center justify-center lg:flex">
                    <div className="text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                        <Zap className="h-5 w-5 text-muted-foreground/60" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Select a connector to view details
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Roadmap Callout - shown below master-detail (not during an error state, so the retry banner stays the focus) */}
          {!loading && !connectorsError && (
            <div className="mt-6 rounded-xl border border-border bg-muted/40 p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground">Connector roadmap</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    We&apos;re rolling out connectors in phases, starting from core productivity
                    tools to AI models, marketing platforms, and enterprise apps. Coming-soon
                    connectors are browsable so you can plan what to connect; they become
                    connectable as each integration ships.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[
                      'Airtable',
                      'Trello',
                      'ClickUp',
                      'Pipedrive',
                      'Twilio',
                      'SendGrid',
                      'Ahrefs',
                      'QuickBooks',
                      'Dropbox',
                      'Figma',
                    ].map((name) => (
                      <Badge
                        key={name}
                        variant="outline"
                        className="border-border px-2 py-0 text-[10px] text-muted-foreground"
                      >
                        {name}
                      </Badge>
                    ))}
                    <Badge
                      variant="outline"
                      className="border-border px-2 py-0 text-[10px] text-muted-foreground"
                    >
                      More planned
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConnectorOverviewDialog
        connector={overviewConnector}
        open={overviewConnector !== null}
        onOpenChange={(open) => {
          if (!open) setOverviewConnector(null);
        }}
        onConnect={() => {
          if (overviewConnector) void handleConnect(overviewConnector.id);
        }}
      />
    </ErrorBoundary>
  );
}
