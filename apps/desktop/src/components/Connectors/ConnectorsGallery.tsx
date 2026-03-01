import { Search, Unplug } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnectorsStore } from '../../stores/connectorsStore';
import {
  CONNECTORS,
  CONNECTOR_CATEGORIES,
  FEATURED_CONNECTORS,
  type ConnectorCategory,
  type ConnectorDef,
} from './connectorDefinitions';
import { invoke, isTauri } from '../../lib/tauri-mock';
import { ConnectorCard } from './ConnectorCard';
import { ConnectorOAuthFlow, type OAuthFlowState } from './ConnectorOAuthFlow';
import { ConnectorApiKeyDialog } from './ConnectorApiKeyDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';

type ViewTab = 'featured' | 'all';

export function ConnectorsGallery() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ViewTab>('featured');
  const [categoryFilter, setCategoryFilter] = useState<ConnectorCategory | 'all'>('all');
  const [oauthState, setOauthState] = useState<OAuthFlowState>({ status: 'idle' });
  const [apiKeyDialogConnector, setApiKeyDialogConnector] = useState<ConnectorDef | null>(null);

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
  } = useConnectorsStore();

  useEffect(() => {
    void fetchConnected();
  }, [fetchConnected]);

  useEffect(() => {
    if (!isTauri) return;

    const handleOAuthCallback = async (event: Event) => {
      const { provider, code, state } = (event as CustomEvent).detail;
      const connector = CONNECTORS.find((c) => c.id === provider || c.oauthProvider === provider);
      if (connector) {
        setOauthState({ status: 'connecting', connectorName: connector.name });
      }
      try {
        await invoke('mcp_oauth_callback', { provider, code, callbackState: state });
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
      const { provider, error, error_description } = (event as CustomEvent).detail;
      const connector = CONNECTORS.find((c) => c.id === provider);
      setOauthState({
        status: 'error',
        connectorName: connector?.name ?? provider,
        message: error_description || error || 'OAuth authorization failed',
      });
    };

    window.addEventListener('mcp-oauth-callback', handleOAuthCallback);
    window.addEventListener('mcp-oauth-error', handleOAuthError);
    return () => {
      window.removeEventListener('mcp-oauth-callback', handleOAuthCallback);
      window.removeEventListener('mcp-oauth-error', handleOAuthError);
    };
  }, [completeOAuth]);

  const sourceList = activeTab === 'featured' ? FEATURED_CONNECTORS : CONNECTORS;

  const filtered = useMemo(() => {
    return sourceList.filter((c) => {
      const matchesSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || c.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [sourceList, search, categoryFilter]);

  const handleConnect = useCallback(
    async (id: string) => {
      const connector = CONNECTORS.find((c) => c.id === id);
      if (!connector) return;

      setOauthState({ status: 'connecting', connectorName: connector.name });
      try {
        await connect(id);
        // For OAuth, connect() opens a browser and returns — the connector isn't
        // connected yet. Only show success for non-OAuth connectors.
        if (connector.authType === 'oauth') {
          // Close dialog — the card will show "+" again until OAuth callback
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Connectors</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Connect to your apps, files, and services. You can also add a custom connector.
        </p>
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
          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map((connector) => (
                <ConnectorCard
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
          ) : (
            <EmptyState />
          )}
        </TabsContent>

        {/* All tab content */}
        <TabsContent value="all">
          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map((connector) => (
                <ConnectorCard
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
          ) : (
            <EmptyState />
          )}
        </TabsContent>
      </Tabs>

      {/* OAuth flow dialog */}
      <ConnectorOAuthFlow
        state={oauthState}
        onClose={() => setOauthState({ status: 'idle' })}
        onRetry={handleRetry}
      />

      {/* API key dialog */}
      <ConnectorApiKeyDialog
        connector={apiKeyDialogConnector}
        open={apiKeyDialogConnector !== null}
        onClose={() => setApiKeyDialogConnector(null)}
        onConnect={handleApiKeyConnect}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Unplug className="h-10 w-10 mb-3 opacity-40" />
      <p className="text-sm font-medium">No connectors found</p>
      <p className="text-xs mt-1 opacity-70">Try a different search or category.</p>
    </div>
  );
}
