// @vitest-environment node
/**
 * The `node:async_hooks` Turbopack alias must stay browser-only.
 *
 * `trace-context.ts` binds a module-scope `AsyncLocalStorage`, and every span
 * and every `trace_id` log field in this app depends on it isolating one
 * request's context from another's. `next.config.ts` aliases `node:async_hooks`
 * to `shared/lib/async-hooks-stub.ts`, whose store is a single plain instance
 * field with no async isolation at all. That alias used to carry a `default:`
 * condition, which Turbopack also applies to the server compilation, so the
 * built server ran on the stub: context died at the first `await`, and one slot
 * was shared by every request handled by the same instance (Fluid Compute
 * reuses instances across concurrent invocations).
 *
 * Vitest cannot see that — it runs on real Node with no alias — so a unit test
 * of `trace-context.ts` passes either way. This asserts the configuration
 * instead, reading the object Next.js itself consumes: the default export is
 * the plugin-composed config function, so it is invoked exactly as Next invokes
 * it. Re-adding a server-side condition fails here instead of failing silently
 * in production. The build output remains the real proof; this is the tripwire.
 *
 * Runs in the `node` environment because the workflow plugin's config function
 * uses esbuild, which refuses to run under jsdom's TextEncoder.
 */

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
  // Resolving the config runs the workflow plugin, which shells out to esbuild
  // (~1s idle). The default 5s budget goes red on a loaded machine, so this is
  // generous on purpose: a timeout here would be noise, not a signal.
  it('maps only the browser condition, so server and edge get the real builtin', async () => {
    const config = await resolveNextConfig();
    const alias = config.turbopack?.resolveAlias?.['node:async_hooks'];

    expect(alias, 'the stub is still needed by client chunks').toBeDefined();
    expect(typeof alias).toBe('object');
    expect(Object.keys(alias as Record<string, string>)).toEqual(['browser']);
    expect((alias as Record<string, string>)['browser']).toBe('./shared/lib/async-hooks-stub.ts');
  }, 60_000);
});
