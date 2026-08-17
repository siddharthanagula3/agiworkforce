import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const cronRoot = dirname(fileURLToPath(import.meta.url));
const vercelConfigPath = resolve(cronRoot, '../../../../../vercel.json');

const CRON_FIELD_COUNT = 5;

function registeredCrons(): Array<{ path: string; schedule: string }> {
  const config = JSON.parse(readFileSync(vercelConfigPath, 'utf8')) as {
    crons?: Array<{ path: string; schedule: string }>;
  };
  return config.crons ?? [];
}

function routeDirectories(): string[] {
  return readdirSync(cronRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => readdirSync(resolve(cronRoot, entry.name)).includes('route.ts'))
    .map((entry) => entry.name)
    .sort();
}

describe('cron route registration', () => {
  it('finds cron routes to check', () => {
    expect(routeDirectories().length).toBeGreaterThan(0);
  });

  it('registers every cron route in vercel.json so it actually runs', () => {
    const scheduled = new Set(registeredCrons().map((cron) => cron.path));
    const unscheduled = routeDirectories().filter((name) => !scheduled.has(`/api/cron/${name}`));

    expect(unscheduled).toEqual([]);
  });

  it('points every vercel.json cron at a route that exists', () => {
    const directories = new Set(routeDirectories());
    const dangling = registeredCrons()
      .map((cron) => cron.path)
      .filter((path) => !directories.has(path.replace('/api/cron/', '')));

    expect(dangling).toEqual([]);
  });

  it('schedules each cron exactly once with a five-field expression', () => {
    const crons = registeredCrons();

    expect(new Set(crons.map((cron) => cron.path)).size).toBe(crons.length);
    for (const cron of crons) {
      expect(cron.schedule.trim().split(/\s+/u)).toHaveLength(CRON_FIELD_COUNT);
    }
  });
});
