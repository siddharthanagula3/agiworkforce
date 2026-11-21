// @vitest-environment node

import { expect, it, vi } from 'vitest';
import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

type NextConfigFn = (
  phase: string,
  context: { defaultConfig: NextConfig },
) => NextConfig | Promise<NextConfig>;

const RETIRED_HOST = 'chat.agiworkforce.com';

async function loadRedirects() {
  vi.resetModules();
  const imported = (await import('../next.config')) as { default: NextConfig | NextConfigFn };
  const exported = imported.default;
  const config =
    typeof exported === 'function'
      ? await exported(PHASE_PRODUCTION_BUILD, { defaultConfig: {} })
      : exported;
  return config.redirects!();
}

it('forwards the retired chat host to the app origin before any other redirect', async () => {
  const redirects = await loadRedirects();

  expect(redirects[0]).toEqual({
    source: '/:path*',
    has: [{ type: 'host', value: RETIRED_HOST }],
    destination: 'https://agiworkforce.com/:path*',
    permanent: true,
  });
}, 60_000);
