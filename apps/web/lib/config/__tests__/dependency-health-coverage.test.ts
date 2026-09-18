import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_DEPENDENCIES,
  PROBE_SURFACES,
  resolveDependencyReadiness,
  unreadyCoreDependencies,
} from '../dependency-readiness';

const PLATFORM_ROOT = resolve(__dirname, '../../../../../packages/platform');
const APP_ROOT = resolve(__dirname, '../../..');

// Packages with no deployment-side dependency of their own: they are pure
// libraries, so there is nothing for a readiness probe to reach.
const PURE_LIBRARIES = new Set(['utils']);

function platformPackages(): readonly string[] {
  return readdirSync(PLATFORM_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe('dependency health coverage', () => {
  it('has an inventory entry for every platform adapter package', () => {
    const owned = new Set(
      PRODUCTION_DEPENDENCIES.map((dependency) => dependency.owner).filter(
        (owner): owner is string => owner !== null,
      ),
    );
    const uncovered = platformPackages().filter(
      (name) => !PURE_LIBRARIES.has(name) && !owned.has(name),
    );

    expect(uncovered, 'a new platform package needs a readiness entry').toEqual([]);
  });

  it('gives every dependency either a live probe or a stated reason there is none', () => {
    for (const dependency of PRODUCTION_DEPENDENCIES) {
      if (dependency.liveProbe === null) {
        expect(dependency.liveProbeGap?.trim().length, dependency.id).toBeGreaterThan(0);
        continue;
      }
      expect(PROBE_SURFACES, dependency.id).toContain(dependency.liveProbe);
    }
  });

  it('names probe surfaces that exist as routes in this app', () => {
    for (const surface of PROBE_SURFACES) {
      expect(existsSync(resolve(APP_ROOT, 'app', surface, 'route.ts')), surface).toBe(true);
    }
  });

  it('gives every dependency a distinct id and a criticality', () => {
    const ids = PRODUCTION_DEPENDENCIES.map((dependency) => dependency.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const dependency of PRODUCTION_DEPENDENCIES) {
      expect(['core', 'degradable', 'optional'], dependency.id).toContain(dependency.criticality);
    }
  });

  it('reads readiness from configuration rather than assuming it', () => {
    const configured = resolveDependencyReadiness({
      DATABASE_URL: 'postgres://example',
      KV_REST_API_URL: 'https://kv.example',
      KV_REST_API_TOKEN: 'token',
    });

    expect(configured.find((state) => state.dependency.id === 'database')?.ready).toBe(true);
    expect(configured.find((state) => state.dependency.id === 'key_value')?.ready).toBe(true);
    expect(configured.find((state) => state.dependency.id === 'identity')?.ready).toBe(false);
  });

  it('separates a core dependency that is unconfigured from an optional one', () => {
    const unready = unreadyCoreDependencies({}).map((state) => state.dependency.id);

    expect(unready).toContain('database');
    expect(unready).toContain('identity');
    expect(unready).not.toContain('code_execution');
  });
});
