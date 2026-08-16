
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routeSource = readFileSync(join(__dirname, '..', 'routes', 'providerStream.ts'), 'utf8');
const meteredSource = readFileSync(join(__dirname, '..', 'routes', 'llm.ts'), 'utf8');

describe('provider stream billing guard', () => {
  it('refuses to serve unless an operator explicitly opts in', () => {
    expect(routeSource).toContain('AGI_GATEWAY_PROVIDER_STREAM_UNMETERED');
    expect(routeSource).toMatch(/process\.env\[PROVIDER_STREAM_UNMETERED_ENV\]\s*===\s*'1'/);
  });

  it('fails closed with a 503 rather than defaulting open', () => {
    expect(routeSource).toMatch(/throw new AppError\([\s\S]{0,300}?503,/);
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
    expect(meteredSource).toContain('parseManagedUsageIdempotencyKey');
    expect(routeSource).not.toContain('parseManagedUsageIdempotencyKey');
  });
});
