import 'server-only';

import { getOptionalEnv } from '@shared/utils/env';
import { validateBaseUrl } from '@agiworkforce/provider-runtime';
import { createGatewayAdapter } from '@agiworkforce/providers-factory';
import {
  GATEWAY_BACKED_HARNESS_IDS,
  listGatewayRoutes,
  REGISTRY_HARNESS_IDS,
} from '@agiworkforce/types';
import type { GatewayHarness, ProviderAdapter } from '@agiworkforce/types';

export const GATEWAY_ROUTES_ENV = 'AGI_ROUTING_GATEWAY_ROUTES';
const GATEWAY_ROUTES_ENABLED_VALUE = '1';

const GATEWAY_ROUTE_HARNESSES: ReadonlyMap<string, GatewayHarness> = (() => {
  const byProvider = new Map<string, GatewayHarness>();
  for (const route of listGatewayRoutes()) {
    const existing = byProvider.get(route.provider);
    if (existing && existing.harnessId !== route.harnessId) {
      throw new Error(
        `Provider "${route.provider}" declares two gateway harnesses (${existing.harnessId}, ${route.harnessId})`,
      );
    }
    byProvider.set(route.provider, route);
  }
  return byProvider;
})();

const GATEWAY_ROUTE_PROVIDER_IDS: readonly string[] = [...GATEWAY_ROUTE_HARNESSES.keys()];

const NON_GATEWAY_HARNESS_IDS: readonly string[] = (() => {
  const gatewayBacked = new Set(GATEWAY_BACKED_HARNESS_IDS);
  return REGISTRY_HARNESS_IDS.filter((harnessId) => !gatewayBacked.has(harnessId));
})();

export function gatewayRoutesEnabled(): boolean {
  return getOptionalEnv(GATEWAY_ROUTES_ENV) === GATEWAY_ROUTES_ENABLED_VALUE;
}

export function hasGatewayRouteCredentials(providerId: string): boolean {
  const harness = GATEWAY_ROUTE_HARNESSES.get(providerId);
  if (!harness) return false;
  const { baseUrlEnv, apiKeyEnv } = harness.gateway;
  return Boolean(getOptionalEnv(baseUrlEnv)) && Boolean(getOptionalEnv(apiKeyEnv));
}

export function listCredentialedGatewayProviderIds(): readonly string[] {
  return GATEWAY_ROUTE_PROVIDER_IDS.filter((providerId) => hasGatewayRouteCredentials(providerId));
}

export function admittedHarnessIds(): readonly string[] | undefined {
  return gatewayRoutesEnabled() ? undefined : NON_GATEWAY_HARNESS_IDS;
}

export function buildGatewayRouteAdapter(providerId: string): ProviderAdapter {
  const harness = GATEWAY_ROUTE_HARNESSES.get(providerId);
  if (!harness) {
    throw new Error(`Provider "${providerId}" declares no gateway route.`);
  }
  if (!gatewayRoutesEnabled()) {
    throw new Error(
      `Provider "${providerId}" routes through a gateway definition, which is off. ` +
        `Set ${GATEWAY_ROUTES_ENV} to enable it.`,
    );
  }
  const { gateway } = harness;
  const baseUrl = getOptionalEnv(gateway.baseUrlEnv);
  if (!baseUrl) {
    throw new Error(
      `Gateway "${gateway.id}" is not configured. ` +
        `Please ensure the ${gateway.baseUrlEnv} environment variable is set.`,
    );
  }
  const validated = validateBaseUrl(baseUrl, { allowedHosts: [gateway.host] });
  if (!validated.ok) {
    throw new Error(
      `Gateway "${gateway.id}" resolved ${gateway.baseUrlEnv} to host ` +
        `${validated.hostname ?? 'an unparseable URL'}, which is not the ${gateway.host} ` +
        `the registry declares for it (${validated.reason}).`,
    );
  }
  return createGatewayAdapter(gateway, { ...process.env, [gateway.baseUrlEnv]: validated.url });
}
