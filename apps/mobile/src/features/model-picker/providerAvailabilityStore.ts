import { useEffect } from 'react';
import { create } from 'zustand';
import { api } from '@/services/api';

const MODEL_CATALOG_PATH = '/api/models';
const AVAILABILITY_TTL_MS = 60_000;

export interface ProviderOutage {
  reason: string;
  until: string;
}

interface ProviderAvailabilityState {
  outages: Readonly<Record<string, ProviderOutage>>;
  checkedAtMs: number;
  checking: boolean;
  refresh: () => Promise<void>;
}

function readOutages(body: unknown): Record<string, ProviderOutage> {
  const models = (body as { models?: unknown } | null)?.models;
  const outages: Record<string, ProviderOutage> = {};
  if (!Array.isArray(models)) return outages;
  for (const entry of models) {
    const provider = (entry as { provider?: unknown }).provider;
    const availability = (entry as { availability?: unknown }).availability as
      { state?: unknown; reason?: unknown; until?: unknown } | undefined;
    if (typeof provider !== 'string' || availability?.state !== 'degraded') continue;
    outages[provider] = {
      reason: typeof availability.reason === 'string' ? availability.reason : '',
      until: typeof availability.until === 'string' ? availability.until : '',
    };
  }
  return outages;
}

export const useProviderAvailabilityStore = create<ProviderAvailabilityState>((set, get) => ({
  outages: {},
  checkedAtMs: 0,
  checking: false,
  refresh: async () => {
    if (get().checking || Date.now() - get().checkedAtMs < AVAILABILITY_TTL_MS) return;
    set({ checking: true });
    try {
      const body = await api.get<unknown>(MODEL_CATALOG_PATH);
      set({ outages: readOutages(body), checkedAtMs: Date.now(), checking: false });
    } catch {
      set({ checkedAtMs: Date.now(), checking: false });
    }
  },
}));

export function useProviderOutage(provider: string, enabled: boolean): ProviderOutage | null {
  const outage = useProviderAvailabilityStore((state) => state.outages[provider] ?? null);
  const refresh = useProviderAvailabilityStore((state) => state.refresh);
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);
  return enabled ? outage : null;
}
