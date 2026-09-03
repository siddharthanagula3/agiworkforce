// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { NextConfig } from 'next';

import nextConfig from '../../../next.config';

const PHASE_PRODUCTION_BUILD = 'phase-production-build';
const BOTID_CHALLENGE_SOURCE =
  '/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/a-4-a/c.js';
const BOTID_PROXY_SOURCE =
  '/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/:path*';
const API_HOST = 'api.agiworkforce.com';

type NextConfigFn = (
  phase: string,
  context: { defaultConfig: NextConfig },
) => NextConfig | Promise<NextConfig>;

type ResolvedRewrites = Awaited<ReturnType<NonNullable<NextConfig['rewrites']>>>;
type RewriteRule = Extract<ResolvedRewrites, unknown[]>[number];

async function resolveNextConfig(): Promise<NextConfig> {
  const exported = nextConfig as unknown as NextConfig | NextConfigFn;
  if (typeof exported === 'function') {
    return await exported(PHASE_PRODUCTION_BUILD, { defaultConfig: {} });
  }
  return exported;
}

async function resolveRewrites(): Promise<RewriteRule[]> {
  const config = await resolveNextConfig();
  const rewrites = await config.rewrites!();
  if (Array.isArray(rewrites)) return rewrites;
  return [
    ...(rewrites.beforeFiles ?? []),
    ...(rewrites.afterFiles ?? []),
    ...(rewrites.fallback ?? []),
  ];
}

describe('botid rewrites in next.config', () => {
  it('serves the classification script and proxy same-origin', async () => {
    const rewrites = await resolveRewrites();

    expect(rewrites.map((rule) => rule.source)).toEqual(
      expect.arrayContaining([BOTID_CHALLENGE_SOURCE, BOTID_PROXY_SOURCE]),
    );
  }, 60_000);

  it('keeps the api-host rewrites the app already relied on', async () => {
    const rewrites = await resolveRewrites();

    expect(rewrites.some((rule) => JSON.stringify(rule.has ?? []).includes(API_HOST))).toBe(true);
  }, 60_000);

  it('frames the botid path as same-origin without loosening the global deny', async () => {
    const config = await resolveNextConfig();
    const headers = await config.headers!();
    const botidHeaders = headers.find((entry) => entry.source === BOTID_PROXY_SOURCE);
    const globalHeaders = headers.find((entry) => entry.source === '/:path*');

    expect(botidHeaders?.headers).toEqual(
      expect.arrayContaining([{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }]),
    );
    expect(globalHeaders?.headers).toEqual(
      expect.arrayContaining([{ key: 'X-Frame-Options', value: 'DENY' }]),
    );
  }, 60_000);
});
