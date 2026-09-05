import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { ADAPTER_PROVIDERS } from './adapter-providers';
import { dispatchProviderForRoute } from '@/lib/services/aggregator-routing';
import { admittedHarnessIds } from '@/lib/services/gateway-routing';

const LEVELS_FROM_THIS_FILE_TO_REPO_ROOT = 9;
const MANAGED_CLOUD_TRUST_MODE = 'managed_cloud';
const CHAT_DISPATCH_API_FAMILIES: ReadonlySet<string> = new Set([
  'chat_completions',
  'responses',
  'messages',
  'generate_content',
]);

interface RegistryRoute {
  provider: string;
  harnessId: string;
  trustModes: readonly string[];
}

interface RegistryHarness {
  apiFamily: string;
  protocol: string;
  gatewayId?: string;
}

interface CompiledRegistry {
  routes: Record<string, RegistryRoute>;
  harnesses: Record<string, RegistryHarness>;
}

function repoRootFromHere(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let level = 0; level < LEVELS_FROM_THIS_FILE_TO_REPO_ROOT; level += 1) {
    dir = dirname(dir);
  }
  return dir;
}

function readCompiledRegistry(): CompiledRegistry {
  const registryPath = join(
    repoRootFromHere(),
    'packages',
    'ai',
    'model-registry',
    'generated',
    'registry.json',
  );
  return JSON.parse(readFileSync(registryPath, 'utf8')) as CompiledRegistry;
}

function isChatDispatchRoute(
  route: RegistryRoute,
  harnesses: Record<string, RegistryHarness>,
): boolean {
  const apiFamily = harnesses[route.harnessId]?.apiFamily;
  return apiFamily !== undefined && CHAT_DISPATCH_API_FAMILIES.has(apiFamily);
}

const PROVIDER_NATIVE_PROTOCOL = 'provider_native';
const GATEWAY_FLAG_ENV = 'AGI_ROUTING_GATEWAY_ROUTES';
const GATEWAY_FLAG_ON = '1';

function isGatewayRoute(route: RegistryRoute, harnesses: Record<string, RegistryHarness>): boolean {
  return harnesses[route.harnessId]?.gatewayId !== undefined;
}

function isProtocolRoute(
  route: RegistryRoute,
  harnesses: Record<string, RegistryHarness>,
): boolean {
  const protocol = harnesses[route.harnessId]?.protocol;
  return protocol !== undefined && protocol !== PROVIDER_NATIVE_PROTOCOL;
}

describe('ADAPTER_PROVIDERS registry coverage', () => {
  afterEach(() => {
    delete process.env[GATEWAY_FLAG_ENV];
  });

  it('dispatches every managed-cloud chat route the compiled registry declares', () => {
    const registry = readCompiledRegistry();

    const uncoveredProviders = Object.entries(registry.routes)
      .filter(([, route]) => route.trustModes.includes(MANAGED_CLOUD_TRUST_MODE))
      .filter(([, route]) => isChatDispatchRoute(route, registry.harnesses))
      .filter(([, route]) => !isGatewayRoute(route, registry.harnesses))
      .map(([routeId, route]) => ({
        routeId,
        provider: dispatchProviderForRoute(routeId) ?? route.provider,
      }))
      .filter(({ provider }) => !ADAPTER_PROVIDERS[provider]);

    expect(uncoveredProviders).toEqual([]);
  });

  it('dispatches every route the registry describes by protocol rather than by package', () => {
    const registry = readCompiledRegistry();

    const protocolRoutes = Object.entries(registry.routes)
      .filter(([, route]) => isProtocolRoute(route, registry.harnesses))
      .filter(([, route]) => !isGatewayRoute(route, registry.harnesses));

    expect(protocolRoutes.length).toBeGreaterThan(0);
    expect(
      protocolRoutes
        .map(([routeId, route]) => ({
          routeId,
          provider: dispatchProviderForRoute(routeId) ?? route.provider,
        }))
        .filter(({ provider }) => !ADAPTER_PROVIDERS[provider]),
    ).toEqual([]);
  });

  it('refuses at admission every gateway route it has no adapter entry for', () => {
    const registry = readCompiledRegistry();
    const gatewayRoutes = Object.entries(registry.routes).filter(([, route]) =>
      isGatewayRoute(route, registry.harnesses),
    );
    const admitted = admittedHarnessIds();

    expect(gatewayRoutes.length).toBeGreaterThan(0);
    expect(admitted).toBeDefined();
    for (const [routeId, route] of gatewayRoutes) {
      const provider = dispatchProviderForRoute(routeId) ?? route.provider;
      expect(ADAPTER_PROVIDERS[provider]).toBeUndefined();
      expect(admitted).not.toContain(route.harnessId);
    }
  });

  it('stops narrowing the admitted harnesses once the flag is on', () => {
    process.env[GATEWAY_FLAG_ENV] = GATEWAY_FLAG_ON;

    expect(admittedHarnessIds()).toBeUndefined();
  });
});
