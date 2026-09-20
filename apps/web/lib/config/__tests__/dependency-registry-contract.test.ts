import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_DEPENDENCIES,
  PROBE_SURFACES,
  type ProductionDependency,
} from '../dependency-readiness';

const REGIONS = ['multi-region', 'home-region', 'operator-device'];
const DATA_CLASSES = ['customer-content', 'customer-metadata', 'operational', 'none'];
const RETRIES = ['shared-policy', 'vendor-client', 'none'];
const CRITICALITIES = ['core', 'degradable', 'optional'];
const LIFECYCLES = ['in-use', 'deprecated'];

const MAX_TIMEOUT_MS = 15 * 60 * 1000;

function prose(dependency: ProductionDependency, field: keyof ProductionDependency): string {
  return String(dependency[field] ?? '');
}

describe('the production dependency registry, entry by entry', () => {
  it('has entries to check, each with a distinct id', () => {
    expect(PRODUCTION_DEPENDENCIES.length).toBeGreaterThan(0);
    const ids = PRODUCTION_DEPENDENCIES.map((dependency) => dependency.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names an owner, or says the dependency is web-local rather than leaving it unsaid', () => {
    for (const dependency of PRODUCTION_DEPENDENCIES) {
      expect(dependency.owner === null || dependency.owner.length > 0, dependency.id).toBe(true);
      expect(dependency.label.trim().length, dependency.id).toBeGreaterThan(0);
    }
  });

  it('classifies every entry on the vocabularies the registry declares', () => {
    for (const dependency of PRODUCTION_DEPENDENCIES) {
      expect(CRITICALITIES, dependency.id).toContain(dependency.criticality);
      expect(REGIONS, dependency.id).toContain(dependency.region);
      expect(DATA_CLASSES, dependency.id).toContain(dependency.dataClass);
      expect(RETRIES, dependency.id).toContain(dependency.retry);
      expect(LIFECYCLES, dependency.id).toContain(dependency.lifecycle);
      expect(typeof dependency.circuitBreaker, dependency.id).toBe('boolean');
    }
  });

  it('bounds every call it can bound, and says who bounds the rest', () => {
    for (const dependency of PRODUCTION_DEPENDENCIES) {
      if (dependency.timeoutMs === null) {
        expect(dependency.retry, `${dependency.id} has no timeout, so nothing may retry it`).toBe(
          'none',
        );
        continue;
      }
      expect(dependency.timeoutMs, dependency.id).toBeGreaterThan(0);
      expect(dependency.timeoutMs, dependency.id).toBeLessThanOrEqual(MAX_TIMEOUT_MS);
    }
  });

  it('says what a reader gets while each dependency is down', () => {
    for (const dependency of PRODUCTION_DEPENDENCIES) {
      expect(prose(dependency, 'failureBehaviour').trim().length, dependency.id).toBeGreaterThan(
        20,
      );
      expect(prose(dependency, 'availability').trim().length, dependency.id).toBeGreaterThan(20);
    }
  });

  it('says how each one would be replaced, so no choice here is permanent', () => {
    for (const dependency of PRODUCTION_DEPENDENCIES) {
      expect(prose(dependency, 'replacement').trim().length, dependency.id).toBeGreaterThan(20);
    }
  });

  it('gives every entry a live probe, or the reason there is none', () => {
    for (const dependency of PRODUCTION_DEPENDENCIES) {
      if (dependency.liveProbe === null) {
        expect(dependency.liveProbeGap?.trim().length ?? 0, dependency.id).toBeGreaterThan(20);
        continue;
      }
      expect(PROBE_SURFACES, dependency.id).toContain(dependency.liveProbe);
      expect(dependency.liveProbeGap, dependency.id).toBeUndefined();
    }
  });

  it('gives a core dependency a probe or a stated reason it cannot have one', () => {
    for (const dependency of PRODUCTION_DEPENDENCIES) {
      if (dependency.criticality !== 'core') continue;
      const covered = dependency.liveProbe !== null || (dependency.liveProbeGap ?? '').length > 0;
      expect(covered, `${dependency.id} is core and reports nothing about itself`).toBe(true);
    }
  });

  it('requires configuration for anything reached over the network', () => {
    for (const dependency of PRODUCTION_DEPENDENCIES) {
      if (dependency.region === 'operator-device') continue;
      const reachesOut = dependency.timeoutMs !== null;
      if (!reachesOut) continue;
      expect(dependency.requires.length, `${dependency.id} is called out to`).toBeGreaterThan(0);
      for (const requirement of dependency.requires) {
        expect(requirement.keys.length, dependency.id).toBeGreaterThan(0);
        for (const key of requirement.keys) {
          expect(key, dependency.id).toMatch(/^[A-Z][A-Z0-9_]*$/u);
        }
      }
    }
  });

  it('keeps customer content out of any dependency that is not in the home region by accident', () => {
    for (const dependency of PRODUCTION_DEPENDENCIES) {
      if (dependency.dataClass !== 'customer-content') continue;
      if (dependency.region === 'home-region' || dependency.region === 'operator-device') continue;
      expect(
        prose(dependency, 'replacement').trim().length,
        `${dependency.id} carries customer content out of the home region, so its exit has to be stated`,
      ).toBeGreaterThan(20);
    }
  });
});
