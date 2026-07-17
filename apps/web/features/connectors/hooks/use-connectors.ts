'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { toast } from 'sonner';
import { getCsrfToken } from '@/lib/client/csrf';

export type ConnectorSource = 'user' | 'github-app' | 'custom';

export interface ConnectorStatus {
  connectedIds: Set<string>;
  connectedAtMap: Record<string, string>;
  /** Where the connection is managed: user_connectors row vs GitHub App installation vs user-added custom MCP connector. */
  sources: Record<string, ConnectorSource>;
  /** Display name for `source: 'custom'` entries (connectorId -> name); empty for catalog connectors. */
  customNames: Record<string, string>;
  /** Connector ids the server can actually connect right now (deployment capability). */
  availableIds: Set<string>;
  loading: boolean;
  /**
   * Set when the initial GET /api/connectors failed — distinct from a
   * genuinely empty connector list. Without this, a failed fetch and "you
   * have zero connectors" were indistinguishable in the UI (mutation errors
   * already toast correctly; this covers only the initial list load).
   */
  error: string | null;
  mutatingIds: Set<string>;
  connect: (id: string, authType: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  /** Re-fetch after a failed initial load. */
  retry: () => void;
}

interface ConnectorsResponse {
  connectors: Array<{
    connectorId: string;
    connectedAt?: string;
    source?: ConnectorSource;
    name?: string;
  }>;
  available?: string[];
}

// Module-level cache + in-flight request dedup so multiple components mounting
// the hook at once (ConnectorsPage, DirectoryModal, CustomizePage, etc.) don't
// each independently trigger a GET /api/connectors, which was contributing to
// rate-limit 429s that broke the core chat UI.
const CONNECTORS_CACHE_TTL_MS = 5000;
let connectorsInFlight: Promise<ConnectorsResponse> | null = null;
let connectorsCache: { data: ConnectorsResponse; fetchedAt: number } | null = null;

/**
 * Force the next useConnectors() fetch (in any mounted component) to hit the
 * network. Exported so callers that mutate connector state OUTSIDE this
 * hook's own connect()/disconnect() — e.g. saving a custom connector via
 * /api/connectors/custom — can make the shared cache reflect it immediately
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

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return body.message ?? body.error ?? fallback;
}

/**
 * Shared hook for fetching and mutating connector connection state.
 * Used by ConnectorsPage, DirectoryModal, and CustomizePage.
 */
export function useConnectors(): ConnectorStatus {
  const { isLoaded, isSignedIn } = useUser();
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [connectedAtMap, setConnectedAtMap] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Record<string, ConnectorSource>>({});
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());
  // Bumped by retry() to force the effect below to re-run a real fetch.
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
          for (const c of json.connectors) {
            if (c.connectedAt) atMap[c.connectorId] = c.connectedAt;
            sourceMap[c.connectorId] = c.source ?? 'user';
            if (c.source === 'custom' && c.name) nameMap[c.connectorId] = c.name;
          }
          setConnectedAtMap(atMap);
          setSources(sourceMap);
          setCustomNames(nameMap);
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

  const connect = useCallback(
    async (id: string, authType: string) => {
      if (!isSignedIn) {
        const redirectTo =
          typeof window === 'undefined'
            ? '/connectors'
            : `${window.location.pathname}${window.location.search}`;
        if (typeof window !== 'undefined') {
          window.location.href = `/login?redirectTo=${encodeURIComponent(redirectTo)}`;
        }
        return;
      }

      setConnectedIds((prev) => new Set([...prev, id]));
      setMutatingIds((prev) => new Set([...prev, id]));
      try {
        const csrfToken = await getCsrfToken();
        const res = await fetch('/api/connectors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ connectorId: id, authType }),
        });
        if (!res.ok) {
          setConnectedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          // GitHub connects through the App install flow — follow the server's
          // pointer instead of surfacing an error.
          const body = (await res
            .clone()
            .json()
            .catch(() => ({}))) as { installStartPath?: string };
          if (res.status === 409 && body.installStartPath && typeof window !== 'undefined') {
            window.location.href = body.installStartPath;
            return;
          }
          toast.error(
            await readErrorMessage(res, 'Could not connect this connector. Try again later.'),
          );
        } else {
          invalidateConnectorsCache();
        }
      } catch {
        setConnectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast.error('Network error while connecting. Check your connection and try again.');
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
    availableIds,
    loading,
    error,
    mutatingIds,
    connect,
    disconnect,
    retry,
  };
}
