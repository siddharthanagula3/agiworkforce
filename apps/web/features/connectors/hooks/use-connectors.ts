'use client';

import { useState, useEffect, useCallback } from 'react';
import { useCurrentUser } from '@/lib/identity/client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  CONNECTOR_OAUTH_RESULT_CONNECTOR_PARAM,
  CONNECTOR_OAUTH_RESULT_STATUS_PARAM,
  ConnectConflictResponseSchema,
  ConnectorConnectionSchema,
  ConnectorDirectoryEntrySchema,
  DisconnectResponseSchema,
  ListConnectorsResponseSchema,
  MANAGED_CLOUD_CONNECTORS_PATH,
  connectorDirectoryEntryPath,
  connectorErrorMessage,
  type ConnectRequest,
  type ConnectorOAuthResultStatus,
  type ConnectorSetupEntry,
  type ConnectorSource,
} from '@agiworkforce/cloud-contracts';
import { getCsrfToken } from '@/lib/client/csrf';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import {
  connectBankAccountsWithPlaid,
  plaidLinkRoutesOf,
} from '@/features/connectors/lib/plaid-link';
import { toUserMessage } from '@/lib/user-error-message';
import { announceBankConnected } from '@features/finance/lib/announce-bank-connected';
import { openConnectorAuthorization } from '../lib/open-connector-authorization';

export interface ConnectorStatus {
  connectedIds: Set<string>;
  connectedAtMap: Record<string, string>;
  sources: Record<string, ConnectorSource>;
  customNames: Record<string, string>;
  toolConnectorIds: Record<string, string>;
  grantedScopes: Record<string, string[]>;
  needsReauthorizationIds: Set<string>;
  notRespondingIds: Set<string>;
  availableIds: Set<string>;
  setupRequirements: Record<string, ConnectorSetupEntry>;
  loading: boolean;
  error: string | null;
  mutatingIds: Set<string>;
  connect: (id: string, authType: string) => Promise<void>;
  reconnect: (id: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  retry: () => void;
}

const ConnectorRowSchema = ConnectorConnectionSchema.pick({
  connectorId: true,
  toolConnectorId: true,
  connectedAt: true,
  source: true,
  name: true,
  scopes: true,
  needsReauthorization: true,
  health: true,
}).partial({ connectedAt: true, source: true });

const ConnectorsResponseSchema = ListConnectorsResponseSchema.pick({
  available: true,
  setup: true,
})
  .partial({ available: true })
  .extend({ connectors: z.array(ConnectorRowSchema) });

type ConnectorsResponse = z.infer<typeof ConnectorsResponseSchema>;

const DirectoryIdentitySchema = z.object({
  entry: ConnectorDirectoryEntrySchema.pick({ name: true, documentationUrl: true }).partial(),
});

const CONNECTORS_CACHE_TTL_MS = 5000;
let connectorsInFlight: Promise<ConnectorsResponse> | null = null;
let connectorsCache: { data: ConnectorsResponse; fetchedAt: number } | null = null;
/**
 * Bumped by every invalidation. A request that was already in flight carries the
 * generation it started in, so its response can no longer write a cache that has
 * since been cleared: an account switch during a fetch would otherwise be
 * followed, within the TTL, by the previous account's connectors.
 */
let connectorsGeneration = 0;

/**
 * Force the next useConnectors() fetch (in any mounted component) to hit the
 * network. Exported so callers that mutate connector state OUTSIDE this
 * hook's own connect()/disconnect(), e.g. saving a custom connector via
 * /api/connectors/custom, can make the shared cache reflect it immediately
 * instead of waiting out the 5s TTL.
 */
export function invalidateConnectorsCache() {
  connectorsCache = null;
  connectorsInFlight = null;
  connectorsGeneration += 1;
}

function fetchConnectorsShared(): Promise<ConnectorsResponse> {
  if (connectorsCache && Date.now() - connectorsCache.fetchedAt < CONNECTORS_CACHE_TTL_MS) {
    return Promise.resolve(connectorsCache.data);
  }
  if (connectorsInFlight) {
    return connectorsInFlight;
  }
  const generation = connectorsGeneration;
  const request = fetch(MANAGED_CLOUD_CONNECTORS_PATH)
    .then(async (res) => {
      if (!res.ok) {
        throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      }
      const json = ConnectorsResponseSchema.parse(await res.json());
      if (generation === connectorsGeneration) {
        connectorsCache = { data: json, fetchedAt: Date.now() };
      }
      return json;
    })
    .finally(() => {
      // Only retire this request's own registration. Clearing it blindly
      // de-registered a newer fetch that had already replaced it, so the next
      // caller opened a third request instead of joining the one in flight.
      if (connectorsInFlight === request) connectorsInFlight = null;
    });
  connectorsInFlight = request;
  return request;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  return connectorErrorMessage(await res.json().catch(() => null), fallback);
}

/**
 * A disconnect that the vendor did not confirm leaves access live there, which
 * the person can only end on the vendor's side, so the notice stays until it
 * is dismissed rather than timing out unread.
 */
export async function announceVendorNotice(res: Response, connectorId: string): Promise<void> {
  const parsed = DisconnectResponseSchema.safeParse(await res.json().catch(() => null));
  const notice = parsed.success ? parsed.data.vendorNotice : undefined;
  if (!notice) return;
  toast.warning(notice, { id: `connector-vendor-notice-${connectorId}`, duration: Infinity });
}

const BROKER_OUTCOME_PARAMS = [
  CONNECTOR_OAUTH_RESULT_CONNECTOR_PARAM,
  CONNECTOR_OAUTH_RESULT_STATUS_PARAM,
] as const;
const BANK_CONNECT_FAILED = 'Could not connect your bank account. Try again.';
const FALLBACK_CONNECTOR_NAME = 'This connector';
const DOCUMENTATION_ACTION_LABEL = 'Open documentation';
const DIRECTORY_ID_MARKERS = ['.', '/'] as const;

type BrokerOutcome = {
  tone: 'success' | 'error' | 'info';
  message: (name: string) => string;
  offersDocumentation?: boolean;
};

const BROKER_OUTCOMES: Readonly<Partial<Record<string, BrokerOutcome>>> = {
  registration_rejected: {
    tone: 'error',
    message: (name) => `${name} refused to register this app, so it cannot be connected here.`,
    offersDocumentation: true,
  },
  reauthorize: {
    tone: 'error',
    message: (name) =>
      `${name} moved to a different authorization server. Connect it again to continue.`,
  },
  connected: { tone: 'success', message: (name) => `${name} is connected.` },
  open: { tone: 'info', message: (name) => `${name} needs no authorization and is ready to use.` },
  denied: {
    tone: 'error',
    message: (name) => `Authorization for ${name} was declined. Nothing was connected.`,
  },
  failed: {
    tone: 'error',
    message: (name) => `${name} did not finish authorizing. Try connecting it again.`,
  },
  invalid_state: {
    tone: 'error',
    message: (name) =>
      `The authorization for ${name} expired before it completed. Start the connection again.`,
  },
  unavailable: {
    tone: 'error',
    message: (name) => `${name} cannot be connected right now. Try again later.`,
  },
  error: {
    tone: 'error',
    message: (name) => `Something went wrong connecting ${name}. Try again.`,
  },
  not_configured: {
    tone: 'error',
    message: (name) => `${name} is not set up on this deployment yet.`,
  },
} satisfies Partial<Record<ConnectorOAuthResultStatus, BrokerOutcome>>;

interface ConnectorIdentity {
  name: string;
  documentationUrl: string | null;
}

export function connectorDisplayName(id: string): string {
  return CONNECTORS.find((c) => c.id === id)?.name ?? FALLBACK_CONNECTOR_NAME;
}

function looksLikeDirectoryId(id: string): boolean {
  return DIRECTORY_ID_MARKERS.some((marker) => id.includes(marker));
}

async function fetchDirectoryIdentity(id: string): Promise<ConnectorIdentity> {
  const fallback = { name: FALLBACK_CONNECTOR_NAME, documentationUrl: null };
  try {
    const res = await fetch(connectorDirectoryEntryPath(id), { cache: 'no-store' });
    if (!res.ok) return fallback;
    const parsed = DirectoryIdentitySchema.safeParse(await res.json());
    if (!parsed.success) return fallback;
    return {
      name: parsed.data.entry.name ?? FALLBACK_CONNECTOR_NAME,
      documentationUrl: parsed.data.entry.documentationUrl ?? null,
    };
  } catch {
    return fallback;
  }
}

export function brokerOutcomeMessage(status: string, name: string): string | null {
  return BROKER_OUTCOMES[status]?.message(name) ?? null;
}

function announceBrokerOutcome(
  outcome: BrokerOutcome,
  identity: ConnectorIdentity,
  onConnected: () => void,
): void {
  const message = outcome.message(identity.name);
  if (outcome.tone === 'success') {
    toast.success(message);
    onConnected();
    return;
  }
  if (outcome.tone === 'info') {
    toast.info(message);
    return;
  }
  const documentationUrl = outcome.offersDocumentation ? identity.documentationUrl : null;
  if (!documentationUrl) {
    toast.error(message);
    return;
  }
  toast.error(message, {
    action: {
      label: DOCUMENTATION_ACTION_LABEL,
      onClick: () => window.open(documentationUrl, '_blank', 'noopener,noreferrer'),
    },
  });
}

export function useBrokerOutcome(onConnected: () => void): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const status = params.get(CONNECTOR_OAUTH_RESULT_STATUS_PARAM);
    if (!status) return;

    const outcome = BROKER_OUTCOMES[status];
    const connectorId = params.get(CONNECTOR_OAUTH_RESULT_CONNECTOR_PARAM) ?? '';

    for (const key of BROKER_OUTCOME_PARAMS) params.delete(key);
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );

    if (!outcome) return;

    const curated = CONNECTORS.find((c) => c.id === connectorId);
    if (curated || !looksLikeDirectoryId(connectorId)) {
      announceBrokerOutcome(
        outcome,
        { name: connectorDisplayName(connectorId), documentationUrl: null },
        onConnected,
      );
      return;
    }

    let cancelled = false;
    void fetchDirectoryIdentity(connectorId).then((identity) => {
      if (!cancelled) announceBrokerOutcome(outcome, identity, onConnected);
    });
    return () => {
      cancelled = true;
    };
  }, [onConnected]);
}

export function currentConnectorReturnPath(): string {
  if (typeof window === 'undefined') return '/connectors';
  const params = new URLSearchParams(window.location.search);
  for (const key of BROKER_OUTCOME_PARAMS) params.delete(key);
  const query = params.toString();
  const path = `${window.location.pathname}${query ? `?${query}` : ''}`;
  return /^\/[^/\\]/.test(path) ? path : '/connectors';
}

export function withConnectorReturnPath(startPath: string, returnPath: string): string | null {
  if (!/^\/[^/\\]/.test(startPath)) return null;
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const url = new URL(startPath, origin);
  url.searchParams.set('returnPath', returnPath);
  return `${url.pathname}${url.search}`;
}

export function useConnectors(): ConnectorStatus {
  const { isLoaded, isSignedIn } = useCurrentUser();
  const router = useRouter();
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [connectedAtMap, setConnectedAtMap] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Record<string, ConnectorSource>>({});
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [toolConnectorIds, setToolConnectorIds] = useState<Record<string, string>>({});
  const [grantedScopes, setGrantedScopes] = useState<Record<string, string[]>>({});
  const [needsReauthorizationIds, setNeedsReauthorizationIds] = useState<Set<string>>(new Set());
  const [notRespondingIds, setNotRespondingIds] = useState<Set<string>>(new Set());
  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set());
  const [setupRequirements, setSetupRequirements] = useState<Record<string, ConnectorSetupEntry>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!isLoaded) {
      return () => {
        cancelled = true;
      };
    }

    if (!isSignedIn) {
      setConnectedIds(new Set());
      setConnectedAtMap({});
      setSources({});
      setCustomNames({});
      setToolConnectorIds({});
      setGrantedScopes({});
      setNeedsReauthorizationIds(new Set());
      setNotRespondingIds(new Set());
      setAvailableIds(new Set());
      setSetupRequirements({});
      setLoading(false);
      setError(null);
      invalidateConnectorsCache();
      return () => {
        cancelled = true;
      };
    }

    async function fetchConnectors() {
      setLoading(true);
      try {
        const json = await fetchConnectorsShared();
        if (!cancelled) {
          setConnectedIds(new Set(json.connectors.map((c) => c.connectorId)));
          const atMap: Record<string, string> = {};
          const sourceMap: Record<string, ConnectorSource> = {};
          const nameMap: Record<string, string> = {};
          const scopeMap: Record<string, string[]> = {};
          const toolIdMap: Record<string, string> = {};
          const staleIds = new Set<string>();
          const downIds = new Set<string>();
          for (const c of json.connectors) {
            if (c.connectedAt) atMap[c.connectorId] = c.connectedAt;
            sourceMap[c.connectorId] = c.source ?? 'user';
            if (c.source === 'custom' && c.name) nameMap[c.connectorId] = c.name;
            if (c.scopes) scopeMap[c.connectorId] = c.scopes;
            if (c.needsReauthorization || c.health === 'needs-reauthorization') {
              staleIds.add(c.connectorId);
            }
            if (c.health === 'not-responding') downIds.add(c.connectorId);
            toolIdMap[c.connectorId] = c.toolConnectorId ?? c.connectorId;
          }
          setConnectedAtMap(atMap);
          setSources(sourceMap);
          setCustomNames(nameMap);
          setToolConnectorIds(toolIdMap);
          setGrantedScopes(scopeMap);
          setNeedsReauthorizationIds(staleIds);
          setNotRespondingIds(downIds);
          setAvailableIds(new Set(json.available ?? []));
          setSetupRequirements(json.setup ?? {});
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(toUserMessage(err, 'Could not load connectors. Try again later.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchConnectors();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, retryCount]);

  const retry = useCallback(() => {
    invalidateConnectorsCache();
    setRetryCount((n) => n + 1);
  }, []);

  useBrokerOutcome(retry);

  const runConnect = useCallback(
    async (id: string, authType: string, options: { optimistic: boolean }) => {
      if (!isSignedIn) {
        const redirectTo =
          typeof window === 'undefined'
            ? '/connectors'
            : `${window.location.pathname}${window.location.search}`;
        router.push(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
        return;
      }

      if (options.optimistic) setConnectedIds((prev) => new Set([...prev, id]));
      setMutatingIds((prev) => new Set([...prev, id]));
      try {
        const csrfToken = await getCsrfToken();
        const connectRequest: ConnectRequest = { connectorId: id, authType };
        const res = await fetch(MANAGED_CLOUD_CONNECTORS_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify(connectRequest),
        });
        if (!res.ok) {
          if (options.optimistic) {
            setConnectedIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
          const raw: unknown = await res.json().catch(() => null);
          const conflict = ConnectConflictResponseSchema.safeParse(raw);
          const body = conflict.success ? conflict.data : null;
          const plaidRoutes = res.status === 409 && body ? plaidLinkRoutesOf(body) : null;
          if (plaidRoutes && typeof window !== 'undefined') {
            try {
              if (await connectBankAccountsWithPlaid(plaidRoutes)) {
                setConnectedIds((prev) => new Set([...prev, id]));
                invalidateConnectorsCache();
                announceBankConnected((href) => router.push(href));
              }
            } catch (caught) {
              toast.error(toUserMessage(caught, BANK_CONNECT_FAILED));
            }
            return;
          }
          if (res.status === 409 && body && typeof window !== 'undefined') {
            if (body.oauthStartPath) {
              const target = withConnectorReturnPath(
                body.oauthStartPath,
                currentConnectorReturnPath(),
              );
              if (target) {
                openConnectorAuthorization(target, retry);
                return;
              }
            } else if (body.installStartPath) {
              openConnectorAuthorization(body.installStartPath, retry);
              return;
            }
          }
          toast.error(
            connectorErrorMessage(raw, 'Could not connect this connector. Try again later.'),
          );
        } else {
          invalidateConnectorsCache();
        }
      } catch {
        if (options.optimistic) {
          setConnectedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
        toast.error('Network error while connecting. Check your connection and try again.');
      } finally {
        setMutatingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [isSignedIn, retry, router],
  );

  const connect = useCallback(
    async (id: string, authType: string) => runConnect(id, authType, { optimistic: true }),
    [runConnect],
  );

  const reconnect = useCallback(
    async (id: string) => runConnect(id, 'oauth', { optimistic: false }),
    [runConnect],
  );

  const disconnect = useCallback(
    async (id: string) => {
      if (!isSignedIn) return;

      setConnectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setMutatingIds((prev) => new Set([...prev, id]));
      try {
        const csrfToken = await getCsrfToken();
        const res = await fetch(
          `${MANAGED_CLOUD_CONNECTORS_PATH}?connectorId=${encodeURIComponent(id)}`,
          {
            method: 'DELETE',
            headers: { 'x-csrf-token': csrfToken },
          },
        );
        if (!res.ok) {
          setConnectedIds((prev) => new Set([...prev, id]));
          toast.error(await readErrorMessage(res, 'Could not disconnect. Try again later.'));
        } else {
          await announceVendorNotice(res, id);
          setGrantedScopes((prev) => {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          });
          setNeedsReauthorizationIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          invalidateConnectorsCache();
        }
      } catch {
        setConnectedIds((prev) => new Set([...prev, id]));
        toast.error('Network error while disconnecting. Check your connection and try again.');
      } finally {
        setMutatingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [isSignedIn],
  );

  return {
    connectedIds,
    connectedAtMap,
    sources,
    customNames,
    toolConnectorIds,
    grantedScopes,
    needsReauthorizationIds,
    notRespondingIds,
    availableIds,
    setupRequirements,
    loading,
    error,
    mutatingIds,
    connect,
    reconnect,
    disconnect,
    retry,
  };
}
