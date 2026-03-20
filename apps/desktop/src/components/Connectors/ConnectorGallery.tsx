import { Check, Plus, Search, Unplug, Wifi } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { useConnectorsStore } from '../../stores/connectorsStore';
import { useSettingsDialogStore } from '../../stores/settingsDialogStore';
import {
  CONNECTORS,
  CONNECTOR_CATEGORIES,
  FEATURED_CONNECTORS,
  type ConnectorCategory,
  type ConnectorDef,
} from './connectorDefinitions';
import { isTauri } from '../../lib/tauri-mock';
import { McpClient } from '@/api/mcp';
import { OAuthConnectorCard } from './OAuthConnectorCard';
import { ConnectorOAuthFlow, type OAuthFlowState } from './ConnectorOAuthFlow';
import { ConnectorApiKeyDialog } from './ConnectorApiKeyDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';

type ViewTab = 'featured' | 'all';
type StatusFilter = 'all' | 'connected' | 'available';

/**
 * ConnectorGallery displays connectors as a visual grid of OAuthConnectorCard
 * components. Each card shows the connector icon, name, status (green/red),
 * and a Connect / Disconnect button.
 *
 * Features:
 * - Featured / All tabs
 * - All / Connected / Available status filter pills
 * - Search bar
 * - Category filter (Productivity, Development, Communication, Analytics, etc.)
 * - "+ Custom connector" button that opens MCP settings
 * - OAuth flow dialog for in-progress connections
 * - API key dialog for API-key-based connectors
 */
export function ConnectorGallery() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ViewTab>('featured');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<ConnectorCategory | 'all'>('all');
  const [oauthState, setOauthState] = useState<OAuthFlowState>({ status: 'idle' });
  const [apiKeyDialogConnector, setApiKeyDialogConnector] = useState<ConnectorDef | null>(null);

  const openSettings = useSettingsDialogStore((s) => s.openSettings);

  const {
    connectedIds,
    loading,
    error,
    connect,
    connectWithApiKey,
    disconnect,
    fetchConnected,
    clearError,
    completeOAuth,
  } = useConnectorsStore(
    useShallow((s) => ({
      connectedIds: s.connectedIds,
      loading: s.loading,
      error: s.error,
      connect: s.connect,
      connectWithApiKey: s.connectWithApiKey,
      disconnect: s.disconnect,
      fetchConnected: s.fetchConnected,
      clearError: s.clearError,
      completeOAuth: s.completeOAuth,
    })),
  );

  // Fetch connected status on mount
  useEffect(() => {
    void fetchConnected();
  }, [fetchConnected]);

  // Listen for OAuth callbacks from Tauri
  useEffect(() => {
    if (!isTauri) return;

    const handleOAuthCallback = async (event: Event) => {
      const { provider, code, state } = (event as CustomEvent).detail;
      const connector = CONNECTORS.find((c) => c.id === provider || c.oauthProvider === provider);
      if (connector) {
        setOauthState({ status: 'connecting', connectorName: connector.name });
      }
      try {
        await McpClient.oauthCallbackRaw(provider, code, state);
        await completeOAuth(provider);
        if (connector) {
          setOauthState({ status: 'success', connectorName: connector.name });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setOauthState({
          status: 'error',
          connectorName: connector?.name ?? provider,
          message,
        });
      }
    };

    const handleOAuthError = (event: Event) => {
      const { provider, error: oauthError, error_description } = (event as CustomEvent).detail;
      const connector = CONNECTORS.find((c) => c.id === provider);
      setOauthState({
        status: 'error',
        connectorName: connector?.name ?? provider,
        message: error_description || oauthError || 'OAuth authorization failed',
      });
    };

    window.addEventListener('mcp-oauth-callback', handleOAuthCallback);
    window.addEventListener('mcp-oauth-error', handleOAuthError);
    return () => {
      window.removeEventListener('mcp-oauth-callback', handleOAuthCallback);
      window.removeEventListener('mcp-oauth-error', handleOAuthError);
    };
  }, [completeOAuth]);

  // Determine which source list to use
  const sourceList = activeTab === 'featured' ? FEATURED_CONNECTORS : CONNECTORS;

  // Filter by search text, category, and connection status
  const filtered = useMemo(() => {
    return sourceList.filter((c) => {
      const matchesSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || c.category === categoryFilter;
      const isConnected = connectedIds.includes(c.id);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'connected' && isConnected) ||
        (statusFilter === 'available' && !isConnected && !c.comingSoon);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [sourceList, search, categoryFilter, statusFilter, connectedIds]);

  const connectedCount = connectedIds.length;

  // Start connection flow
  const handleConnect = useCallback(
    async (id: string) => {
      const connector = CONNECTORS.find((c) => c.id === id);
      if (!connector) return;

      setOauthState({ status: 'connecting', connectorName: connector.name });
      try {
        await connect(id);
        if (connector.authType === 'oauth') {
          // OAuth opens browser — close the connecting dialog; the card will
          // remain in "+" state until the OAuth callback is received.
          setOauthState({ status: 'idle' });
        } else {
          setOauthState({ status: 'success', connectorName: connector.name });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setOauthState({ status: 'error', connectorName: connector.name, message });
      }
    },
    [connect],
  );

  const handleDisconnect = useCallback(
    async (id: string) => {
      await disconnect(id);
    },
    [disconnect],
  );

  const handleConnectClick = useCallback(
    (connector: ConnectorDef) => {
      clearError(connector.id);
      if (connector.authType === 'api_key') {
        setApiKeyDialogConnector(connector);
      } else {
        void handleConnect(connector.id);
      }
    },
    [clearError, handleConnect],
  );

  const handleApiKeyConnect = useCallback(
    async (connector: ConnectorDef, apiKey: string) => {
      setApiKeyDialogConnector(null);
      setOauthState({ status: 'connecting', connectorName: connector.name });
      try {
        await connectWithApiKey(connector.id, apiKey);
        setOauthState({ status: 'success', connectorName: connector.name });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Connection failed';
        setOauthState({ status: 'error', connectorName: connector.name, message });
      }
    },
    [connectWithApiKey],
  );

  const lastConnectorName = oauthState.status !== 'idle' ? oauthState.connectorName : '';

  const handleRetry = useCallback(() => {
    const connector = CONNECTORS.find((c) => c.name === lastConnectorName);
    if (connector) {
      void handleConnect(connector.id);
    }
  }, [lastConnectorName, handleConnect]);

  const handleAddCustomConnector = useCallback(() => {
    openSettings('mcp-skills');
  }, [openSettings]);

  // Grid content — shared between tab panels
  const GridContent = useCallback(
    ({ items }: { items: ConnectorDef[] }) => {
      if (items.length === 0) {
        return <EmptyState statusFilter={statusFilter} />;
      }
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((connector) => (
            <OAuthConnectorCard
              key={connector.id}
              connector={connector}
              connected={connectedIds.includes(connector.id)}
              loading={Boolean(loading[connector.id])}
              error={error[connector.id] ?? null}
              onConnect={() => handleConnectClick(connector)}
              onDisconnect={() => void handleDisconnect(connector.id)}
            />
          ))}
        </div>
      );
    },
    [connectedIds, loading, error, handleConnectClick, handleDisconnect, statusFilter],
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Connectors</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Connect to your apps, files, and services via OAuth or API keys.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {connectedCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-green-500/15 px-3 py-1 text-xs font-medium text-green-500">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {connectedCount} connected
            </div>
          )}
          <button
            type="button"
            onClick={handleAddCustomConnector}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5
              text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent
              transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Custom connector
          </button>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-1.5">
        {(
          [
            { value: 'all', label: 'All' },
            { value: 'connected', label: 'Connected' },
            { value: 'available', label: 'Available' },
          ] as { value: StatusFilter; label: string }[]
        ).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              statusFilter === value
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
            )}
          >
            {label}
            {value === 'connected' && connectedCount > 0 && (
              <span className="ml-1.5 tabular-nums">{connectedCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tabs + Search + Category filter */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ViewTab)}
        className="space-y-4"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Left: tab switches */}
          <TabsList className="h-9">
            <TabsTrigger value="featured" className="text-xs px-3 py-1">
              Featured
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs px-3 py-1">
              All
            </TabsTrigger>
          </TabsList>

          {/* Right: search + category */}
          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            <div className="relative max-w-[220px] flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search connectors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background
                  placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <Select
              value={categoryFilter}
              onValueChange={(v) => setCategoryFilter(v as ConnectorCategory | 'all')}
            >
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CONNECTOR_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Featured tab content */}
        <TabsContent value="featured">
          <GridContent items={filtered} />
        </TabsContent>

        {/* All tab content */}
        <TabsContent value="all">
          <GridContent items={filtered} />
        </TabsContent>
      </Tabs>

      {/* OAuth flow dialog */}
      <ConnectorOAuthFlow
        state={oauthState}
        onClose={() => setOauthState({ status: 'idle' })}
        onRetry={handleRetry}
      />

      {/* API key dialog (initial connect) */}
      <ConnectorApiKeyDialog
        connector={apiKeyDialogConnector}
        open={apiKeyDialogConnector !== null}
        onClose={() => setApiKeyDialogConnector(null)}
        onConnect={handleApiKeyConnect}
      />
    </div>
  );
}

interface EmptyStateProps {
  statusFilter: StatusFilter;
}

function EmptyState({ statusFilter }: EmptyStateProps) {
  if (statusFilter === 'connected') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Wifi className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No connected apps yet</p>
        <p className="text-xs mt-1 opacity-70">
          Switch to "Available" to browse and connect your first app.
        </p>
      </div>
    );
  }

  if (statusFilter === 'available') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Check className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">All connectors are connected</p>
        <p className="text-xs mt-1 opacity-70">You've connected everything in this view.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Unplug className="h-10 w-10 mb-3 opacity-40" />
      <p className="text-sm font-medium">No connectors found</p>
      <p className="text-xs mt-1 opacity-70">Try a different search or category.</p>
    </div>
  );
}
