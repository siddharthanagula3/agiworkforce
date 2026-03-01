import { Search, Unplug } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnectorsStore } from '../../stores/connectorsStore';
import { CONNECTORS, CONNECTOR_CATEGORIES, type ConnectorCategory } from './connectorDefinitions';
import { ConnectorCard } from './ConnectorCard';
import { ConnectorOAuthFlow, type OAuthFlowState } from './ConnectorOAuthFlow';

export function ConnectorsGallery() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<ConnectorCategory | 'All'>('All');
  const [oauthState, setOauthState] = useState<OAuthFlowState>({ status: 'idle' });

  const { connectedIds, loading, error, connect, disconnect, fetchConnected, clearError } =
    useConnectorsStore();

  useEffect(() => {
    void fetchConnected();
  }, [fetchConnected]);

  const filtered = useMemo(() => {
    return CONNECTORS.filter((c) => {
      const matchesSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeCategory === 'All' || c.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [search, activeCategory]);

  const handleConnect = useCallback(
    async (id: string) => {
      const connector = CONNECTORS.find((c) => c.id === id);
      if (!connector) return;

      setOauthState({ status: 'connecting', connectorName: connector.name });
      try {
        await connect(id);
        setOauthState({ status: 'success', connectorName: connector.name });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Connection failed';
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

  const lastConnectorName =
    oauthState.status !== 'idle' ? oauthState.connectorName : '';

  const handleRetry = useCallback(() => {
    const connector = CONNECTORS.find((c) => c.name === lastConnectorName);
    if (connector) {
      void handleConnect(connector.id);
    }
  }, [lastConnectorName, handleConnect]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Connectors</h3>
        <p className="text-sm text-muted-foreground">
          Connect your favorite services to use them directly in conversations.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search connectors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-background
            placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory('All')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors
            ${activeCategory === 'All' ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
        >
          All
        </button>
        {CONNECTOR_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors
              ${activeCategory === cat ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Connector grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((connector) => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              connected={connectedIds.includes(connector.id)}
              loading={Boolean(loading[connector.id])}
              error={error[connector.id] ?? null}
              onConnect={() => {
                clearError(connector.id);
                void handleConnect(connector.id);
              }}
              onDisconnect={() => void handleDisconnect(connector.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Unplug className="h-10 w-10 mb-3 opacity-50" />
          <p className="text-sm font-medium">No connectors found</p>
          <p className="text-xs mt-1">Try a different search or category.</p>
        </div>
      )}

      <ConnectorOAuthFlow
        state={oauthState}
        onClose={() => setOauthState({ status: 'idle' })}
        onRetry={handleRetry}
      />
    </div>
  );
}
