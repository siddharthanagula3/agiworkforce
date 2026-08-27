'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';

import { toUserMessage } from '@/lib/user-error-message';

const CatalogItemSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
});

const ConnectorCapabilityCatalogSchema = z.object({
  connectorId: z.string(),
  connectorLabel: z.string(),
  source: z.enum(['github-adapter', 'operator', 'oauth', 'custom', 'organization']),
  generatedAt: z.number(),
  protocolEra: z.enum(['modern', 'legacy']),
  protocolVersion: z.string().optional(),
  serverInfo: z.object({ name: z.string(), version: z.string() }).optional(),
  capabilityKeys: z.array(z.string()),
  tasksSupported: z.boolean(),
  tools: z.array(
    CatalogItemSchema.extend({
      visibility: z.enum(['model', 'app', 'both']),
      hasApp: z.boolean(),
    }),
  ),
  resources: z.array(
    CatalogItemSchema.extend({
      uri: z.string(),
      mimeType: z.string().optional(),
      size: z.number().optional(),
      isApp: z.boolean(),
    }),
  ),
  resourceTemplates: z.array(
    CatalogItemSchema.extend({ uriTemplate: z.string(), mimeType: z.string().optional() }),
  ),
  prompts: z.array(
    CatalogItemSchema.extend({
      arguments: z.array(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          required: z.boolean().optional(),
        }),
      ),
    }),
  ),
  apps: z.array(
    z.object({
      serverName: z.string(),
      toolName: z.string(),
      resourceUri: z.string(),
      visibility: z.enum(['model', 'app', 'both']),
    }),
  ),
  discoveryErrors: z.array(
    z.object({
      capability: z.enum(['tools', 'resources', 'resourceTemplates', 'prompts']),
      message: z.string(),
    }),
  ),
});

export type ConnectorCapabilityCatalog = z.infer<typeof ConnectorCapabilityCatalogSchema>;

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: ConnectorCapabilityCatalog; fetchedAt: number }>();
const inFlight = new Map<string, Promise<ConnectorCapabilityCatalog>>();

async function fetchCatalog(connectorRef: string): Promise<ConnectorCapabilityCatalog> {
  const cached = cache.get(connectorRef);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.value;
  const pending = inFlight.get(connectorRef);
  if (pending) return pending;

  const request = fetch(`/api/connectors/${encodeURIComponent(connectorRef)}/capabilities`, {
    credentials: 'include',
    cache: 'no-store',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Capability discovery failed (${response.status})`);
      const parsed = ConnectorCapabilityCatalogSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('Capability discovery returned invalid data');
      cache.set(connectorRef, { value: parsed.data, fetchedAt: Date.now() });
      return parsed.data;
    })
    .finally(() => inFlight.delete(connectorRef));
  inFlight.set(connectorRef, request);
  return request;
}

export function invalidateConnectorCapabilityCatalog(connectorRef?: string): void {
  if (connectorRef) cache.delete(connectorRef);
  else cache.clear();
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
