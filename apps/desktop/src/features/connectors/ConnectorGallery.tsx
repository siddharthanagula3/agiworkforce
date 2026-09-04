import {
  AlertCircle,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Plus,
  Plug,
  RefreshCw,
  Search,
  Settings,
  Unplug,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  siAtlassian,
  siBox,
  siDropbox,
  siFigma,
  siGithub,
  siGmail,
  siGooglecalendar,
  siGoogledrive,
  siHubspot,
  siLinear,
  siModelcontextprotocol,
  siN8n,
  siNotion,
  siStripe,
  siVercel,
} from 'simple-icons';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { useConnectorsStore } from '../../stores/connectorsStore';
import {
  CONNECTORS,
  CONNECTOR_CATEGORIES,
  CONNECTOR_DIRECTORY,
  buildCustomMcpConnectorDef,
  isCustomMcpConnectorId,
  type ConnectorCategory,
  type ConnectorDef,
} from './connectorDefinitions';
import { isTauri, listen } from '../../lib/tauri-mock';
import { McpClient } from '@/api/mcp';
import type { McpServerInfo } from '@/types/mcp';
import { ConnectorOAuthFlow, type OAuthFlowState } from './ConnectorOAuthFlow';
import { ConnectorApiKeyDialog } from './ConnectorApiKeyDialog';
import { CustomRemoteMcpConnectorDialog } from './CustomRemoteMcpConnectorDialog';
import { ConnectorDetailView, type ConnectorTool } from './ConnectorDetailView';
import { OAuthCredentialsPanel } from '../settings/OAuthCredentialsPanel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/Select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/Tooltip';

interface BrandIconData {
  path: string;
  hex: string;
  title: string;
}

const CONNECTOR_BRAND_ICONS: Record<string, BrandIconData> = {
  gmail: siGmail,
  google_calendar: siGooglecalendar,
  google_drive: siGoogledrive,
  google: siGoogledrive,
  notion: siNotion,
  figma: siFigma,
  atlassian: siAtlassian,
  hubspot: siHubspot,
  linear: siLinear,
  github: siGithub,
  vercel: siVercel,
  stripe: siStripe,
  context7: siModelcontextprotocol,
  modelcontextprotocol: siModelcontextprotocol,
  dropbox: siDropbox,
  box: siBox,
  n8n: siN8n,
};

function getConnectorBrandIcon(connector: ConnectorDef): BrandIconData | null {
  return (
    CONNECTOR_BRAND_ICONS[connector.id] ??
    CONNECTOR_BRAND_ICONS[connector.provider] ??
    CONNECTOR_BRAND_ICONS[connector.mcpPackage?.toLowerCase() ?? ''] ??
    null
  );
}

function brandFillColor(icon: BrandIconData): string {
  const hex = icon.hex.toUpperCase();
  if (hex === '000000' || hex === '181717') return '#F4F1EA';
  return `#${icon.hex}`;
}

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
  return (
    CONNECTORS.find((connector) => connector.id === id) ??
    (isCustomMcpConnectorId(id) ? buildCustomMcpConnectorDef(id) : null)
  );
}

function connectorMcpServerName(connectorId: string): string {
  if (isCustomMcpConnectorId(connectorId)) return connectorId;
  return `connector-${connectorId.replace(/_/g, '-')}`;
}

function isDestructiveToolName(name: string): boolean {
  return (
    name.includes('delete') ||
    name.includes('write') ||
    name.includes('create') ||
    name.includes('update') ||
    name.includes('remove')
  );
}

function ConnectorMark({
  connector,
  size = 'md',
}: {
  connector: ConnectorDef;
  size?: 'sm' | 'md';
}) {
  const [failed, setFailed] = useState(false);
  const brandIcon = getConnectorBrandIcon(connector);
  const wrapperSize = size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-10 w-10 rounded-lg';
  const imageSize = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  const iconSize = size === 'sm' ? 18 : 22;
  const source = connector.iconUrl && !failed ? 'image' : brandIcon ? 'brand' : 'neutral';

  return (
    <div
      data-testid={`connector-mark-${connector.id}`}
      data-brand-source={source}
      className={cn(
        'flex shrink-0 items-center justify-center border border-border/80 bg-muted/45',
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
      ) : brandIcon ? (
        <svg
          role="img"
          aria-label={`${brandIcon.title} logo`}
          viewBox="0 0 24 24"
          width={iconSize}
          height={iconSize}
          style={{ fill: brandFillColor(brandIcon), flexShrink: 0 }}
        >
          <path d={brandIcon.path} />
        </svg>
      ) : (
        <Plug className={cn('text-muted-foreground', size === 'sm' ? 'h-4 w-4' : 'h-5 w-5')} />
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

interface SavedConnectorRowProps {
  connector: ConnectorDef;
  target: string;
  loading: boolean;
  error: string | null;
  onConnect: () => void;
  onConfigure: () => void;
  onRemove: () => void;
}

function SavedConnectorRow({
  connector,
  target,
  loading,
  error,
  onConnect,
  onConfigure,
  onRemove,
}: SavedConnectorRowProps) {
  const wasCancelled = error?.startsWith('Connection cancelled.') ?? false;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/75 px-0 py-3 last:border-b-0">
      <ConnectorMark connector={connector} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{connector.name}</p>
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Saved · Disconnected
          </span>
        </div>
        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground" title={target}>
          {target}
        </p>
        {error ? (
          <p
            role={wasCancelled ? 'status' : 'alert'}
            className={cn(
              'mt-1 text-xs',
              wasCancelled ? 'text-muted-foreground' : 'text-destructive',
            )}
          >
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SettingsRowButton disabled={loading} onClick={onConfigure}>
          <Settings className="h-3.5 w-3.5" />
          Configure
        </SettingsRowButton>
        <SettingsRowButton
          disabled={loading}
          onClick={onRemove}
          ariaLabel={`Remove ${connector.name}`}
        >
          Remove
        </SettingsRowButton>
        <SettingsRowButton
          disabled={loading}
          onClick={onConnect}
          ariaLabel={`Connect ${connector.name}`}
          className="border-teal-500/40 bg-teal-500/10 text-teal-200 hover:bg-teal-500/20"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plug className="h-3.5 w-3.5" />
          )}
          Connect
        </SettingsRowButton>
      </div>
    </div>
  );
}

function customConnectorConnectionError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const normalized = raw.toLowerCase();

  if (
    normalized.includes('cancelled') ||
    normalized.includes('canceled') ||
    normalized.includes('denied')
  ) {
    return 'Connection cancelled. The server remains saved and disconnected.';
  }
  if (normalized.includes('timed out') || normalized.includes('timeout')) {
    return 'Approval timed out. The server remains saved and disconnected.';
  }
  if (normalized.includes('refused') || normalized.includes('econnrefused')) {
    return 'The server did not accept the connection. Check its target and try again.';
  }

  return 'Connection failed. Check the server target and try again.';
}

interface AvailableCardProps {
  connector: ConnectorDef;
  loading: boolean;
  error: string | null;
  onConnect: () => void;
}

function AvailableConnectorCard({ connector, loading, error, onConnect }: AvailableCardProps) {
  return (
    <div className="group flex min-h-[112px] items-start gap-3 rounded-lg border border-border/80 bg-card/35 p-4 transition-colors hover:bg-card/55">
      <ConnectorMark connector={connector} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">{connector.name}</p>
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
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{connectorAuthLabel(connector)}</span>
          {connector.mcpPackage ? <span aria-hidden>·</span> : null}
          {connector.mcpPackage ? <span>MCP</span> : null}
        </div>
        {error ? (
          <p className="mt-2 text-xs text-destructive">
            {/Missing\s+\w+_CLIENT_(ID|SECRET)/i.test(error)
              ? 'This connector needs an OAuth app. Add its Client ID & Secret in OAuth app credentials above, then Connect.'
              : error}
          </p>
        ) : null}
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
    <div className="rounded-lg border border-border/80 bg-card/25 px-4 py-6 text-center">
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
  const [configuredCustomServers, setConfiguredCustomServers] = useState<
    Array<{ info: McpServerInfo; target: string }>
  >([]);
  const [detailConnectorId, setDetailConnectorId] = useState<string | null>(null);
  const [oauthCredsOpen, setOauthCredsOpen] = useState(false);
  const [customConnectorBusy, setCustomConnectorBusy] = useState<Record<string, boolean>>({});
  const [customConnectorError, setCustomConnectorError] = useState<Record<string, string | null>>(
    {},
  );

  const {
    connectedIds,
    supportedConnectorIds,
    loading,
    error,
    connect,
    connectWithApiKey,
    disconnect,
    fetchConnected,
    fetchSupportedConnectorIds,
    clearError,
    completeOAuth,
  } = useConnectorsStore(
    useShallow((s) => ({
      connectedIds: s.connectedIds,
      supportedConnectorIds: s.supportedConnectorIds,
      loading: s.loading,
      error: s.error,
      connect: s.connect,
      connectWithApiKey: s.connectWithApiKey,
      disconnect: s.disconnect,
      fetchConnected: s.fetchConnected,
      fetchSupportedConnectorIds: s.fetchSupportedConnectorIds,
      clearError: s.clearError,
      completeOAuth: s.completeOAuth,
    })),
  );

  const [expiresAtByProvider, setExpiresAtByProvider] = useState<Record<string, number | null>>({});
  const [detailTools, setDetailTools] = useState<ConnectorTool[] | null>(null);

  useEffect(() => {
    void fetchConnected();
    void fetchSupportedConnectorIds();
  }, [fetchConnected, fetchSupportedConnectorIds]);

  const refreshConfiguredCustomServers = useCallback(async () => {
    try {
      const [servers, config] = await Promise.all([McpClient.listServers(), McpClient.getConfig()]);
      setConfiguredCustomServers(
        servers
          .filter((server) => isCustomMcpConnectorId(server.name))
          .map((info) => {
            const configured = config.mcpServers[info.name];
            const target =
              configured?.transport?.type === 'http'
                ? configured.transport.url
                : info.command?.trim() || 'Local MCP command';
            return { info, target };
          }),
      );
    } catch {
      setConfiguredCustomServers([]);
    }
  }, []);

  useEffect(() => {
    void refreshConfiguredCustomServers();
  }, [refreshConfiguredCustomServers]);

  useEffect(() => {
    if (!detailConnectorId) {
      setDetailTools(null);
      return;
    }
    let cancelled = false;
    setDetailTools(null);
    const targetServer = connectorMcpServerName(detailConnectorId);
    void (async () => {
      try {
        const allTools = await McpClient.listTools();
        if (cancelled) return;
        const matched: ConnectorTool[] = allTools
          .filter((tool) => tool.server === targetServer)
          .map((tool) => ({
            name: tool.name,
            description: tool.description,
            destructive: isDestructiveToolName(tool.name),
          }));
        setDetailTools(matched);
      } catch {
        if (!cancelled) setDetailTools([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailConnectorId]);

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

  useEffect(() => {
    if (!isTauri) return;
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    void (async () => {
      const unCallback = await listen<{ provider: string; connectorId: string }>(
        'mcp-oauth-callback',
        (event) => {
          const { connectorId } = event.payload;
          const connector = CONNECTORS.find((c) => c.id === connectorId);
          if (connector) {
            setOauthState({ status: 'connecting', connectorName: connector.name });
          }
          void completeOAuth(connectorId)
            .then(() => {
              if (connector) {
                setOauthState({ status: 'success', connectorName: connector.name });
              }
            })
            .catch((err: unknown) => {
              setOauthState({
                status: 'error',
                connectorName: connector?.name ?? connectorId,
                message: err instanceof Error ? err.message : String(err),
              });
            });
        },
      );
      const unError = await listen<{ error: string; error_description?: string }>(
        'mcp-oauth-error',
        (event) => {
          const { error: oauthError, error_description: description } = event.payload;
          setOauthState({
            status: 'error',
            connectorName: 'Connector',
            message: description || oauthError || 'OAuth authorization failed',
          });
        },
      );
      if (disposed) {
        unCallback();
        unError();
        return;
      }
      unlisteners.push(unCallback, unError);
    })();

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) unlisten();
    };
  }, [completeOAuth]);

  const supportedConnectors = useMemo(
    () => CONNECTOR_DIRECTORY.filter((c) => supportedConnectorIds.includes(c.id)),
    [supportedConnectorIds],
  );

  const visibleCategories = useMemo(
    () => CONNECTOR_CATEGORIES.filter((cat) => supportedConnectors.some((c) => c.category === cat)),
    [supportedConnectors],
  );

  const connectedConnectors = useMemo(
    () =>
      connectedIds
        .map(connectorById)
        .filter((connector): connector is ConnectorDef => Boolean(connector)),
    [connectedIds],
  );

  const savedCustomConnectors = useMemo(
    () =>
      configuredCustomServers
        .filter(({ info }) => !info.connected && !connectedIds.includes(info.name))
        .map(({ info, target }) => ({
          connector: buildCustomMcpConnectorDef(info.name),
          target,
        })),
    [configuredCustomServers, connectedIds],
  );

  const availableConnectors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return supportedConnectors.filter((connector) => {
      if (connectedIds.includes(connector.id)) return false;
      const matchesSearch =
        query.length === 0 ||
        connector.name.toLowerCase().includes(query) ||
        connector.description.toLowerCase().includes(query) ||
        connector.category.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === 'all' || connector.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [categoryFilter, connectedIds, search, supportedConnectors]);

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
      setOauthState({ status: 'saved', connectorName: serverName });
      void fetchConnected();
      void refreshConfiguredCustomServers();
    },
    [fetchConnected, refreshConfiguredCustomServers],
  );

  const handleConnectCustomConnector = useCallback(
    async (serverName: string) => {
      setCustomConnectorBusy((prev) => ({ ...prev, [serverName]: true }));
      setCustomConnectorError((prev) => ({ ...prev, [serverName]: null }));
      try {
        await McpClient.connect(serverName);
        await Promise.all([fetchConnected(), refreshConfiguredCustomServers()]);
      } catch (err) {
        setCustomConnectorError((prev) => ({
          ...prev,
          [serverName]: customConnectorConnectionError(err),
        }));
      } finally {
        setCustomConnectorBusy((prev) => ({ ...prev, [serverName]: false }));
      }
    },
    [fetchConnected, refreshConfiguredCustomServers],
  );

  const handleDisconnectCustomConnector = useCallback(
    async (serverName: string) => {
      setCustomConnectorBusy((prev) => ({ ...prev, [serverName]: true }));
      setCustomConnectorError((prev) => ({ ...prev, [serverName]: null }));
      try {
        const currentConfig = await McpClient.getConfig();
        const { [serverName]: _removed, ...remainingServers } = currentConfig.mcpServers;
        await McpClient.updateConfig({ mcpServers: remainingServers });
        await Promise.all([fetchConnected(), refreshConfiguredCustomServers()]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Disconnection failed';
        setCustomConnectorError((prev) => ({ ...prev, [serverName]: message }));
      } finally {
        setCustomConnectorBusy((prev) => ({ ...prev, [serverName]: false }));
      }
    },
    [fetchConnected, refreshConfiguredCustomServers],
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
          tools={detailTools}
          onBack={() => setDetailConnectorId(null)}
        />
        {dialogs}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 border-b border-border/80 pb-4">
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
            {connectedConnectors.map((connector) => {
              const isCustom = isCustomMcpConnectorId(connector.id);
              return (
                <ConnectedConnectorRow
                  key={connector.id}
                  connector={connector}
                  loading={
                    isCustom
                      ? Boolean(customConnectorBusy[connector.id])
                      : Boolean(loading[connector.id])
                  }
                  error={
                    (isCustom ? customConnectorError[connector.id] : error[connector.id]) ?? null
                  }
                  expiresAt={expiresAtByProvider[connector.id] ?? null}
                  onConfigure={() => setDetailConnectorId(connector.id)}
                  onDisconnect={() =>
                    void (isCustom
                      ? handleDisconnectCustomConnector(connector.id)
                      : disconnect(connector.id))
                  }
                  onRefresh={
                    connector.authType === 'oauth'
                      ? () => handleRefreshToken(connector.id)
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      {savedCustomConnectors.length > 0 ? (
        <section className="space-y-3" aria-labelledby="saved-mcp-connectors-heading">
          <div>
            <h4 id="saved-mcp-connectors-heading" className="text-sm font-semibold text-foreground">
              Saved MCP servers
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Saving does not start a server. Connect only after reviewing its target and approval.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card/35 px-4">
            {savedCustomConnectors.map(({ connector, target }) => (
              <SavedConnectorRow
                key={connector.id}
                connector={connector}
                target={target}
                loading={Boolean(customConnectorBusy[connector.id])}
                error={customConnectorError[connector.id] ?? null}
                onConfigure={() => setDetailConnectorId(connector.id)}
                onRemove={() => void handleDisconnectCustomConnector(connector.id)}
                onConnect={() => void handleConnectCustomConnector(connector.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* OAuth app credentials, collapsible; must be configured before connecting */}
      <section className="space-y-2">
        <button
          type="button"
          onClick={() => setOauthCredsOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-2.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className="text-sm font-semibold text-foreground">OAuth app credentials</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              oauthCredsOpen && 'rotate-180',
            )}
          />
        </button>
        {oauthCredsOpen && (
          <div className="rounded-xl border border-border bg-card/35 p-4">
            <p className="mb-4 text-xs text-muted-foreground">
              OAuth connectors require a Client ID and Client Secret from the provider&apos;s
              developer console. Credentials are stored encrypted on this device only.
            </p>
            <OAuthCredentialsPanel />
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

      <div className="border-t border-border/80 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Advanced MCP configuration</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Use custom connectors for remote MCP servers or provider-specific API keys.
            </p>
            <p
              className="mt-1 text-sm text-muted-foreground"
              data-testid="custom-connector-scope-note"
            >
              Custom connectors you add here stay on this device. They are not uploaded to your
              cloud account, and custom connectors added on web or mobile do not appear in this
              list.
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
