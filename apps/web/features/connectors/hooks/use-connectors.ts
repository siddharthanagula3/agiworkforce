'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { toast } from 'sonner';
import { getCsrfToken } from '@/lib/client/csrf';

/**
 * Where a connection is managed. Mirrors `ConnectorEntry.source` in
 * `app/api/connectors/route.ts`:
 * - `user`        — a `user_connectors` enablement row (operator-mapped remote MCP)
 * - `github-app`  — a GitHub App installation
 * - `custom`      — a user-added custom remote MCP connector
 * - `oauth`       — a personal grant from the connector OAuth broker (migration 0097)
 */
export type ConnectorSource = 'user' | 'github-app' | 'custom' | 'oauth';

export interface ConnectorStatus {
  connectedIds: Set<string>;
  connectedAtMap: Record<string, string>;
  /** Where the connection is managed. */
  sources: Record<string, ConnectorSource>;
  /** Display name for `source: 'custom'` entries (connectorId -> name); empty for catalog connectors. */
  customNames: Record<string, string>;
  /**
   * `source: 'oauth'` only: the scopes the provider actually granted, verbatim.
   * These are provider jargon and are rendered as-is — the client has no
   * sourced description for them.
   */
  grantedScopes: Record<string, string[]>;
  /**
   * `source: 'oauth'` only: grants whose access token has expired with no
   * refresh token stored, so the tool loop can no longer use them. The user has
   * to authorize again.
   */
  needsReauthorizationIds: Set<string>;
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
  /**
   * Re-run the OAuth authorization for a connector that is already connected
   * but whose grant is dead. Same server round-trip as `connect`, minus the
   * optimistic "now connected" flip — the connector never stopped being listed.
   */
  reconnect: (id: string) => Promise<void>;
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
    /** OAuth grants only. */
    scopes?: string[];
    /** OAuth grants only. */
    needsReauthorization?: boolean;
  }>;
  available?: string[];
}

/**
 * The 409 body POST /api/connectors returns for a connector that connects by
 * running a flow instead of by flipping a row.
 *
 * `oauthStartPath` is built server-side by `buildConnectorOAuthStartPath()`
 * (`lib/connectors/oauth-registry.ts`). That module is `server-only` — it holds
 * the platform's OAuth client credentials — so a client bundle cannot import it
 * and MUST NOT re-derive the route here. `installStartPath` is the GitHub App
 * install flow, plus a compatibility alias the route sets to the same value as
 * `oauthStartPath`.
 */
interface ConnectStartBody {
  error?: string;
  message?: string;
  oauthStartPath?: string;
  installStartPath?: string;
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

function messageFromBody(body: { error?: string; message?: string }, fallback: string): string {
  return body.message ?? body.error ?? fallback;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return messageFromBody(body, fallback);
}

/**
 * Query params the OAuth broker sets on the return leg (`connector` plus a
 * coarse `status`). Both are stripped from the return path we hand it, so a
 * second attempt cannot carry a stale outcome forward and re-toast it.
 *
 * `status` is also the directory's own filter key. Keeping it would change
 * nothing — the broker's `searchParams.set('status', …)` overwrites it on the
 * way back — so dropping it is the simpler behavior, at the cost of the filter
 * resetting to All after a round-trip through a provider.
 */
const BROKER_OUTCOME_PARAMS = ['connector', 'status'] as const;

/** Same-origin path the provider's consent screen should return the user to. */
export function currentConnectorReturnPath(): string {
  if (typeof window === 'undefined') return '/connectors';
  const params = new URLSearchParams(window.location.search);
  for (const key of BROKER_OUTCOME_PARAMS) params.delete(key);
  const query = params.toString();
  const path = `${window.location.pathname}${query ? `?${query}` : ''}`;
  // Same shape the server enforces (`sanitizeConnectorReturnPath`, and the
  // `return_path` CHECK in migration 0097): a single leading slash. Anything
  // else degrades to the connectors surface rather than being sent on.
  return /^\/[^/\\]/.test(path) ? path : '/connectors';
}

/**
 * Attach `returnPath` to the start path the SERVER handed back.
 *
 * The path itself always comes from `buildConnectorOAuthStartPath()` on the
 * server; only the caller knows where the user should land afterwards, so that
 * one parameter is added on top. `/api/connectors/oauth/start` re-sanitizes it,
 * so this is a convenience, not a trust boundary.
 *
 * Returns null for anything that is not a same-origin absolute path — the body
 * comes from our own API, but a navigation target is not worth trusting blindly.
 */
export function withConnectorReturnPath(startPath: string, returnPath: string): string | null {
  if (!/^\/[^/\\]/.test(startPath)) return null;
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const url = new URL(startPath, origin);
  url.searchParams.set('returnPath', returnPath);
  return `${url.pathname}${url.search}`;
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
  const [grantedScopes, setGrantedScopes] = useState<Record<string, string[]>>({});
  const [needsReauthorizationIds, setNeedsReauthorizationIds] = useState<Set<string>>(new Set());
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
            // `scopes` / `needsReauthorization` are only populated for
            // `source: 'oauth'` rows; every other source leaves them undefined.
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

  /**
   * Ask the server to connect `id`, and follow wherever it points.
   *
   * Three honest outcomes, all driven by the server:
   * - 2xx     — an operator-mapped connector was enabled; refresh the list.
   * - 409     — this connector connects by running a flow. The body carries the
   *             start path (OAuth broker or GitHub App install); navigate there.
   * - 501/etc — no flow exists for it in this deployment; show what the server
   *             said instead of pretending a connection is pending.
   */
  const runConnect = useCallback(
    async (id: string, authType: string, options: { optimistic: boolean }) => {
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
            // A provider with a registered platform OAuth app: send the user to
            // the broker's start path, carrying where to come back to.
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
              // GitHub App install flow — it owns its own return handling.
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
    [isSignedIn],
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
          // The grant (and its scopes) is gone server-side, so drop the local
          // copy too — otherwise a reconnect would briefly show scopes from an
          // authorization that no longer exists.
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
