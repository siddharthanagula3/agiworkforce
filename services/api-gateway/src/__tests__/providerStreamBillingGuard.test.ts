/**
 * GATEWAY-PROVIDER-STREAM-UNMETERED-01 — fail-closed billing guard.
 *
 * `/api/v1/providers/:providerId/stream` calls real, paid providers but runs
 * NO usage accounting: unlike `routes/llm.ts` it never parses
 * `Idempotency-Key` and never performs the managed-usage reserve → settle
 * cycle. A turn served there costs provider money and is counted against
 * nothing. The route is therefore disabled unless an operator explicitly opts
 * in, and these tests lock that in so the guard cannot be dropped silently.
 *
 * Static source assertions rather than a booted app: exercising the route for
 * real needs provider credentials and live sockets (see
 * providerStream.live.test.ts, which is skipped without them). The invariants
 * that matter here are structural — the guard exists, it runs before any
 * provider work, and the route still does no metering.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(new URL('../routes/providerStream.ts', import.meta.url), 'utf8');
const meteredSource = readFileSync(new URL('../routes/llm.ts', import.meta.url), 'utf8');

describe('provider stream billing guard', () => {
  it('refuses to serve unless an operator explicitly opts in', () => {
    expect(routeSource).toContain('AGI_GATEWAY_PROVIDER_STREAM_UNMETERED');
    // Opt-in must be an exact '1', not any truthy value.
    expect(routeSource).toMatch(/process\.env\[PROVIDER_STREAM_UNMETERED_ENV\]\s*===\s*'1'/);
  });

  it('fails closed with a 503 rather than defaulting open', () => {
    expect(routeSource).toMatch(/throw new AppError\([\s\S]{0,300}?503,/);
    // The default path must be the throw, so an unset env denies.
    expect(routeSource).toMatch(/if \(providerStreamEnabled\(\)\) return;/);
  });

  it('checks the guard before touching a provider or credential', () => {
    const guardCall = routeSource.indexOf('requireProviderStreamEnabled();');
    const adapterBuild = routeSource.indexOf('buildProviderAdapter(providerId as ProviderId)');
    expect(guardCall).toBeGreaterThan(-1);
    expect(adapterBuild).toBeGreaterThan(-1);
    expect(guardCall).toBeLessThan(adapterBuild);
  });

  it('documents the metering gap it stands in for', () => {
    // The metered route does reserve/settle around provider calls...
    expect(meteredSource).toContain('parseManagedUsageIdempotencyKey');
    // ...and this route still does not. When that changes, this guard should
    // be removed in the SAME change, and this assertion is what will fail.
    expect(routeSource).not.toContain('parseManagedUsageIdempotencyKey');
  });
});
