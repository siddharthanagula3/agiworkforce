// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { statSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from 'next/constants';

import { BOT_PROTECTION_ENV_VAR, BOT_PROTECTION_MODES } from '../bot-protection';

const BOTID_CHALLENGE_SOURCE =
  '/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/a-4-a/c.js';
const BOTID_PROXY_SOURCE =
  '/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/:path*';
const API_HOST = 'api.agiworkforce.com';
const STANDALONE_ENV_VAR = 'AGI_WEB_STANDALONE';

type NextConfigFn = (
  phase: string,
  context: { defaultConfig: NextConfig },
) => NextConfig | Promise<NextConfig>;

type ResolvedRewrites = Awaited<ReturnType<NonNullable<NextConfig['rewrites']>>>;
type RewriteRule = Extract<ResolvedRewrites, unknown[]>[number];

async function loadNextConfig(phase: string = PHASE_PRODUCTION_BUILD): Promise<NextConfig> {
  vi.resetModules();
  const imported = (await import('../../../next.config')) as {
    default: NextConfig | NextConfigFn;
  };
  const exported = imported.default;
  if (typeof exported === 'function') {
    return await exported(phase, { defaultConfig: {} });
  }
  return exported;
}

async function loadRewrites(): Promise<RewriteRule[]> {
  const config = await loadNextConfig();
  const rewrites = await config.rewrites!();
  if (Array.isArray(rewrites)) return rewrites;
  return [
    ...(rewrites.beforeFiles ?? []),
    ...(rewrites.afterFiles ?? []),
    ...(rewrites.fallback ?? []),
  ];
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('botid rewrites in next.config', () => {
  it('serves the classification script and proxy same-origin', async () => {
    vi.stubEnv(BOT_PROTECTION_ENV_VAR, BOT_PROTECTION_MODES.platform);
    const rewrites = await loadRewrites();

    expect(rewrites.map((rule) => rule.source)).toEqual(
      expect.arrayContaining([BOTID_CHALLENGE_SOURCE, BOTID_PROXY_SOURCE]),
    );
  }, 60_000);

  it('keeps the api-host rewrites the app already relied on', async () => {
    vi.stubEnv(BOT_PROTECTION_ENV_VAR, BOT_PROTECTION_MODES.platform);
    const rewrites = await loadRewrites();

    expect(
      rewrites.some((rule) =>
        (rule.has ?? []).some(
          (condition) => condition.type === 'host' && condition.value === API_HOST,
        ),
      ),
    ).toBe(true);
  }, 60_000);

  it('frames the botid path as same-origin without loosening the global deny', async () => {
    vi.stubEnv(BOT_PROTECTION_ENV_VAR, BOT_PROTECTION_MODES.platform);
    const config = await loadNextConfig();
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

  it('drops the platform bot-protection wiring when the flag is off', async () => {
    vi.stubEnv(BOT_PROTECTION_ENV_VAR, BOT_PROTECTION_MODES.off);
    const rewrites = await loadRewrites();

    expect(rewrites.map((rule) => rule.source)).not.toEqual(
      expect.arrayContaining([BOTID_CHALLENGE_SOURCE, BOTID_PROXY_SOURCE]),
    );
    expect(
      rewrites.some((rule) =>
        (rule.has ?? []).some(
          (condition) => condition.type === 'host' && condition.value === API_HOST,
        ),
      ),
    ).toBe(true);
  }, 60_000);
});

describe('standalone output in next.config', () => {
  it('does not regenerate the frozen legal artifact when starting production', async () => {
    const artifact = path.resolve(__dirname, '../../legal/route-isolation.generated.json');
    const before = statSync(artifact, { bigint: true }).mtimeNs;
    const config = await loadNextConfig(PHASE_PRODUCTION_SERVER);

    expect(config.outputFileTracingRoot).toBeTruthy();
    expect(statSync(artifact, { bigint: true }).mtimeNs).toBe(before);
  }, 60_000);

  it('leaves the hosted build untouched unless the drill asks for it', async () => {
    vi.stubEnv(STANDALONE_ENV_VAR, '');
    const config = await loadNextConfig();

    expect(config.output).toBeUndefined();
  }, 60_000);

  it('emits a self-contained server when the drill asks for it', async () => {
    vi.stubEnv(STANDALONE_ENV_VAR, '1');
    const config = await loadNextConfig();

    expect(config.output).toBe('standalone');
  }, 60_000);
});
