import 'server-only';

import {
  getGatewayDefinition,
  getProviderOfferings,
  type ProviderOffering,
} from '@agiworkforce/types';
import { validateBaseUrl } from '@agiworkforce/provider-runtime';
import { getOptionalEnv } from '@shared/utils/env';
import { gatewayRoutesEnabled } from '@/lib/services/gateway-routing';

export interface ExperientialFreeOffering {
  key: string;
  offering: ProviderOffering;
  promotional: boolean;
}

export interface ExperientialFreeConfiguration {
  baseUrl: string;
  apiKey: string;
}

interface Promotion {
  free?: unknown;
  slugs?: unknown;
}

export function experientialFreeConfiguration(): ExperientialFreeConfiguration | null {
  const gateway = getGatewayDefinition('experientiallabs');
  if (!gateway || !gatewayRoutesEnabled()) return null;
  const apiKey = getOptionalEnv(gateway.apiKeyEnv);
  const checked = validateBaseUrl(getOptionalEnv(gateway.baseUrlEnv), {
    allowedHosts: [gateway.host],
  });
  if (!apiKey || !checked.ok) return null;
  return { baseUrl: checked.url, apiKey };
}

export function configuredExperientialFreeOfferings(): ExperientialFreeOffering[] {
  return Object.entries(getProviderOfferings())
    .filter(
      ([key, offering]) =>
        key.startsWith('experientiallabs-free-') &&
        offering.provider === 'experientiallabs' &&
        offering.category === 'chat' &&
        offering.identityStatus === 'exact' &&
        offering.quotaProbeProtocol === 'chat' &&
        offering.providerModelId !== null,
    )
    .map(([key, offering]) => ({ key, offering, promotional: false }));
}

export async function loadExperientialFreeOfferings(
  config: ExperientialFreeConfiguration,
): Promise<ExperientialFreeOffering[] | null> {
  const promotionsUrl = new URL('/api/models', config.baseUrl);
  promotionsUrl.searchParams.set('sort', 'preferred');
  promotionsUrl.searchParams.set('limit', '100');
  const grantsUrl = new URL('/api/v1/models', config.baseUrl);
  let promotionsResponse: Response;
  let grantsResponse: Response;
  try {
    [promotionsResponse, grantsResponse] = await Promise.all([
      fetch(promotionsUrl, { cache: 'no-store', signal: AbortSignal.timeout(6000) }),
      fetch(grantsUrl, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      }),
    ]);
  } catch {
    return null;
  }
  if (!promotionsResponse.ok || !grantsResponse.ok) return null;
  const promotionsBody: unknown = await promotionsResponse.json().catch(() => null);
  const grantsBody: unknown = await grantsResponse.json().catch(() => null);
  if (!promotionsBody || typeof promotionsBody !== 'object') return null;
  if (!grantsBody || typeof grantsBody !== 'object') return null;
  const promotions = (promotionsBody as { promotions?: unknown }).promotions;
  const grants = (grantsBody as { data?: unknown }).data;
  if (!Array.isArray(promotions) || !Array.isArray(grants)) return null;
  const grantedFreeSlugs = new Set(
    grants.flatMap((candidate: unknown) => {
      if (!candidate || typeof candidate !== 'object') return [];
      const { id, canonical_slug: slug } = candidate as {
        id?: unknown;
        canonical_slug?: unknown;
      };
      return typeof id === 'string' && id.endsWith(':free') && typeof slug === 'string'
        ? [slug]
        : [];
    }),
  );
  return configuredExperientialFreeOfferings().map((entry) => ({
    ...entry,
    promotional:
      grantedFreeSlugs.has(entry.offering.providerModelId!) &&
      promotions.some((candidate: unknown) => {
        if (!candidate || typeof candidate !== 'object') return false;
        const { free, slugs } = candidate as Promotion;
        return (
          free === true && Array.isArray(slugs) && slugs.includes(entry.offering.providerModelId)
        );
      }),
  }));
}
