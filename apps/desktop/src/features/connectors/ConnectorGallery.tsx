import {
  AlertCircle,
  Check,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Unplug,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { useConnectorsStore } from '../../stores/connectorsStore';
import {
  CONNECTORS,
  CONNECTOR_CATEGORIES,
  CONNECTOR_DIRECTORY,
  type ConnectorCategory,
  type ConnectorDef,
} from './connectorDefinitions';
import { isTauri } from '../../lib/tauri-mock';
import { McpClient } from '@/api/mcp';
import { ConnectorOAuthFlow, type OAuthFlowState } from './ConnectorOAuthFlow';
import { ConnectorApiKeyDialog } from './ConnectorApiKeyDialog';
import { CustomRemoteMcpConnectorDialog } from './CustomRemoteMcpConnectorDialog';
import { ConnectorDetailView } from './ConnectorDetailView';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';

function connectorAuthLabel(connector: ConnectorDef): string {
  switch (connector.authType) {
    case 'oauth':
      return 'OAuth';
    case 'api_key':
      return 'API key';
    case 'mcp_remote':
      return 'MCP';
    case 'none':
      return 'Built in';
  }
}

function connectorById(id: string): ConnectorDef | null {
  return CONNECTORS.find((connector) => connector.id === id) ?? null;
}

function ConnectorMark({
  connector,
  size = 'md',
}: {
  connector: ConnectorDef;
  size?: 'sm' | 'md';
}) {
  const [failed, setFailed] = useState(false);
  const wrapperSize = size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-10 w-10 rounded-xl';
  const imageSize = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center border border-border bg-muted/35',
        wrapperSize,
      )}
    >
      {connector.iconUrl && !failed ? (
        <img
          src={connector.iconUrl}
          alt=""
          className={cn('rounded-sm object-contain', imageSize)}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={size === 'sm' ? 'text-base' : 'text-lg'} aria-hidden>
          {connector.icon}
        </span>
      )}
    </div>
  );
}

function SettingsRowButton({
  children,
  disabled,
  onClick,
  className,
  title,
  ariaLabel,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border',
        'bg-muted/45 px-3 text-sm font-medium text-foreground transition-colors',
        'hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

interface ConnectedRowProps {
  connector: ConnectorDef;
  loading: boolean;
  error: string | null;
  expiresAt: number | null;
  onConfigure: () => void;
  onDisconnect: () => void;
  onRefresh?: () => Promise<void> | void;
}

function ConnectedConnectorRow({
  connector,
  loading,
  error,
  expiresAt,
  onConfigure,
  onDisconnect,
  onRefresh,
}: ConnectedRowProps) {
  const tokenExpired = typeof expiresAt === 'number' && expiresAt * 1000 < Date.now();

  return (
    <div className="flex items-center gap-3 border-b border-border/75 px-0 py-3 last:border-b-0">
      <ConnectorMark connector={connector} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{connector.name}</p>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Connected
          </span>
          <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
            {connectorAuthLabel(connector)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{connector.description}</p>
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onRefresh && tokenExpired ? (
          <SettingsRowButton disabled={loading} onClick={() => void onRefresh()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </SettingsRowButton>
        ) : null}
        <SettingsRowButton disabled={loading} onClick={onConfigure}>
          <Settings className="h-3.5 w-3.5" />
          Configure
        </SettingsRowButton>
        <Tooltip>
          <TooltipTrigger asChild>
            <SettingsRowButton
              disabled={loading}
              onClick={onDisconnect}
              ariaLabel={`Disconnect ${connector.name}`}
              className="w-8 px-0"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MoreHorizontal className="h-4 w-4" />
              )}
            </SettingsRowButton>
          </TooltipTrigger>
          <TooltipContent>Disconnect</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

interface AvailableCardProps {
  connector: ConnectorDef;
  loading: boolean;
  error: string | null;
  onConnect: () => void;
}

function AvailableConnectorCard({ connector, loading, error, onConnect }: AvailableCardProps) {
  return (
    <div className="group flex min-h-[104px] items-start gap-3 rounded-xl border border-border bg-card/45 p-3 transition-colors hover:bg-card/70">
      <ConnectorMark connector={connector} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">{connector.name}</p>
              <span className="text-xs text-muted-foreground">#{connector.category}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
              {connector.description}
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onConnect}
            aria-label={`Connect ${connector.name}`}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground',
              'transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-full bg-muted/45 px-2 py-0.5 text-[11px] text-muted-foreground">
            {connectorAuthLabel(connector)}
          </span>
          {connector.mcpPackage ? (
            <span className="rounded-full bg-muted/45 px-2 py-0.5 text-[11px] text-muted-foreground">
              MCP
            </span>
          ) : null}
        </div>
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/35 px-4 py-6 text-center">
      <Icon className="mx-auto h-5 w-5 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function ConnectorGallery() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ConnectorCategory | 'all'>('all');
  const [oauthState, setOauthState] = useState<OAuthFlowState>({ status: 'idle' });
  const [apiKeyDialogConnector, setApiKeyDialogConnector] = useState<ConnectorDef | null>(null);
  const [customConnectorOpen, setCustomConnectorOpen] = useState(false);
  const [detailConnectorId, setDetailConnectorId] = useState<string | null>(null);

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

  const [expiresAtByProvider, setExpiresAtByProvider] = useState<Record<string, number | null>>({});

  useEffect(() => {
    void fetchConnected();
  }, [fetchConnected]);

  useEffect(() => {
    if (connectedIds.length === 0) {
      setExpiresAtByProvider({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<string, number | null> = {};
      await Promise.all(
        connectedIds.map(async (id) => {
          try {
            const status = await McpClient.oauthStatus(
              id as Parameters<typeof McpClient.oauthStatus>[0],
            );
            next[id] = status.expiresAt ?? null;
          } catch {
            next[id] = null;
          }
        }),
      );
      if (!cancelled) setExpiresAtByProvider(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [connectedIds]);

  const handleRefreshToken = useCallback(async (connectorId: string) => {
    const refreshed = await McpClient.oauthRefresh(
      connectorId as Parameters<typeof McpClient.oauthRefresh>[0],
    );
    setExpiresAtByProvider((prev) => ({ ...prev, [connectorId]: refreshed.expiresAt ?? null }));
  }, []);

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

  const visibleCategories = useMemo(
    () => CONNECTOR_CATEGORIES.filter((cat) => CONNECTOR_DIRECTORY.some((c) => c.category === cat)),
    [],
  );

  const connectedConnectors = useMemo(
    () =>
      connectedIds
        .map(connectorById)
        .filter((connector): connector is ConnectorDef => Boolean(connector)),
    [connectedIds],
  );

  const availableConnectors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return CONNECTOR_DIRECTORY.filter((connector) => {
      if (connectedIds.includes(connector.id)) return false;
      const matchesSearch =
        query.length === 0 ||
        connector.name.toLowerCase().includes(query) ||
        connector.description.toLowerCase().includes(query) ||
        connector.category.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === 'all' || connector.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [categoryFilter, connectedIds, search]);

  const detailConnector = detailConnectorId ? connectorById(detailConnectorId) : null;
  const connectorListError = error['__list'] ?? null;

  const handleConnect = useCallback(
    async (id: string) => {
      const connector = connectorById(id);
      if (!connector) return;

      setOauthState({ status: 'connecting', connectorName: connector.name });
      try {
        await connect(id);
        if (connector.authType === 'oauth') {
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
  }, [handleConnect, lastConnectorName]);

  const handleCustomConnectorSaved = useCallback(
    (serverName: string) => {
      setOauthState({ status: 'success', connectorName: serverName });
      void fetchConnected();
    },
    [fetchConnected],
  );

  const dialogs = (
    <>
      <ConnectorOAuthFlow
        state={oauthState}
        onClose={() => setOauthState({ status: 'idle' })}
        onRetry={handleRetry}
      />
      <ConnectorApiKeyDialog
        connector={apiKeyDialogConnector}
        open={apiKeyDialogConnector !== null}
        onClose={() => setApiKeyDialogConnector(null)}
        onConnect={handleApiKeyConnect}
      />
      <CustomRemoteMcpConnectorDialog
        open={customConnectorOpen}
        onClose={() => setCustomConnectorOpen(false)}
        onSaved={handleCustomConnectorSaved}
      />
    </>
  );

  if (detailConnector) {
    return (
      <>
        <ConnectorDetailView
          connector={detailConnector}
          tools={undefined}
          onBack={() => setDetailConnectorId(null)}
        />
        {dialogs}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Connectors</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Allow AGI to interact with apps, data, and tools on your computer with your approval.
          </p>
        </div>
        <SettingsRowButton onClick={() => setCustomConnectorOpen(true)} className="shrink-0">
          <Plus className="h-3.5 w-3.5" />
          Add custom
        </SettingsRowButton>
      </div>

      {connectorListError ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{connectorListError}</span>
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">Connected</h4>
          {connectedConnectors.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {connectedConnectors.length} active
            </span>
          ) : null}
        </div>

        {connectedConnectors.length === 0 ? (
          <EmptyState
            icon={Unplug}
            title="No connectors connected yet"
            description="Connect an app below to let AGI use its tools after you approve the connection."
          />
        ) : (
          <div className="rounded-xl border border-border bg-card/35 px-4">
            {connectedConnectors.map((connector) => (
              <ConnectedConnectorRow
                key={connector.id}
                connector={connector}
                loading={Boolean(loading[connector.id])}
                error={error[connector.id] ?? null}
                expiresAt={expiresAtByProvider[connector.id] ?? null}
                onConfigure={() => setDetailConnectorId(connector.id)}
                onDisconnect={() => void disconnect(connector.id)}
                onRefresh={
                  connector.authType === 'oauth'
                    ? () => handleRefreshToken(connector.id)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Available to connect</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Supported connectors only. Upcoming integrations stay hidden until they have a real
              backend path.
            </p>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <div className="relative min-w-[220px] max-w-[340px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search connectors..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted/35 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Select
              value={categoryFilter}
              onValueChange={(value) => setCategoryFilter(value as ConnectorCategory | 'all')}
            >
              <SelectTrigger className="h-9 w-[156px] rounded-lg border-border bg-muted/35 text-sm">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {visibleCategories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {availableConnectors.length === 0 ? (
          <EmptyState
            icon={Check}
            title="No connectors in this view"
            description="Clear the search or choose another type."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {availableConnectors.map((connector) => (
              <AvailableConnectorCard
                key={connector.id}
                connector={connector}
                loading={Boolean(loading[connector.id])}
                error={error[connector.id] ?? null}
                onConnect={() => handleConnectClick(connector)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="rounded-xl border border-border bg-card/35 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Advanced MCP configuration</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Use custom connectors for remote MCP servers or provider-specific API keys.
            </p>
          </div>
          <SettingsRowButton onClick={() => setCustomConnectorOpen(true)}>
            <ExternalLink className="h-3.5 w-3.5" />
            Add custom
          </SettingsRowButton>
        </div>
      </div>

      {dialogs}
    </div>
  );
}
