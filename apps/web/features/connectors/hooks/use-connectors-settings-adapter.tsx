'use client';

import { translateUiPlural } from '@agiworkforce/ui';
import { useCapability } from '@agiworkforce/unified-chat';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import {
  CONNECTOR_OAUTH_START_PATH,
  CUSTOM_CONNECTORS_PATH,
  ConnectConflictResponseSchema,
  ConnectorConnectionSchema,
  ConnectorOAuthStartResponseSchema,
  CreatedCustomConnectorSchema,
  CustomConnectorSchema,
  CustomConnectorSummarySchema,
  ListConnectorsResponseSchema,
  ListCustomConnectorsResponseSchema,
  MANAGED_CLOUD_CONNECTORS_PATH,
  connectorErrorMessage,
  type ConnectRequest,
  type CreateCustomConnectorRequest,
} from '@agiworkforce/cloud-contracts';
import type {
  CustomConnectorPreset,
  DirectoryAdapter,
  DirectoryConnectorDetail,
  SettingsDataAdapter,
  SettingsNavBadge,
} from '@agiworkforce/ui';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import { ConnectorAccountSummary } from '@/features/connectors/components/ConnectorAccountSummary';
import { ConnectorApiKeyForm } from '@/features/connectors/components/ConnectorApiKeyForm';
import { ConnectorCapabilitiesPanel } from '@/features/connectors/components/ConnectorCapabilitiesPanel';
import { ConnectorHealthDashboard } from '@/features/connectors/components/ConnectorHealthDashboard';
import { McpResourceList } from '@/features/chat/components/mcp/McpResourceList';
import { ConnectorConsentSummary } from '@/features/connectors/components/ConnectorConsentSummary';
import {
  ConnectorGrantedScopeList,
  ConnectorScopeList,
} from '@/features/connectors/components/ConnectorScopeList';
import {
  announceVendorNotice,
  brokerOutcomeMessage,
  currentConnectorReturnPath,
  withConnectorReturnPath,
} from '@/features/connectors/hooks/use-connectors';
import {
  connectBankAccountsWithPlaid,
  plaidLinkRoutesOf,
} from '@/features/connectors/lib/plaid-link';
import { accountUrlConnector } from '@/lib/connectors/account-url-connectors';
import { getCsrfToken } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import {
  CONNECTOR_NOT_RESPONDING_COPY,
  CONNECTOR_REAUTHORIZATION_COPY,
  useDirectoryAdapter,
} from '@/features/directory';
import { announceBankConnected } from '@features/finance/lib/announce-bank-connected';
import { openConnectorAuthorization } from '../lib/open-connector-authorization';

export const CONNECTOR_DETAIL_FOOTER_TESTID = 'connector-detail-footer';

const GITHUB_PR_REVIEW_LABEL = 'Review pull requests';
const GITHUB_PR_REVIEW_HINT =
  'When a pull request opens on an account below, AGI reviews it and posts the review as a comment.';
const GITHUB_PR_REVIEW_FAILED = 'Could not save the pull request review setting.';

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

const ConnectorRowSchema = ConnectorConnectionSchema.pick({
  connectorId: true,
  connectedAt: true,
  needsReauthorization: true,
  health: true,
  scopes: true,
}).partial({ connectedAt: true });

const ConnectorsResponseSchema = ListConnectorsResponseSchema.pick({ available: true })
  .partial()
  .extend({ connectors: z.array(ConnectorRowSchema) });

const AvailableConnectorIdSchema = ListConnectorsResponseSchema.shape.available.element;

const GitHubInstallationsResponseSchema = z.object({
  installations: z.array(
    z.object({
      installation_id: z.number().int().positive(),
      created_at: z.string().optional(),
      account_login: z.string().optional(),
      pr_review_enabled: z.boolean().optional(),
    }),
  ),
});

const CustomConnectorRowSchema = CustomConnectorSummarySchema.pick({
  id: true,
  name: true,
  url: true,
  createdAt: true,
  directoryId: true,
  shortId: true,
  signInRequired: true,
  signedIn: true,
}).partial({ shortId: true });

const CustomConnectorsResponseSchema = ListCustomConnectorsResponseSchema.pick({
  oauthRedirectUri: true,
}).extend({ connectors: z.array(CustomConnectorRowSchema) });

const OAuthRedirectUriSchema = ListCustomConnectorsResponseSchema.pick({ oauthRedirectUri: true });

const OAuthStartSchema = ConnectorOAuthStartResponseSchema.pick({
  authorizeUrl: true,
  error: true,
  status: true,
});

const ConnectedSchema = z.object({
  connector: ConnectorConnectionSchema.pick({ connectorId: true, connectedAt: true }).partial({
    connectedAt: true,
  }),
});

const CreatedCustomConnectorRowSchema = CreatedCustomConnectorSchema.pick({
  signInRequired: true,
}).extend({
  connector: CustomConnectorSchema.pick({ id: true, shortId: true, name: true }),
});

type ParsedConnectorRow = z.infer<typeof ConnectorRowSchema>;

type ParsedCustomConnectorRow = z.infer<typeof CustomConnectorRowSchema>;

function salvageRow<Row>(
  schema: z.ZodType<Row>,
  raw: unknown,
): { row: Row | null; degraded: boolean } {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { row: parsed.data, degraded: false };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { row: null, degraded: true };
  const invalid = new Set(parsed.error.issues.map((issue) => issue.path[0]));
  const retried = schema.safeParse(
    Object.fromEntries(Object.entries(raw).filter(([key]) => !invalid.has(key))),
  );
  return { row: retried.success ? retried.data : null, degraded: true };
}

function salvageRows<Row>(
  schema: z.ZodType<Row>,
  value: unknown,
): { rows: Row[]; degraded: boolean } | null {
  if (!Array.isArray(value)) return null;
  let degraded = false;
  const rows: Row[] = [];
  for (const raw of value) {
    const salvaged = salvageRow(schema, raw);
    if (salvaged.degraded) degraded = true;
    if (salvaged.row !== null) rows.push(salvaged.row);
  }
  return { rows, degraded };
}

function readConnectorResponse(value: unknown): {
  rows: ParsedConnectorRow[];
  available: string[];
  degraded: boolean;
} | null {
  if (!value || typeof value !== 'object') return null;
  const envelope = value as { connectors?: unknown; available?: unknown };
  const connectors = salvageRows(ConnectorRowSchema, envelope.connectors);
  if (!connectors) return null;
  if (envelope.available === undefined) return { ...connectors, available: [] };
  const available = salvageRows(AvailableConnectorIdSchema, envelope.available);
  return {
    rows: connectors.rows,
    available: available?.rows ?? [],
    degraded: connectors.degraded || available === null || available.degraded,
  };
}

function readCustomConnectorResponse(value: unknown): {
  rows: ParsedCustomConnectorRow[];
  degraded: boolean;
} | null {
  if (!value || typeof value !== 'object') return null;
  return salvageRows(CustomConnectorRowSchema, (value as { connectors?: unknown }).connectors);
}

const CONNECTOR_NOT_CONNECTED_LABEL = 'Not connected';

const CAPABILITY_SENTENCE_END = '.';

const CUSTOM_CONNECTOR_ID_PREFIX = 'custom-';
const CUSTOM_CONNECTOR_CATEGORY = 'Custom';
const CUSTOM_CONNECTOR_AUTH_TYPE = 'custom_mcp';
const CUSTOM_CONNECTOR_SIGN_IN_COPY = 'Sign-in required';
const CUSTOM_CONNECTOR_OAUTH_CLIENT_HINT =
  'If the server gave you an OAuth client, add it again with its Client ID and Secret under Advanced settings.';
const CUSTOM_CONNECTOR_ICON_BG = 'from-muted to-muted';
const CUSTOM_CONNECTOR_ICON_TEXT = 'MCP';

function readOAuthRedirectUri(value: unknown): string | null {
  const parsed = OAuthRedirectUriSchema.safeParse(value);
  return parsed.success ? (parsed.data.oauthRedirectUri ?? null) : null;
}

function customSignInPending(row: ParsedCustomConnectorRow): boolean {
  return row.signInRequired === true && row.signedIn !== true && row.shortId !== undefined;
}

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
  | 'addCustomConnector'
  | 'customConnectorAuthTokenSupported'
  | 'customConnectorOAuthClientSupported'
  | 'customConnectorOAuthRedirectUri'
  | 'customConnectorPreset'
>;

function accountUrlPreset(connectorId: unknown): CustomConnectorPreset | null {
  const connector = typeof connectorId === 'string' ? accountUrlConnector(connectorId) : null;
  if (!connector) return null;
  return {
    name: connector.name,
    urlFormat: connector.urlFormat,
    hint: `Paste the URL of your ${connector.name} MCP server. ${connector.name} does not register clients on its own, so sign in with an OAuth client your administrator created, with the redirect URI below, or with a personal access token as the bearer token.`,
    documentationUrl: connector.documentationUrl,
  };
}

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
  onOpenCustomConnector?: () => void;
  directorySkillActions?: {
    onCreateSkill?: () => void;
    onEditSkill?: (name: string) => void;
    createSkillLabel?: string;
  };
}

export interface ConnectorsSettingsAdapterResult {
  adapter: ConnectorsSettingsAdapterSlice;
  clearCustomConnectorPreset: () => void;
  directoryAdapter: DirectoryAdapter;
  navBadges: Partial<Record<string, SettingsNavBadge>> | undefined;
  toolPermissionsConnector: ToolPermissionsConnector | null;
  setToolPermissionsConnectorId: (id: string | null) => void;
}

const CONNECTORS_UNAVAILABLE_COPY = 'Connectors are unavailable right now';

export function useConnectorsSettingsAdapter({
  open,
  authedHeaders,
  onOpenCustomConnector,
  directorySkillActions,
}: ConnectorsSettingsAdapterParams): ConnectorsSettingsAdapterResult {
  const router = useRouter();
  const connectorsAllowed = useCapability('canUseConnectors');
  const [connectedConnectors, setConnectedConnectors] = useState<ParsedConnectorRow[]>([]);
  const [customConnectorPreset, setCustomConnectorPreset] = useState<CustomConnectorPreset | null>(
    null,
  );
  const clearCustomConnectorPreset = useCallback(() => setCustomConnectorPreset(null), []);
  // OAuth grants the server reports as expired or revoked. `/api/connectors`
  // has always returned this per row; nothing outside the Connectors page read
  // it, so a connector could stop working and the only way to find out was to
  // open that one page and scroll to the right row.
  const [expiredConnectorIds, setExpiredConnectorIds] = useState<string[]>([]);
  const [githubInstallations, setGithubInstallations] = useState<
    {
      installation_id: number;
      created_at?: string;
      account_login?: string;
      pr_review_enabled?: boolean;
    }[]
  >([]);
  // Connector ids the server reports as actually connectable on web (GET
  // /api/connectors `available`): github when the GitHub App is configured, plus
  // operator-mapped remote MCP connectors. Drives canConnect instead of a
  // build-time hardcoded false.
  const [availableIds, setAvailableIds] = useState<string[]>([]);
  const [customConnectors, setCustomConnectors] = useState<ParsedCustomConnectorRow[]>([]);
  const [oauthRedirectUri, setOauthRedirectUri] = useState<string | null>(null);

  const [connectorsError, setConnectorsError] = useState<string | null>(null);
  const [connectorsNotice, setConnectorsNotice] = useState<string | null>(null);
  const [githubInstallationsNotice, setGithubInstallationsNotice] = useState<string | null>(null);

  const refreshCustomConnectors = useCallback(async () => {
    const response = await fetch(CUSTOM_CONNECTORS_PATH, {
      credentials: 'include',
      headers: await authedHeaders(),
    });
    if (!response.ok) throw new Error('Custom connector directory request failed.');
    const body = await response.json();
    setOauthRedirectUri(readOAuthRedirectUri(body));
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
          fetch(MANAGED_CLOUD_CONNECTORS_PATH, requestOptions),
          fetch('/api/github/installations', requestOptions),
          fetch(CUSTOM_CONNECTORS_PATH, requestOptions),
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
        setOauthRedirectUri(readOAuthRedirectUri(customJson));
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
        canConnect: connectorsAllowed && customSignInPending(c),
      })),
    [selfAddedConnectors, connectorsAllowed],
  );

  const [toolPermissionsConnector, setToolPermissionsConnector] =
    useState<ToolPermissionsConnector | null>(null);
  const [apiKeyConnectorId, setApiKeyConnectorId] = useState<string | null>(null);

  const mergedSettingsConnectors = useMemo(
    () =>
      [
        ...SETTINGS_CONNECTORS.map((c) =>
          !connectorsAllowed
            ? { ...c, canConnect: false, statusLabel: CONNECTORS_UNAVAILABLE_COPY }
            : availableIds.includes(c.id)
              ? { ...c, canConnect: true, statusLabel: undefined }
              : c,
        ),
        ...customSettingsConnectors,
      ] as typeof SETTINGS_CONNECTORS,
    [availableIds, customSettingsConnectors, connectorsAllowed],
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
          ? {
              status: 'warning' as const,
              warningLabel: CONNECTOR_REAUTHORIZATION_COPY,
              needsReauthorization: true,
            }
          : c.health === 'not-responding'
            ? { status: 'warning' as const, warningLabel: CONNECTOR_NOT_RESPONDING_COPY }
            : {}),
      }));
    if (githubInstallations.length > 0) {
      rows.push({ connectorId: 'github', connectedAt: githubInstallations[0]?.created_at });
    }
    for (const c of selfAddedConnectors) {
      rows.push({
        connectorId: `${CUSTOM_CONNECTOR_ID_PREFIX}${c.id}`,
        connectedAt: c.createdAt,
        ...(customSignInPending(c)
          ? {
              status: 'warning' as const,
              warningLabel: CUSTOM_CONNECTOR_SIGN_IN_COPY,
              needsReauthorization: true,
            }
          : {}),
      });
    }
    return rows;
  }, [connectedConnectors, githubInstallations, selfAddedConnectors]);

  const startCustomConnectorSignIn = useCallback(
    async (shortId: string, name: string) => {
      const target = withConnectorReturnPath(
        `${CONNECTOR_OAUTH_START_PATH}?connectorId=${encodeURIComponent(`${CUSTOM_CONNECTOR_ID_PREFIX}${shortId}`)}`,
        currentConnectorReturnPath(),
      );
      if (!target) throw new Error(`Could not connect ${name}.`);
      const res = await fetch(`${target}${target.includes('?') ? '&' : '?'}mode=json`, {
        headers: await authedHeaders(),
        credentials: 'include',
      });
      const parsed = OAuthStartSchema.safeParse(await res.json().catch(() => null));
      const body = parsed.success ? parsed.data : null;
      if (res.ok && body?.authorizeUrl) {
        openConnectorAuthorization(body.authorizeUrl, () => void loadConnectors());
        return;
      }
      throw new Error(
        (body?.status && brokerOutcomeMessage(body.status, name)) ??
          body?.error ??
          `Could not connect ${name}.`,
      );
    },
    [authedHeaders, loadConnectors],
  );

  const connectConnector = useCallback(
    async (id: string) => {
      if (id.startsWith(CUSTOM_CONNECTOR_ID_PREFIX)) {
        const row = customConnectors.find((c) => `${CUSTOM_CONNECTOR_ID_PREFIX}${c.id}` === id);
        if (!row?.shortId)
          throw new Error('This connector could not be found. Refresh and try again.');
        await startCustomConnectorSignIn(row.shortId, row.name);
        return;
      }
      // Web has no working per-provider authorization flow yet, so the catalog
      // is mapped with canConnect: false and the shared panel never invokes
      // this. Kept non-optimistic for when a real flow lands: POST first, only
      // reflect state the server confirmed, surface failures to the panel.
      const connector = SETTINGS_CONNECTORS.find((c) => c.id === id);
      const name = connector?.name ?? id;
      const csrfToken = await getCsrfToken();
      const connectRequest: ConnectRequest = {
        connectorId: id,
        ...(connector ? { authType: connector.authType } : {}),
      };
      const res = await fetch(MANAGED_CLOUD_CONNECTORS_PATH, {
        method: 'POST',
        headers: await authedHeaders({
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        }),
        credentials: 'include',
        body: JSON.stringify(connectRequest),
      });
      if (!res.ok) {
        // GitHub connects through the App install flow: the server answers POST
        // with 409 + installStartPath. Follow it instead of surfacing an error.
        const raw: unknown = await res
          .clone()
          .json()
          .catch(() => null);
        const conflict = ConnectConflictResponseSchema.safeParse(raw);
        const body = conflict.success ? conflict.data : null;
        if (res.status === 409 && body?.credentialsPath) {
          setApiKeyConnectorId(id);
          return;
        }
        const preset = res.status === 409 ? accountUrlPreset(body?.accountUrlConnector) : null;
        if (preset && onOpenCustomConnector) {
          setCustomConnectorPreset(preset);
          onOpenCustomConnector();
          return;
        }
        const plaidRoutes = res.status === 409 && body ? plaidLinkRoutesOf(body) : null;
        if (plaidRoutes && typeof window !== 'undefined') {
          const connectedAt = await connectBankAccountsWithPlaid(plaidRoutes, authedHeaders);
          if (connectedAt) {
            setConnectedConnectors((prev) => [
              ...prev.filter((c) => c.connectorId !== id),
              { connectorId: id, connectedAt },
            ]);
            announceBankConnected((href) => router.push(href));
          }
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
              const probeParsed = OAuthStartSchema.safeParse(
                await probeRes.json().catch(() => null),
              );
              const probeBody = probeParsed.success ? probeParsed.data : null;
              if (probeRes.ok && probeBody?.authorizeUrl) {
                openConnectorAuthorization(probeBody.authorizeUrl, () => void loadConnectors());
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
            openConnectorAuthorization(body.installStartPath, () => void loadConnectors());
            return;
          }
        }
        throw new Error(connectorErrorMessage(raw, `Could not connect ${name}.`));
      }
      const connected = ConnectedSchema.safeParse(await res.json().catch(() => null));
      if (!connected.success) throw new Error(`Could not connect ${name}.`);
      const { connector: saved } = connected.data;
      setConnectedConnectors((prev) => [
        ...prev.filter((c) => c.connectorId !== id),
        { connectorId: saved.connectorId, connectedAt: saved.connectedAt },
      ]);
    },
    [
      authedHeaders,
      customConnectors,
      onOpenCustomConnector,
      router,
      startCustomConnectorSignIn,
      loadConnectors,
    ],
  );

  const setGithubPrReview = useCallback(
    async (installationId: number, enabled: boolean) => {
      const csrfToken = await getCsrfToken();
      const previous = githubInstallations;
      setGithubInstallations((rows) =>
        rows.map((row) =>
          row.installation_id === installationId ? { ...row, pr_review_enabled: enabled } : row,
        ),
      );
      const res = await fetch('/api/github/installations', {
        method: 'PATCH',
        headers: await authedHeaders({
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        }),
        credentials: 'include',
        body: JSON.stringify({ installationId, prReviewEnabled: enabled }),
      });
      if (!res.ok) {
        setGithubInstallations(previous);
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Could not save the pull request review setting.');
      }
    },
    [authedHeaders, githubInstallations],
  );

  const disconnectConnector = useCallback(
    async (id: string) => {
      const csrfToken = await getCsrfToken();
      if (id === 'github') {
        // GitHub "connected" state is its App installations; disconnect
        // removes each installation via the real installations endpoint.
        const remaining = [...githubInstallations];
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
            setGithubInstallations(remaining);
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(
              body.error ??
                'The GitHub App is still installed on that account, so nothing was disconnected.',
            );
          }
          remaining.splice(
            remaining.findIndex((row) => row.installation_id === installation.installation_id),
            1,
          );
        }
        setGithubInstallations([]);
        return;
      }
      if (id.startsWith(CUSTOM_CONNECTOR_ID_PREFIX)) {
        const rowId = id.slice(CUSTOM_CONNECTOR_ID_PREFIX.length);
        const res = await fetch(`${CUSTOM_CONNECTORS_PATH}?id=${encodeURIComponent(rowId)}`, {
          method: 'DELETE',
          headers: await authedHeaders({ 'x-csrf-token': csrfToken }),
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error('Could not remove this connector. Try again.');
        }
        setCustomConnectors((prev) => prev.filter((c) => c.id !== rowId));
        await announceVendorNotice(res, id);
        return;
      }
      const res = await fetch(
        `${MANAGED_CLOUD_CONNECTORS_PATH}?connectorId=${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          headers: await authedHeaders({ 'x-csrf-token': csrfToken }),
          credentials: 'include',
        },
      );
      if (!res.ok) {
        throw new Error('Could not disconnect. Try again.');
      }
      setConnectedConnectors((prev) => prev.filter((c) => c.connectorId !== id));
      await announceVendorNotice(res, id);
    },
    [authedHeaders, githubInstallations],
  );

  const addCustomConnector = useCallback(
    async (input: {
      name: string;
      url: string;
      authToken?: string;
      oauthClientId?: string;
      oauthClientSecret?: string;
    }) => {
      const csrfToken = await getCsrfToken();
      const createRequest: CreateCustomConnectorRequest = {
        name: input.name,
        url: input.url,
        ...(input.authToken ? { authToken: input.authToken } : {}),
        ...(input.oauthClientId ? { oauthClientId: input.oauthClientId } : {}),
        ...(input.oauthClientSecret ? { oauthClientSecret: input.oauthClientSecret } : {}),
      };
      const res = await fetch(CUSTOM_CONNECTORS_PATH, {
        method: 'POST',
        headers: await authedHeaders({
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        }),
        credentials: 'include',
        body: JSON.stringify(createRequest),
      });
      if (!res.ok) {
        throw new Error(
          connectorErrorMessage(
            await res.json().catch(() => null),
            'Could not add connector. Try again.',
          ),
        );
      }
      const parsedCreated = CreatedCustomConnectorRowSchema.safeParse(
        await res.json().catch(() => null),
      );
      const created = parsedCreated.success ? parsedCreated.data : null;
      await refreshCustomConnectors();
      const connector = created?.connector;
      if (!created?.signInRequired || !connector) return;
      try {
        await startCustomConnectorSignIn(connector.shortId, connector.name);
      } catch (error) {
        if (input.oauthClientId) throw error;
        const removed = await fetch(
          `${CUSTOM_CONNECTORS_PATH}?id=${encodeURIComponent(connector.id)}`,
          {
            method: 'DELETE',
            headers: await authedHeaders({ 'x-csrf-token': await getCsrfToken() }),
            credentials: 'include',
          },
        );
        await refreshCustomConnectors();
        if (!removed.ok) throw error;
        const reason = error instanceof Error ? error.message : `Could not connect ${input.name}.`;
        throw new Error(`${reason} ${CUSTOM_CONNECTOR_OAUTH_CLIENT_HINT}`);
      }
    },
    [authedHeaders, refreshCustomConnectors, startCustomConnectorSignIn],
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
              description: translateUiPlural(
                'settings',
                'counts.connectorsNeedReconnect',
                expiredConnectorIds.length,
                {
                  one: '{{count}} connector needs to be reconnected',
                  other: '{{count}} connectors need to be reconnected',
                },
              ),
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
            <ConnectorAccountSummary connectorId={connectorId} />
            <ConnectorCapabilitiesPanel connectorRef={connectorId} connected />
            <McpResourceList connectorId={connectorId} />
            {connectorId === 'github' && githubInstallations.length > 0 ? (
              <div
                className="rounded-lg border border-border px-3 py-2"
                data-testid="github-pr-review-settings"
              >
                <p className="text-xs font-medium text-foreground">{GITHUB_PR_REVIEW_LABEL}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{GITHUB_PR_REVIEW_HINT}</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {githubInstallations.map((installation) => (
                    <li
                      key={installation.installation_id}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="truncate text-xs text-foreground">
                        {installation.account_login ?? String(installation.installation_id)}
                      </span>
                      <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          data-testid={`github-pr-review-${installation.installation_id}`}
                          checked={Boolean(installation.pr_review_enabled)}
                          onChange={(event) => {
                            const next = event.target.checked;
                            void setGithubPrReview(installation.installation_id, next).catch(
                              (error: unknown) => {
                                setGithubInstallationsNotice(
                                  toUserMessage(error, GITHUB_PR_REVIEW_FAILED),
                                );
                              },
                            );
                          }}
                        />
                        {installation.pr_review_enabled ? 'On' : 'Off'}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ConnectorGrantedScopeList
              scopes={
                connectedConnectors.find((connector) => connector.connectorId === connectorId)
                  ?.scopes ?? []
              }
            />
            <button
              type="button"
              onClick={() =>
                setToolPermissionsConnector(toolPermissionsTargetFor(connectorId, detail))
              }
              className="w-full rounded-lg border border-border px-3 py-2 text-start text-xs text-foreground transition-colors hover:bg-muted"
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
        <ConnectorHealthDashboard />
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
      customConnectorOAuthClientSupported: true,
      ...(oauthRedirectUri ? { customConnectorOAuthRedirectUri: oauthRedirectUri } : {}),
      customConnectorPreset,
    },
    clearCustomConnectorPreset,
    directoryAdapter,
    navBadges,
    toolPermissionsConnector,
    setToolPermissionsConnectorId,
  };
}
