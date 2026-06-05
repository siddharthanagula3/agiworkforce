'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { getCsrfToken } from '@/lib/client/csrf';

export interface ConnectorStatus {
  connectedIds: Set<string>;
  connectedAtMap: Record<string, string>;
  loading: boolean;
  mutatingIds: Set<string>;
  connect: (id: string, authType: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
}

/**
 * Shared hook for fetching and mutating connector connection state.
 * Used by ConnectorsPage, DirectoryModal, and CustomizePage.
 */
export function useConnectors(): ConnectorStatus {
  const { isLoaded, isSignedIn } = useUser();
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [connectedAtMap, setConnectedAtMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());

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
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    async function fetchConnectors() {
      try {
        const res = await fetch('/api/connectors');
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const json = (await res.json()) as {
          connectors: Array<{ connectorId: string; connectedAt?: string }>;
        };
        if (!cancelled) {
          setConnectedIds(new Set(json.connectors.map((c) => c.connectorId)));
          const atMap: Record<string, string> = {};
          for (const c of json.connectors) {
            if (c.connectedAt) atMap[c.connectorId] = c.connectedAt;
          }
          setConnectedAtMap(atMap);
        }
      } catch {
        // Network error - degrade gracefully
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchConnectors();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

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
        }
      } catch {
        setConnectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
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
        }
      } catch {
        setConnectedIds((prev) => new Set([...prev, id]));
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

  return { connectedIds, connectedAtMap, loading, mutatingIds, connect, disconnect };
}
