'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Search,
  Plus,
  Check,
  Zap,
  Lock,
  ExternalLink,
  Loader2,
  Link2,
  BookOpen,
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
import { getConnectorTools } from '../config/connector-logos';
import { ConnectorOverviewDialog } from '../components/ConnectorOverviewDialog';
import { OfficialConnectorLogo } from '../components/OfficialConnectorLogo';
import { getCsrfToken } from '@/lib/client/csrf';

import {
  CATEGORIES,
  CONNECTORS,
  getConnectorAvailabilityLabel,
  isConnectorReady,
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
  { label: 'Request access', value: 'request_access' },
];

// ─── InspectMcpServerDialog ───────────────────────────────────────────────────

interface InspectMcpServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type McpInspectResult = {
  serverName: string;
  tools: Array<{
    name: string;
    description: string;
  }>;
};

function InspectMcpServerDialog({ open, onOpenChange }: InspectMcpServerDialogProps) {
  const [mcpUrl, setMcpUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectResult, setInspectResult] = useState<McpInspectResult | null>(null);

  const handleInspect = useCallback(async () => {
    const trimmedUrl = mcpUrl.trim();
    if (!trimmedUrl) {
      setError('MCP server URL is required.');
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmedUrl);
    } catch {
      setError('Enter a valid HTTP or HTTPS URL.');
      return;
    }
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      setError('MCP server URL must use HTTP or HTTPS.');
      return;
    }

    setError(null);
    setInspectResult(null);
    setIsInspecting(true);
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          serverName: parsedUrl.hostname.replace(/^www\./, '').slice(0, 100),
          config: {
            url: trimmedUrl,
            transport: parsedUrl.pathname.endsWith('/sse') ? 'sse' : 'streamable-http',
            ...(authToken.trim()
              ? {
                  headers: {
                    Authorization: `Bearer ${authToken.trim()}`,
                  },
                }
              : {}),
          },
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
      }

      const body = (await response.json()) as {
        server?: {
          serverName?: string;
          tools?: Array<{
            toolName?: string;
            title?: string;
            description?: string;
            fallbackDescription?: string;
          }>;
        };
      };
      const tools = body.server?.tools ?? [];
      setInspectResult({
        serverName: body.server?.serverName ?? parsedUrl.hostname,
        tools: tools.map((tool) => ({
          name: tool.title ?? tool.toolName ?? 'Unnamed tool',
          description: tool.description ?? tool.fallbackDescription ?? 'No description.',
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to inspect MCP server.');
    } finally {
      setIsInspecting(false);
    }
  }, [authToken, mcpUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/[0.08] bg-[#0f0e0d] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-foreground">
            Inspect MCP server
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Inspect an HTTP MCP-compatible server and review its advertised tools.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Option 1: MCP URL */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">MCP server URL</span>
            </div>
            <div className="space-y-2">
              <Input
                placeholder="https://mcp.example.com/sse"
                type="url"
                value={mcpUrl}
                onChange={(e) => {
                  setMcpUrl(e.target.value);
                  setError(null);
                  setInspectResult(null);
                }}
                className="h-9 border-white/[0.08] bg-white/[0.04] text-sm placeholder:text-muted-foreground/60"
                aria-label="MCP server URL"
              />
              <Input
                placeholder="Auth token (optional)"
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                className="h-9 border-white/[0.08] bg-white/[0.04] text-sm placeholder:text-muted-foreground/60"
                aria-label="MCP auth token"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button
                size="sm"
                className="h-8 w-full text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => void handleInspect()}
                disabled={isInspecting}
              >
                {isInspecting ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-3 w-3" />
                )}
                Inspect tools
              </Button>
              {inspectResult && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Found {inspectResult.tools.length} tools on {inspectResult.serverName}
                  </div>
                  {inspectResult.tools.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {inspectResult.tools.slice(0, 5).map((tool) => (
                        <li key={tool.name}>
                          <span className="text-foreground">{tool.name}</span>
                          <span className="ml-1">{tool.description}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Option 2: MCP Directory */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">Browse MCP directory</span>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              Explore community-built MCP servers for databases, APIs, dev tools, and more.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 flex-1 text-xs border-white/[0.08] hover:border-white/[0.16]"
                asChild
              >
                <a href="/connectors/mcp-directory">Browse directory</a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-muted-foreground"
                onClick={() =>
                  window.open('https://modelcontextprotocol.io', '_blank', 'noopener,noreferrer')
                }
              >
                MCP docs
                <ExternalLink className="ml-1.5 h-3 w-3" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
        : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
    )}
  >
    <OfficialConnectorLogo connector={connector} />
    <span className="min-w-0 flex-1 truncate text-xs font-medium">{connector.name}</span>
    {connected ? <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> : null}
  </button>
);

// ─── ConnectorDetailPanel ─────────────────────────────────────────────────────
// Right-side detail view for the selected connector

interface ConnectorDetailPanelProps {
  connector: Connector;
  connected: boolean;
  mutating: boolean;
  connectedAt?: string;
  onBack: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onUpgrade: () => void;
}

function useConnectorTools(connectorId: string): string[] {
  return React.useMemo(() => getConnectorTools(connectorId), [connectorId]);
}

const ConnectorDetailPanel: React.FC<ConnectorDetailPanelProps> = ({
  connector,
  connected,
  mutating,
  connectedAt,
  onBack,
  onConnect,
  onDisconnect,
  onUpgrade,
}) => {
  const isAvailable = isConnectorReady(connector);
  const hasRealCredentials = connected && isAvailable;
  const availabilityLabel = getConnectorAvailabilityLabel(connector);
  const tools = useConnectorTools(connector.id);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-card p-5">
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
            {!isAvailable && (
              <Badge
                variant="outline"
                className="border-white/10 px-1.5 py-0 text-[10px] text-muted-foreground"
              >
                {availabilityLabel}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {connector.authType === 'oauth'
              ? 'OAuth 2.0'
              : connector.authType === 'api_key'
                ? 'API Key'
                : connector.authType === 'pat'
                  ? 'Personal Access Token'
                  : 'Connection String'}{' '}
            &middot; {connector.actionCount} actions
          </p>
        </div>

        {/* Primary action */}
        <div className="shrink-0">
          {hasRealCredentials ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={onDisconnect}
                disabled={mutating}
              >
                {mutating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Disconnect'}
              </Button>
            </div>
          ) : !isAvailable ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground"
              onClick={onUpgrade}
            >
              <Lock className="mr-1.5 h-3 w-3" />
              Request access
            </Button>
          ) : (
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
          )}
        </div>
      </div>

      {hasRealCredentials && connectedAt && (
        <p className="mb-3 text-[10px] text-muted-foreground/60">
          Connected {formatRelativeTime(connectedAt)}
        </p>
      )}

      {/* Description */}
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{connector.description}</p>

      {/* Tools */}
      {tools.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Tools ({tools.length})</span>
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
    </div>
  );
};

// ─── ConnectorsPage ────────────────────────────────────────────────────────────

export function ConnectorsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ConnectorCategory | 'All'>('All');
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [connectedAtMap, setConnectedAtMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());
  const [showInspectDialog, setShowInspectDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  // Master-detail: which connector row is selected in the left list
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null);
  // Overview dialog: shown before connecting
  const [overviewConnector, setOverviewConnector] = useState<Connector | null>(null);

  const ITEMS_PER_PAGE = 20;

  // Status filter is stored in URL search params so it persists on refresh/share
  const rawStatus = searchParams.get('status');
  const activeStatus: StatusFilter =
    rawStatus === 'connected' || rawStatus === 'ready' || rawStatus === 'request_access'
      ? rawStatus
      : 'all';

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

  // Fetch connected connectors only for signed-in users. Public visitors can
  // browse the directory without generating 401 console noise.
  useEffect(() => {
    let cancelled = false;
    async function fetchConnectors() {
      if (!authLoaded) return;
      if (!isSignedIn) {
        setConnectedIds(new Set());
        setConnectedAtMap({});
        setLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/connectors');
        if (!res.ok) {
          // User may not be authenticated · degrade gracefully to empty set
          setLoading(false);
          return;
        }
        const json = (await res.json()) as {
          connectors: Array<{ connectorId: string; connectedAt?: string }>;
        };
        if (!cancelled) {
          setConnectedIds(new Set(json.connectors.map((c) => c.connectorId)));
          const atMap: Record<string, string> = {};
          for (const c of json.connectors) {
            if (c.connectedAt) atMap[c.connectorId] = c.connectedAt;
          }
          setConnectedAtMap(atMap);
        }
      } catch {
        // Network error · degrade gracefully
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchConnectors();
    return () => {
      cancelled = true;
    };
  }, [authLoaded, isSignedIn]);

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
        (activeStatus === 'ready' && !connectedIds.has(c.id) && isConnectorReady(c)) ||
        (activeStatus === 'request_access' && !connectedIds.has(c.id) && !isConnectorReady(c));
      return matchesCategory && matchesSearch && matchesStatus;
    });
  }, [searchQuery, activeCategory, activeStatus, connectedIds]);

  const connectedConnectors = filteredConnectors.filter((c) => connectedIds.has(c.id));
  const readyConnectors = filteredConnectors.filter(
    (c) => !connectedIds.has(c.id) && isConnectorReady(c),
  );
  const requestAccessConnectors = filteredConnectors.filter(
    (c) => !connectedIds.has(c.id) && !isConnectorReady(c),
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
        ? 'Request access'
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
      if (!isSignedIn) {
        router.push(`/login?redirectTo=${encodeURIComponent(pathname || '/connectors')}`);
        return;
      }

      // Optimistic update
      setConnectedIds((prev) => new Set([...prev, id]));
      setMutatingIds((prev) => new Set([...prev, id]));

      try {
        const csrfToken = await getCsrfToken();
        const res = await fetch('/api/connectors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ connectorId: id, authType: connector.authType }),
        });
        if (!res.ok) {
          // Revert optimistic update on failure
          setConnectedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      } catch {
        // Revert on network error
        setConnectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } finally {
        setMutatingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [isSignedIn, pathname, router],
  );

  const handleDisconnect = useCallback(
    async (id: string) => {
      if (!isSignedIn) {
        router.push(`/login?redirectTo=${encodeURIComponent(pathname || '/connectors')}`);
        return;
      }

      // Optimistic update
      setConnectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setMutatingIds((prev) => new Set([...prev, id]));

      try {
        const csrfToken = await getCsrfToken();
        const res = await fetch(`/api/connectors?connectorId=${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'x-csrf-token': csrfToken },
        });
        if (!res.ok) {
          // Revert on failure
          setConnectedIds((prev) => new Set([...prev, id]));
        }
      } catch {
        // Revert on network error
        setConnectedIds((prev) => new Set([...prev, id]));
      } finally {
        setMutatingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [isSignedIn, pathname, router],
  );

  return (
    <ErrorBoundary componentName="ConnectorsPage" compact>
      <div className="min-h-full bg-background">
        {/* Page Header */}
        <div className="border-b border-white/[0.06] bg-black/20 px-6 py-6">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Connectors</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect your tools and give your AI agents access to the apps you use every day.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-white/10 text-xs text-muted-foreground">
                  {visibleConnectedCount} connected
                </Badge>
                <Badge variant="outline" className="border-white/10 text-xs text-muted-foreground">
                  {VISIBLE_CONNECTORS.length} total
                </Badge>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
                  onClick={() => setShowInspectDialog(true)}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Inspect MCP server
                </Button>
              </div>
            </div>

            {/* Status filter + Search row */}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* Tri-state status filter */}
              <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-0.5">
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
                  className="h-9 border-white/[0.08] bg-white/[0.04] pl-9 text-sm placeholder:text-muted-foreground/60 focus:border-primary/50"
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
                      : 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
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
                {/* Connected group */}
                {connectedConnectors.length > 0 && (
                  <div className="mb-4">
                    <div className="mb-1.5 flex items-center gap-1.5 px-1">
                      <Check className="h-3 w-3 text-emerald-400" />
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
                          className="h-7 border-white/[0.08] px-2 text-[11px] disabled:opacity-40"
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
                          className="h-7 border-white/[0.08] px-2 text-[11px] disabled:opacity-40"
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
                    mutating={mutatingIds.has(selectedConnector.id)}
                    connectedAt={connectedAtMap[selectedConnector.id]}
                    onBack={() => setSelectedConnector(null)}
                    onConnect={() => setOverviewConnector(selectedConnector)}
                    onDisconnect={() => void handleDisconnect(selectedConnector.id)}
                    onUpgrade={() => router.push('/pricing')}
                  />
                ) : (
                  /* Placeholder shown on desktop when nothing is selected */
                  <div className="hidden h-full items-center justify-center lg:flex">
                    <div className="text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04]">
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

          {/* Roadmap Callout - shown below master-detail */}
          {!loading && (
            <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground">Connector roadmap</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    We&apos;re rolling out connectors in phases, starting from core productivity
                    tools to AI models, marketing platforms, and enterprise apps. Phase labels show
                    the planned rollout order; request-access connectors are visible for demos and
                    account-bound upgrade planning.
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
                        className="border-white/[0.08] px-2 py-0 text-[10px] text-muted-foreground"
                      >
                        {name}
                      </Badge>
                    ))}
                    <Badge
                      variant="outline"
                      className="border-white/[0.08] px-2 py-0 text-[10px] text-muted-foreground"
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

      <InspectMcpServerDialog open={showInspectDialog} onOpenChange={setShowInspectDialog} />

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
