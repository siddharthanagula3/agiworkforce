import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, posix, sep } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  EEA_COUNTRY_CODES,
  decideEuAccess,
  euBlockEnabled,
  isServerToServerRoute,
} from '../eu-access';

describe('euBlockEnabled', () => {
  it('is off unless explicitly switched on', () => {
    expect(euBlockEnabled({})).toBe(false);
    expect(euBlockEnabled({ AGI_BLOCK_EEA_TRAFFIC: '' })).toBe(false);
    expect(euBlockEnabled({ AGI_BLOCK_EEA_TRAFFIC: 'maybe' })).toBe(false);
  });

  it('accepts the documented truthy and falsy spellings', () => {
    for (const on of ['1', 'true', 'TRUE', 'on']) {
      expect(euBlockEnabled({ AGI_BLOCK_EEA_TRAFFIC: on })).toBe(true);
    }
    for (const off of ['0', 'false', 'off']) {
      expect(euBlockEnabled({ AGI_BLOCK_EEA_TRAFFIC: off })).toBe(false);
    }
  });
});

describe('decideEuAccess', () => {
  it('serves everyone while the block is off, EEA included', () => {
    expect(decideEuAccess('DE', false)).toEqual({ blocked: false });
    expect(decideEuAccess('FR', false)).toEqual({ blocked: false });
  });

  it('refuses every EEA country when the block is on', () => {
    for (const code of EEA_COUNTRY_CODES) {
      expect(decideEuAccess(code, true)).toEqual({ blocked: true, country: code });
    }
  });

  it('serves non-EEA countries when the block is on', () => {
    for (const code of ['US', 'IN', 'GB', 'CA', 'AU', 'BR', 'CH', 'JP']) {
      expect(decideEuAccess(code, true)).toEqual({ blocked: false });
    }
  });

  it('does not block when the country header is absent or unreadable', () => {
    expect(decideEuAccess(null, true)).toEqual({ blocked: false });
    expect(decideEuAccess(undefined, true)).toEqual({ blocked: false });
    expect(decideEuAccess('  ', true)).toEqual({ blocked: false });
  });

  it('matches the header case-insensitively', () => {
    expect(decideEuAccess('de', true)).toEqual({ blocked: true, country: 'DE' });
    expect(decideEuAccess(' fr ', true)).toEqual({ blocked: true, country: 'FR' });
  });

  it('excludes the UK and Switzerland, which are not EEA', () => {
    expect(decideEuAccess('GB', true)).toEqual({ blocked: false });
    expect(decideEuAccess('CH', true)).toEqual({ blocked: false });
  });
});

describe('isServerToServerRoute', () => {
  const apiRoutes = readdirSync(join(process.cwd(), 'app', 'api'), {
    recursive: true,
    encoding: 'utf8',
  })
    .filter((entry) => basename(entry) === 'route.ts')
    .map((entry) => ({
      file: join('app', 'api', entry),
      path: posix.join('/api', dirname(entry).split(sep).join('/')),
    }));
  const admitted = apiRoutes.filter((route) =>
    isServerToServerRoute(route.path.replace(/\[[^\]]+\]/gu, 'segment')),
  );

  it('reads the whole api route tree rather than an empty directory', () => {
    expect(apiRoutes.length).toBeGreaterThan(200);
  });

  it('admits the signed webhook receivers and no other route outside cron', () => {
    expect(
      admitted
        .filter((route) => !route.path.startsWith('/api/cron/'))
        .map((route) => route.path)
        .sort(),
    ).toEqual([
      '/api/github/webhook',
      '/api/webhooks/connectors/[triggerId]',
      '/api/webhooks/gmail',
      '/api/webhooks/google-calendar',
      '/api/webhooks/slack',
    ]);
  });

  it('admits a cron job only when its handler refuses a caller without CRON_SECRET', () => {
    const crons = admitted.filter((route) => route.path.startsWith('/api/cron/'));

    expect(crons.length).toBeGreaterThan(0);
    for (const cron of crons) {
      expect(readFileSync(join(process.cwd(), cron.file), 'utf8'), cron.file).toMatch(
        /if \(!verifyCronRequest\(request\)\)/u,
      );
    }
  });
});
