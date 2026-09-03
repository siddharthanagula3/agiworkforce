import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { ADAPTER_PROVIDERS } from './adapter-providers';

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

describe('ADAPTER_PROVIDERS registry coverage', () => {
  it('dispatches every managed-cloud chat route the compiled registry declares', () => {
    const registry = readCompiledRegistry();

    const uncoveredProviders = Object.entries(registry.routes)
      .filter(([, route]) => route.trustModes.includes(MANAGED_CLOUD_TRUST_MODE))
      .filter(([, route]) => isChatDispatchRoute(route, registry.harnesses))
      .map(([routeId, route]) => ({ routeId, provider: route.provider }))
      .filter(({ provider }) => !ADAPTER_PROVIDERS[provider]);

    expect(uncoveredProviders).toEqual([]);
  });
});
