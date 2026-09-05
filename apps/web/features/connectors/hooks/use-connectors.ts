'use client';

import { useState, useEffect, useCallback } from 'react';
import { useCurrentUser } from '@/lib/identity/client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getCsrfToken } from '@/lib/client/csrf';
import { CONNECTORS } from '@/features/connectors/data/connectors';

export type ConnectorSource = 'user' | 'github-app' | 'custom' | 'oauth';

export interface ConnectorStatus {
  connectedIds: Set<string>;
  connectedAtMap: Record<string, string>;
  sources: Record<string, ConnectorSource>;
  customNames: Record<string, string>;
  grantedScopes: Record<string, string[]>;
  needsReauthorizationIds: Set<string>;
  availableIds: Set<string>;
  loading: boolean;
  error: string | null;
  mutatingIds: Set<string>;
  connect: (id: string, authType: string) => Promise<void>;
  reconnect: (id: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  retry: () => void;
}

interface ConnectorsResponse {
  connectors: Array<{
    connectorId: string;
    connectedAt?: string;
    source?: ConnectorSource;
    name?: string;
    scopes?: string[];
    needsReauthorization?: boolean;
  }>;
  available?: string[];
}

interface ConnectStartBody {
  error?: string;
  message?: string;
  oauthStartPath?: string;
  installStartPath?: string;
}

const CONNECTORS_CACHE_TTL_MS = 5000;
let connectorsInFlight: Promise<ConnectorsResponse> | null = null;
let connectorsCache: { data: ConnectorsResponse; fetchedAt: number } | null = null;

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
}

function fetchConnectorsShared(): Promise<ConnectorsResponse> {
  if (connectorsCache && Date.now() - connectorsCache.fetchedAt < CONNECTORS_CACHE_TTL_MS) {
    return Promise.resolve(connectorsCache.data);
  }
  if (connectorsInFlight) {
    return connectorsInFlight;
  }
  const request = fetch('/api/connectors')
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`Failed to fetch connectors: ${res.status}`);
      }
      const json = (await res.json()) as ConnectorsResponse;
      connectorsCache = { data: json, fetchedAt: Date.now() };
      return json;
    })
    .finally(() => {
      connectorsInFlight = null;
    });
  connectorsInFlight = request;
  return request;
}

function messageFromBody(body: { error?: string; message?: string }, fallback: string): string {
  return body.message ?? body.error ?? fallback;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return messageFromBody(body, fallback);
}

const BROKER_OUTCOME_PARAMS = ['connector', 'status'] as const;

type BrokerOutcome = {
  tone: 'success' | 'error' | 'info';
  message: (name: string) => string;
};

const BROKER_OUTCOMES: Record<string, BrokerOutcome> = {
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
};

function connectorDisplayName(id: string): string {
  return CONNECTORS.find((c) => c.id === id)?.name ?? 'This connector';
}

export function brokerOutcomeMessage(status: string, name: string): string | null {
  return BROKER_OUTCOMES[status]?.message(name) ?? null;
}

export function useBrokerOutcome(onConnected: () => void): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    if (!status) return;

    const outcome = BROKER_OUTCOMES[status];
    const name = connectorDisplayName(params.get('connector') ?? '');

    for (const key of BROKER_OUTCOME_PARAMS) params.delete(key);
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );

    if (!outcome) return;

    const message = outcome.message(name);
    if (outcome.tone === 'success') {
      toast.success(message);
      onConnected();
    } else if (outcome.tone === 'info') {
      toast.info(message);
    } else {
      toast.error(message);
    }
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
  const [grantedScopes, setGrantedScopes] = useState<Record<string, string[]>>({});
  const [needsReauthorizationIds, setNeedsReauthorizationIds] = useState<Set<string>>(new Set());
  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set());
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
      setGrantedScopes({});
      setNeedsReauthorizationIds(new Set());
      setAvailableIds(new Set());
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
          const staleIds = new Set<string>();
          for (const c of json.connectors) {
            if (c.connectedAt) atMap[c.connectorId] = c.connectedAt;
            sourceMap[c.connectorId] = c.source ?? 'user';
            if (c.source === 'custom' && c.name) nameMap[c.connectorId] = c.name;
            if (c.scopes) scopeMap[c.connectorId] = c.scopes;
            if (c.needsReauthorization) staleIds.add(c.connectorId);
          }
          setConnectedAtMap(atMap);
          setSources(sourceMap);
          setCustomNames(nameMap);
          setGrantedScopes(scopeMap);
          setNeedsReauthorizationIds(staleIds);
          setAvailableIds(new Set(json.available ?? []));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Could not load connectors. Try again later.',
          );
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
        const res = await fetch('/api/connectors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ connectorId: id, authType }),
        });
        if (!res.ok) {
          if (options.optimistic) {
            setConnectedIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
          const body = (await res.json().catch(() => ({}))) as ConnectStartBody;
          if (res.status === 409 && typeof window !== 'undefined') {
            if (body.oauthStartPath) {
              const target = withConnectorReturnPath(
                body.oauthStartPath,
                currentConnectorReturnPath(),
              );
              if (target) {
                window.location.href = target;
                return;
              }
            } else if (body.installStartPath) {
              window.location.href = body.installStartPath;
              return;
            }
          }
          toast.error(messageFromBody(body, 'Could not connect this connector. Try again later.'));
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
    [isSignedIn, router],
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
        const res = await fetch(`/api/connectors?connectorId=${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'x-csrf-token': csrfToken },
        });
        if (!res.ok) {
          setConnectedIds((prev) => new Set([...prev, id]));
          toast.error(await readErrorMessage(res, 'Could not disconnect. Try again later.'));
        } else {
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
    grantedScopes,
    needsReauthorizationIds,
    availableIds,
    loading,
    error,
    mutatingIds,
    connect,
    reconnect,
    disconnect,
    retry,
  };
}
