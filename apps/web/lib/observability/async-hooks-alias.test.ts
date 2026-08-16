// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { NextConfig } from 'next';
import nextConfig from '../../next.config';

const PHASE_PRODUCTION_BUILD = 'phase-production-build';

type NextConfigFn = (
  phase: string,
  context: { defaultConfig: NextConfig },
) => NextConfig | Promise<NextConfig>;

async function resolveNextConfig(): Promise<NextConfig> {
  const exported = nextConfig as unknown as NextConfig | NextConfigFn;
  if (typeof exported === 'function') {
    return await exported(PHASE_PRODUCTION_BUILD, { defaultConfig: {} });
  }
  return exported;
}

describe('node:async_hooks resolveAlias', () => {
  it('maps only the browser condition, so server and edge get the real builtin', async () => {
    const config = await resolveNextConfig();
    const alias = config.turbopack?.resolveAlias?.['node:async_hooks'];

    expect(alias, 'the stub is still needed by client chunks').toBeDefined();
    expect(typeof alias).toBe('object');
    expect(Object.keys(alias as Record<string, string>)).toEqual(['browser']);
    expect((alias as Record<string, string>)['browser']).toBe('./shared/lib/async-hooks-stub.ts');
  }, 60_000);
});
