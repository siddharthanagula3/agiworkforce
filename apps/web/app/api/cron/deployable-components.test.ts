import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { JOB_QUEUE_POLICIES } from '@/lib/jobs/job-queues';

const cronRoot = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(cronRoot, 'deployable-components.json');
const vercelConfigPath = resolve(cronRoot, '../../../../../vercel.json');

const SEMVER = /^\d+\.\d+\.\d+$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const RECOVERIES = ['next-tick', 'lease-expiry'] as const;

type Recovery = (typeof RECOVERIES)[number];

interface ChangelogEntry {
  version: string;
  date: string;
  change: string;
}

interface Component {
  name: string;
  role: string;
  version: string;
  produces: string[];
  consumes: string[];
  inFlightWork: { holds: string; recovery: Recovery };
  changelog: ChangelogEntry[];
}

interface Registry {
  workerCategories: Record<string, { role: string; note: string }>;
  components: Component[];
}

const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as Registry;

function routeDirectories(): string[] {
  return readdirSync(cronRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => readdirSync(resolve(cronRoot, entry.name)).includes('route.ts'))
    .map((entry) => entry.name)
    .sort();
}

function scheduledPaths(): string[] {
  const config = JSON.parse(readFileSync(vercelConfigPath, 'utf8')) as {
    crons?: Array<{ path: string }>;
  };
  return (config.crons ?? []).map((cron) => cron.path).sort();
}

const names = registry.components.map((component) => component.name).sort();
const queues = new Set(Object.keys(JOB_QUEUE_POLICIES));

describe('deployable component registry', () => {
  it('registers every cron route and nothing that is not one', () => {
    expect(names).toEqual(routeDirectories());
  });

  it('registers a component for every scheduled path', () => {
    expect(names.map((name) => `/api/cron/${name}`)).toEqual(scheduledPaths());
  });

  it('gives every component a semantic version whose changelog ends at it', () => {
    for (const component of registry.components) {
      expect(component.version, component.name).toMatch(SEMVER);
      expect(component.changelog.length, component.name).toBeGreaterThan(0);
      expect(component.changelog[0]?.version, component.name).toBe(component.version);
      for (const entry of component.changelog) {
        expect(entry.version, component.name).toMatch(SEMVER);
        expect(entry.date, component.name).toMatch(ISO_DATE);
        expect(entry.change.trim().length, component.name).toBeGreaterThan(0);
      }
    }
  });

  it('orders every changelog newest first', () => {
    const rank = (version: string): number => {
      const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
      return major * 1_000_000 + minor * 1_000 + patch;
    };
    for (const component of registry.components) {
      const ranks = component.changelog.map((entry) => rank(entry.version));
      expect(ranks, component.name).toEqual([...ranks].sort((a, b) => b - a));
      expect(new Set(ranks).size, component.name).toBe(ranks.length);
    }
  });

  it('names only queues the job-queue policy defines', () => {
    for (const component of registry.components) {
      for (const queue of [...component.produces, ...component.consumes]) {
        expect(queues, `${component.name} names queue ${queue}`).toContain(queue);
      }
    }
  });

  it('answers what happens to the work each component holds when a deployment replaces it', () => {
    for (const component of registry.components) {
      expect(component.inFlightWork.holds.trim().length, component.name).toBeGreaterThan(0);
      expect(RECOVERIES, component.name).toContain(component.inFlightWork.recovery);
    }
  });

  it('claims a lease only where the component claims from a queue, and always where it does', () => {
    for (const component of registry.components) {
      const claims = component.consumes.length > 0;
      expect(component.inFlightWork.recovery === 'lease-expiry', component.name).toBe(claims);
    }
  });

  it('bounds how long a component can hold a claim by making it declare a maxDuration', () => {
    const claiming = registry.components.filter(
      (component) => component.inFlightWork.recovery === 'lease-expiry',
    );
    expect(claiming.length).toBeGreaterThan(0);
    for (const component of claiming) {
      const source = readFileSync(resolve(cronRoot, component.name, 'route.ts'), 'utf8');
      expect(source, component.name).toMatch(/export const maxDuration = \d/u);
    }
  });

  it('accounts for every audited worker category with a role that has a component', () => {
    const roles = new Set(registry.components.map((component) => component.role));
    for (const [category, { role, note }] of Object.entries(registry.workerCategories)) {
      expect(note.trim().length, category).toBeGreaterThan(0);
      expect(roles, `category ${category} claims role ${role}`).toContain(role);
    }
  });

  it('gives every component a role some category accounts for', () => {
    const accounted = new Set(
      Object.values(registry.workerCategories).map((category) => category.role),
    );
    for (const component of registry.components) {
      expect(accounted, `${component.name} has role ${component.role}`).toContain(component.role);
    }
  });
});
