'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ConnectorCapabilityCatalogSchema,
  connectorCapabilitiesPath,
  type ConnectorCapabilityCatalog,
} from '@agiworkforce/cloud-contracts';

import { toUserMessage } from '@/lib/user-error-message';

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: ConnectorCapabilityCatalog; fetchedAt: number }>();
const inFlight = new Map<string, Promise<ConnectorCapabilityCatalog>>();
let generation = 0;

async function fetchCatalog(connectorRef: string): Promise<ConnectorCapabilityCatalog> {
  const cached = cache.get(connectorRef);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.value;
  const pending = inFlight.get(connectorRef);
  if (pending) return pending;

  const requestGeneration = generation;
  const request = fetch(connectorCapabilitiesPath(connectorRef), {
    credentials: 'include',
    cache: 'no-store',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Capability discovery failed (${response.status})`);
      const parsed = ConnectorCapabilityCatalogSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('Capability discovery returned invalid data');
      if (requestGeneration === generation) {
        cache.set(connectorRef, { value: parsed.data, fetchedAt: Date.now() });
      }
      return parsed.data;
    })
    .finally(() => {
      if (inFlight.get(connectorRef) === request) inFlight.delete(connectorRef);
    });
  inFlight.set(connectorRef, request);
  return request;
}

export function invalidateConnectorCapabilityCatalog(connectorRef?: string): void {
  if (connectorRef) cache.delete(connectorRef);
  else cache.clear();
  generation += 1;
  inFlight.clear();
}

export function useConnectorCapabilities(connectorRef: string | null, enabled = true) {
  const [catalog, setCatalog] = useState<ConnectorCapabilityCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !connectorRef) {
      setCatalog(null);
      setLoading(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError(null);
    void fetchCatalog(connectorRef)
      .then((value) => {
        if (!cancelled) setCatalog(value);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setCatalog(null);
          setError(toUserMessage(reason, 'Capability discovery failed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, connectorRef, enabled]);

  const retry = useCallback(() => {
    if (connectorRef) invalidateConnectorCapabilityCatalog(connectorRef);
    setAttempt((value) => value + 1);
  }, [connectorRef]);

  return { catalog, loading, error, retry };
}
