'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import type {
  DirectoryAdapter,
  DirectoryConnectorDetail,
  SettingsDataAdapter,
  SettingsNavBadge,
} from '@agiworkforce/ui';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import { ConnectorApiKeyForm } from '@/features/connectors/components/ConnectorApiKeyForm';
import { ConnectorCapabilitiesPanel } from '@/features/connectors/components/ConnectorCapabilitiesPanel';
import { ConnectorConsentSummary } from '@/features/connectors/components/ConnectorConsentSummary';
import { ConnectorScopeList } from '@/features/connectors/components/ConnectorScopeList';
import {
  brokerOutcomeMessage,
  currentConnectorReturnPath,
  withConnectorReturnPath,
} from '@/features/connectors/hooks/use-connectors';
import { getCsrfToken } from '@/lib/client/csrf';
import { CONNECTOR_REAUTHORIZATION_COPY, useDirectoryAdapter } from '@/features/directory';

export const CONNECTOR_DETAIL_FOOTER_TESTID = 'connector-detail-footer';

const TOOL_PERMISSIONS_LABEL = 'Tool permissions';
const TOOL_PERMISSIONS_HINT = 'Choose when the assistant may use each of this connector’s tools.';

class LoadFailure extends Error {
  constructor(readonly status: number | null) {
    super(`load failed: ${status ?? 'network'}`);
  }
}

function loadFailureMessage(subject: string, error: unknown): string {
  const status =
    error instanceof LoadFailure
      ? error.status
      : typeof (error as { status?: unknown })?.status === 'number'
        ? (error as { status: number }).status
        : null;
  if (status === 401 || status === 403) {
    return `Your session expired. Reload the page to sign back in, then reopen ${subject}.`;
  }
  if (status !== null && status >= 500) {
    return `${subject} could not be loaded because the server returned an error. This is not a problem with your connection, retry, or contact support if it persists.`;
  }
  if (status !== null) {
    return `${subject} could not be loaded (the server rejected the request). Retry, or contact support if it persists.`;
  }
  return `${subject} could not be loaded. Check your connection and try again.`;
}

class ConnectorLoadError extends Error {
  constructor(
    readonly kind: 'invalid-data' | 'status',
    readonly status: number | null = null,
  ) {
    super(kind);
  }
}

// GET /api/github/installations is fetched independently from the other two
// connector sources (known-flaws WEB-CONNECTORS-PANEL-ALL-OR-NOTHING-01): its
// failure means GitHub's connected state can't be confirmed right now, not
// that the whole directory is unreachable, so it degrades to this scoped
// notice instead of the global connectorsError.
const GITHUB_INSTALLATIONS_NOTICE =
  'GitHub app installations could not be loaded. GitHub may show as not connected here until this is retried.';

const CONNECTOR_DATA_DEGRADED_NOTICE =
  'Some connector data could not be read. Valid connectors remain available; retry to refresh.';

const ConnectorsResponseSchema = z.object({
  connectors: z.array(
    z.object({
      connectorId: z.string().min(1),
      connectedAt: z.string().optional(),
      needsReauthorization: z.boolean().optional(),
    }),
  ),
  available: z.array(z.string().min(1)).optional(),
});

const GitHubInstallationsResponseSchema = z.object({
  installations: z.array(
    z.object({
      installation_id: z.number().int().positive(),
      created_at: z.string().optional(),
    }),
  ),
});

const CustomConnectorsResponseSchema = z.object({
  connectors: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      url: z.string().url(),
      createdAt: z.string(),
      directoryId: z.string().min(1).optional(),
    }),
  ),
});

type ParsedConnectorRow = {
  connectorId: string;
  connectedAt?: string;
  needsReauthorization?: boolean;
};

type ParsedCustomConnectorRow = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  directoryId?: string;
};

function readConnectorResponse(value: unknown): {
  rows: ParsedConnectorRow[];
  available: string[];
  degraded: boolean;
} | null {
  if (!value || typeof value !== 'object') return null;
  const envelope = value as { connectors?: unknown; available?: unknown };
  if (!Array.isArray(envelope.connectors)) return null;

  let degraded = false;
  const rows: ParsedConnectorRow[] = [];
  for (const raw of envelope.connectors) {
    if (!raw || typeof raw !== 'object') {
      degraded = true;
      continue;
    }
    const row = raw as Record<string, unknown>;
    if (typeof row['connectorId'] !== 'string' || row['connectorId'].length === 0) {
      degraded = true;
      continue;
    }
    const parsed: ParsedConnectorRow = { connectorId: row['connectorId'] };
    if (row['connectedAt'] !== undefined) {
      if (typeof row['connectedAt'] === 'string') parsed.connectedAt = row['connectedAt'];
      else degraded = true;
    }
    if (row['needsReauthorization'] !== undefined) {
      if (typeof row['needsReauthorization'] === 'boolean') {
        parsed.needsReauthorization = row['needsReauthorization'];
      } else degraded = true;
    }
    rows.push(parsed);
  }

  let available: string[] = [];
  if (envelope.available !== undefined) {
    if (!Array.isArray(envelope.available)) {
      degraded = true;
    } else {
      available = envelope.available.filter((id): id is string => {
        const valid = typeof id === 'string' && id.length > 0;
        if (!valid) degraded = true;
        return valid;
      });
    }
  }

  return { rows, available, degraded };
}

function readCustomConnectorResponse(value: unknown): {
  rows: ParsedCustomConnectorRow[];
  degraded: boolean;
} | null {
  if (!value || typeof value !== 'object') return null;
  const envelope = value as { connectors?: unknown };
  if (!Array.isArray(envelope.connectors)) return null;

  let degraded = false;
  const rows: ParsedCustomConnectorRow[] = [];
  for (const raw of envelope.connectors) {
    if (!raw || typeof raw !== 'object') {
      degraded = true;
      continue;
    }
    const row = raw as Record<string, unknown>;
    if (
      typeof row['id'] !== 'string' ||
      row['id'].length === 0 ||
      typeof row['name'] !== 'string' ||
      row['name'].length === 0 ||
      typeof row['url'] !== 'string' ||
      row['url'].length === 0 ||
      typeof row['createdAt'] !== 'string'
    ) {
      degraded = true;
      continue;
    }
    rows.push({
      id: row['id'],
      name: row['name'],
      url: row['url'],
      createdAt: row['createdAt'],
      ...(typeof row['directoryId'] === 'string' && row['directoryId'].length > 0
        ? { directoryId: row['directoryId'] }
        : {}),
    });
  }

  return { rows, degraded };
}

const CONNECTOR_NOT_CONNECTED_LABEL = 'Not connected';

const CAPABILITY_SENTENCE_END = '.';

const CUSTOM_CONNECTOR_ID_PREFIX = 'custom-';
const CUSTOM_CONNECTOR_CATEGORY = 'Custom';
const CUSTOM_CONNECTOR_AUTH_TYPE = 'custom_mcp';
const CUSTOM_CONNECTOR_ICON_BG = 'from-muted to-muted';
const CUSTOM_CONNECTOR_ICON_TEXT = 'MCP';

function capabilityDescription(connector: (typeof CONNECTORS)[number]): string {
  const summary = connector.capabilitySummary;
  if (!summary) return connector.description;
  return `${summary.charAt(0).toUpperCase()}${summary.slice(1)}${CAPABILITY_SENTENCE_END}`;
}

export const SETTINGS_CONNECTORS = CONNECTORS.filter((c) => !c.exclusive).map((c) => ({
  id: c.id,
  name: c.name,
  publisher: c.name,
  description: capabilityDescription(c),
  category: c.category,
  authType: c.authType,
  actionCount: c.actionCount,
  phase: c.phase,
  iconBg: c.iconBg,
  iconText: c.iconText,
  canConnect: false,
  statusLabel: CONNECTOR_NOT_CONNECTED_LABEL,
}));

export type ConnectorsSettingsAdapterSlice = Pick<
  SettingsDataAdapter,
  'addCustomConnector' | 'customConnectorAuthTokenSupported'
>;

export interface ToolPermissionsConnector {
  id: string;
  name: string;
  iconText: string;
  iconBg: string;
}

const DIRECTORY_CONNECTOR_ICON_BG = 'from-muted to-muted';
const MONOGRAM_LENGTH = 2;

function toolPermissionsTargetFor(
  connectorId: string,
  detail: DirectoryConnectorDetail,
): ToolPermissionsConnector {
  return {
    id: connectorId,
    name: detail.name,
    iconText: (detail.monogram ?? detail.name.slice(0, MONOGRAM_LENGTH)).toUpperCase(),
    iconBg: DIRECTORY_CONNECTOR_ICON_BG,
  };
}

export interface ConnectorsSettingsAdapterParams {
  open: boolean;
  authedHeaders: (base?: Record<string, string>) => Promise<Record<string, string>>;
  directorySkillActions?: {
    onCreateSkill?: () => void;
    onEditSkill?: (name: string) => void;
    createSkillLabel?: string;
  };
}

export interface ConnectorsSettingsAdapterResult {
  adapter: ConnectorsSettingsAdapterSlice;
  directoryAdapter: DirectoryAdapter;
  navBadges: Partial<Record<string, SettingsNavBadge>> | undefined;
  toolPermissionsConnector: ToolPermissionsConnector | null;
  setToolPermissionsConnectorId: (id: string | null) => void;
}

export function useConnectorsSettingsAdapter({
  open,
  authedHeaders,
  directorySkillActions,
}: ConnectorsSettingsAdapterParams): ConnectorsSettingsAdapterResult {
  const [connectedConnectors, setConnectedConnectors] = useState<
    { connectorId: string; connectedAt?: string; needsReauthorization?: boolean }[]
  >([]);
  // OAuth grants the server reports as expired or revoked. `/api/connectors`
  // has always returned this per row; nothing outside the Connectors page read
  // it, so a connector could stop working and the only way to find out was to
  // open that one page and scroll to the right row.
  const [expiredConnectorIds, setExpiredConnectorIds] = useState<string[]>([]);
  const [githubInstallations, setGithubInstallations] = useState<
    { installation_id: number; created_at?: string }[]
  >([]);
  // Connector ids the server reports as actually connectable on web (GET
  // /api/connectors `available`): github when the GitHub App is configured, plus
  // operator-mapped remote MCP connectors. Drives canConnect instead of a
  // build-time hardcoded false.
  const [availableIds, setAvailableIds] = useState<string[]>([]);
  const [customConnectors, setCustomConnectors] = useState<ParsedCustomConnectorRow[]>([]);

  const [connectorsError, setConnectorsError] = useState<string | null>(null);
  const [connectorsNotice, setConnectorsNotice] = useState<string | null>(null);
  const [githubInstallationsNotice, setGithubInstallationsNotice] = useState<string | null>(null);

  const refreshCustomConnectors = useCallback(async () => {
    const response = await fetch('/api/connectors/custom', {
      credentials: 'include',
      headers: await authedHeaders(),
    });
    if (!response.ok) throw new Error('Custom connector directory request failed.');
    const body = await response.json();
    const parsed = CustomConnectorsResponseSchema.safeParse(body);
    if (parsed.success) {
      setCustomConnectors(parsed.data.connectors);
      return;
    }
    const fallback = readCustomConnectorResponse(body);
    if (!fallback) throw new Error('Custom connector directory returned invalid data.');
    setCustomConnectors(fallback.rows);
    if (fallback.degraded) {
      setConnectorsNotice(CONNECTOR_DATA_DEGRADED_NOTICE);
    }
  }, [authedHeaders]);

  const loadConnectors = useCallback(
    async (signal?: AbortSignal) => {
      setConnectorsError(null);
      setConnectorsNotice(null);
      setGithubInstallationsNotice(null);
      try {
        const requestOptions = {
          credentials: 'include' as const,
          headers: await authedHeaders(),
          ...(signal ? { signal } : {}),
        };
        const [connectorsResponse, installationsResponse, customResponse] = await Promise.all([
          fetch('/api/connectors', requestOptions),
          fetch('/api/github/installations', requestOptions),
          fetch('/api/connectors/custom', requestOptions),
        ]);
        if (!connectorsResponse.ok || !customResponse.ok) {
          const status = [connectorsResponse, customResponse].find(
            (response) => !response.ok,
          )?.status;
          throw new ConnectorLoadError('status', status ?? null);
        }
        const [connectorsJson, customJson] = await Promise.all([
          connectorsResponse.json(),
          customResponse.json(),
        ]);
        const connectorsResult = ConnectorsResponseSchema.safeParse(connectorsJson);
        const customResult = CustomConnectorsResponseSchema.safeParse(customJson);
        const connectorsFallback = connectorsResult.success
          ? {
              rows: connectorsResult.data.connectors,
              available: connectorsResult.data.available ?? [],
              degraded: false,
            }
          : readConnectorResponse(connectorsJson);
        const customFallback = customResult.success
          ? { rows: customResult.data.connectors, degraded: false }
          : readCustomConnectorResponse(customJson);
        if (!connectorsFallback || !customFallback) {
          throw new ConnectorLoadError('invalid-data');
        }
        if (signal?.aborted) return;
        setConnectedConnectors(connectorsFallback.rows);
        setAvailableIds(connectorsFallback.available);
        setExpiredConnectorIds(
          connectorsFallback.rows
            .filter((connector) => connector.needsReauthorization)
            .map((connector) => connector.connectorId),
        );
        setCustomConnectors(customFallback.rows);
        if (connectorsFallback.degraded || customFallback.degraded) {
          setConnectorsNotice(CONNECTOR_DATA_DEGRADED_NOTICE);
        }

        // Deliberately isolated from the try/catch above: a malformed body or
        // JSON parse failure here must still degrade to the scoped notice,
        // never escalate to the blocking connectorsError.
        if (!installationsResponse.ok) {
          setGithubInstallations([]);
          setGithubInstallationsNotice(GITHUB_INSTALLATIONS_NOTICE);
        } else {
          try {
            const installationsResult = GitHubInstallationsResponseSchema.safeParse(
              await installationsResponse.json(),
            );
            if (installationsResult.success) {
              setGithubInstallations(installationsResult.data.installations);
            } else {
              setGithubInstallations([]);
              setGithubInstallationsNotice(GITHUB_INSTALLATIONS_NOTICE);
            }
          } catch {
            setGithubInstallations([]);
            setGithubInstallationsNotice(GITHUB_INSTALLATIONS_NOTICE);
          }
        }
      } catch (error) {
        if (signal?.aborted) return;
        setConnectorsError(
          error instanceof ConnectorLoadError && error.kind === 'invalid-data'
            ? 'Connectors returned data this page could not read. Try again, or contact support if it persists.'
            : loadFailureMessage(
                'Connectors',
                error instanceof ConnectorLoadError ? new LoadFailure(error.status) : error,
              ),
        );
      }
    },
    [authedHeaders],
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void loadConnectors(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadConnectors, open]);

  const selfAddedConnectors = useMemo(
    () => customConnectors.filter((c) => c.directoryId === undefined),
    [customConnectors],
  );

  const customSettingsConnectors = useMemo(
    () =>
      selfAddedConnectors.map((c) => ({
        id: `${CUSTOM_CONNECTOR_ID_PREFIX}${c.id}`,
        name: c.name,
        description: c.url,
        category: CUSTOM_CONNECTOR_CATEGORY,
        authType: CUSTOM_CONNECTOR_AUTH_TYPE,
        actionCount: 0,
        phase: 1,
        iconBg: CUSTOM_CONNECTOR_ICON_BG,
        iconText: CUSTOM_CONNECTOR_ICON_TEXT,
        canConnect: false,
      })),
    [selfAddedConnectors],
  );

  const [toolPermissionsConnector, setToolPermissionsConnector] =
    useState<ToolPermissionsConnector | null>(null);
  const [apiKeyConnectorId, setApiKeyConnectorId] = useState<string | null>(null);

  const mergedSettingsConnectors = useMemo(
    () =>
      [
        ...SETTINGS_CONNECTORS.map((c) =>
          availableIds.includes(c.id) ? { ...c, canConnect: true, statusLabel: undefined } : c,
        ),
        ...customSettingsConnectors,
      ] as typeof SETTINGS_CONNECTORS,
    [availableIds, customSettingsConnectors],
  );

  const mergedConnectedConnectors = useMemo(() => {
    // Drop github AND custom rows from the raw /api/connectors list: github is
    // re-derived from real installations below, and custom rows are re-pushed
    // from the richer /api/connectors/custom fetch (this modal keys customs by
    // `custom-<row uuid>` because its remove flow slices the uuid back out;
    // the API's connectorId uses `custom-<shortId>`, the chat serverId).
    const rows = connectedConnectors
      .filter(
        (c) => c.connectorId !== 'github' && !c.connectorId.startsWith(CUSTOM_CONNECTOR_ID_PREFIX),
      )
      .map((c) => ({
        connectorId: c.connectorId,
        ...(c.connectedAt ? { connectedAt: c.connectedAt } : {}),
        ...(c.needsReauthorization
          ? { status: 'warning' as const, warningLabel: CONNECTOR_REAUTHORIZATION_COPY }
          : {}),
      }));
    if (githubInstallations.length > 0) {
      rows.push({ connectorId: 'github', connectedAt: githubInstallations[0]?.created_at });
    }
    for (const c of selfAddedConnectors) {
      rows.push({
        connectorId: `${CUSTOM_CONNECTOR_ID_PREFIX}${c.id}`,
        connectedAt: c.createdAt,
      });
    }
    return rows;
  }, [connectedConnectors, githubInstallations, selfAddedConnectors]);

  const connectConnector = useCallback(
    async (id: string) => {
      // Web has no working per-provider authorization flow yet, so the catalog
      // is mapped with canConnect: false and the shared panel never invokes
      // this. Kept non-optimistic for when a real flow lands: POST first, only
      // reflect state the server confirmed, surface failures to the panel.
      const connector = SETTINGS_CONNECTORS.find((c) => c.id === id);
      const name = connector?.name ?? id;
      const csrfToken = await getCsrfToken();
      const res = await fetch('/api/connectors', {
        method: 'POST',
        headers: await authedHeaders({
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        }),
        credentials: 'include',
        body: JSON.stringify({
          connectorId: id,
          ...(connector ? { authType: connector.authType } : {}),
        }),
      });
      if (!res.ok) {
        // GitHub connects through the App install flow: the server answers POST
        // with 409 + installStartPath. Follow it instead of surfacing an error.
        const body = (await res
          .clone()
          .json()
          .catch(() => null)) as {
          error?: string;
          oauthStartPath?: string;
          installStartPath?: string;
          credentialsPath?: string;
        } | null;
        if (res.status === 409 && body?.credentialsPath) {
          setApiKeyConnectorId(id);
          return;
        }
        if (res.status === 409 && typeof window !== 'undefined') {
          if (body?.oauthStartPath) {
            const target = withConnectorReturnPath(
              body.oauthStartPath,
              currentConnectorReturnPath(),
            );
            if (target) {
              const probeUrl = `${target}${target.includes('?') ? '&' : '?'}mode=json`;
              const probeRes = await fetch(probeUrl, {
                headers: await authedHeaders(),
                credentials: 'include',
              });
              const probeBody = (await probeRes.json().catch(() => null)) as {
                authorizeUrl?: string;
                error?: string;
                status?: string;
              } | null;
              if (probeRes.ok && probeBody?.authorizeUrl) {
                window.location.href = probeBody.authorizeUrl;
                return;
              }
              throw new Error(
                (probeBody?.status && brokerOutcomeMessage(probeBody.status, name)) ??
                  probeBody?.error ??
                  `Could not connect ${name}.`,
              );
            }
          }
          if (body?.installStartPath) {
            window.location.href = body.installStartPath;
            return;
          }
        }
        throw new Error(body?.error ?? `Could not connect ${name}.`);
      }
      const json = (await res.json()) as {
        connector: { connectorId: string; connectedAt?: string };
      };
      setConnectedConnectors((prev) => [
        ...prev.filter((c) => c.connectorId !== id),
        { connectorId: json.connector.connectorId, connectedAt: json.connector.connectedAt },
      ]);
    },
    [authedHeaders],
  );

  const disconnectConnector = useCallback(
    async (id: string) => {
      const csrfToken = await getCsrfToken();
      if (id === 'github') {
        // GitHub "connected" state is its App installations; disconnect
        // removes each installation via the real installations endpoint.
        for (const installation of githubInstallations) {
          const res = await fetch('/api/github/installations', {
            method: 'DELETE',
            headers: await authedHeaders({
              'Content-Type': 'application/json',
              'x-csrf-token': csrfToken,
            }),
            credentials: 'include',
            body: JSON.stringify({ installationId: installation.installation_id }),
          });
          if (!res.ok) {
            throw new Error('Could not disconnect GitHub. Try again.');
          }
        }
        setGithubInstallations([]);
        return;
      }
      if (id.startsWith(CUSTOM_CONNECTOR_ID_PREFIX)) {
        const rowId = id.slice(CUSTOM_CONNECTOR_ID_PREFIX.length);
        const res = await fetch(`/api/connectors/custom?id=${encodeURIComponent(rowId)}`, {
          method: 'DELETE',
          headers: await authedHeaders({ 'x-csrf-token': csrfToken }),
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error('Could not remove this connector. Try again.');
        }
        setCustomConnectors((prev) => prev.filter((c) => c.id !== rowId));
        return;
      }
      const res = await fetch(`/api/connectors?connectorId=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: await authedHeaders({ 'x-csrf-token': csrfToken }),
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Could not disconnect. Try again.');
      }
      setConnectedConnectors((prev) => prev.filter((c) => c.connectorId !== id));
    },
    [authedHeaders, githubInstallations],
  );

  const addCustomConnector = useCallback(
    async (input: { name: string; url: string; authToken?: string }) => {
      const csrfToken = await getCsrfToken();
      const res = await fetch('/api/connectors/custom', {
        method: 'POST',
        headers: await authedHeaders({
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        }),
        credentials: 'include',
        body: JSON.stringify({
          name: input.name,
          url: input.url,
          ...(input.authToken ? { authToken: input.authToken } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not add connector. Try again.');
      }
      await refreshCustomConnectors();
    },
    [authedHeaders, refreshCustomConnectors],
  );

  const setToolPermissionsConnectorId = useCallback(
    (id: string | null) => {
      if (id === null) {
        setToolPermissionsConnector(null);
        return;
      }
      const match = mergedSettingsConnectors.find((c) => c.id === id);
      setToolPermissionsConnector(
        match
          ? { id: match.id, name: match.name, iconText: match.iconText, iconBg: match.iconBg }
          : {
              id,
              name: id,
              iconText: id.slice(0, MONOGRAM_LENGTH).toUpperCase(),
              iconBg: DIRECTORY_CONNECTOR_ICON_BG,
            },
      );
    },
    [mergedSettingsConnectors],
  );

  const navBadges = useMemo(
    () =>
      expiredConnectorIds.length > 0
        ? {
            connectors: {
              count: expiredConnectorIds.length,
              description:
                expiredConnectorIds.length === 1
                  ? '1 connector needs to be reconnected'
                  : `${expiredConnectorIds.length} connectors need to be reconnected`,
            },
          }
        : undefined,
    [expiredConnectorIds],
  );

  const connectorsPanelNotice =
    [connectorsNotice, githubInstallationsNotice].filter(Boolean).join(' ') || null;

  const directoryAdapter = useDirectoryAdapter({
    ...directorySkillActions,
    curatedConnectors: mergedSettingsConnectors,
    connectedConnectors: mergedConnectedConnectors,
    connectorsError,
    connectorsNotice: connectorsPanelNotice,
    renderConnectorDetailFooter: (connectorId: string, detail: DirectoryConnectorDetail) => (
      <div className="flex flex-col gap-3" data-testid={CONNECTOR_DETAIL_FOOTER_TESTID}>
        {apiKeyConnectorId === connectorId ? (
          <ConnectorApiKeyForm
            connectorId={connectorId}
            onConnected={() => {
              setApiKeyConnectorId(null);
              void loadConnectors();
              void directoryAdapter.loadSection?.('connectors');
            }}
            onCancel={() => setApiKeyConnectorId(null)}
          />
        ) : null}
        {detail.connected ? (
          <>
            <ConnectorCapabilitiesPanel connectorRef={connectorId} connected />
            <button
              type="button"
              onClick={() =>
                setToolPermissionsConnector(toolPermissionsTargetFor(connectorId, detail))
              }
              className="w-full rounded-lg border border-border px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
            >
              <span className="font-medium">{TOOL_PERMISSIONS_LABEL}</span>
              <span className="mt-0.5 block text-muted-foreground">{TOOL_PERMISSIONS_HINT}</span>
            </button>
          </>
        ) : (
          <>
            <ConnectorConsentSummary />
            <ConnectorScopeList connectorId={connectorId} />
          </>
        )}
      </div>
    ),
    onRetryConnectors: loadConnectors,
    onConnectConnector: connectConnector,
    onDisconnectConnector: disconnectConnector,
  });

  return {
    adapter: {
      addCustomConnector,
      customConnectorAuthTokenSupported: true,
    },
    directoryAdapter,
    navBadges,
    toolPermissionsConnector,
    setToolPermissionsConnectorId,
  };
}
