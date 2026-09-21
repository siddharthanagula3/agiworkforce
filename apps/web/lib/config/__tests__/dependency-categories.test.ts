import { describe, expect, it } from 'vitest';

import {
  DEPENDENCY_CATEGORIES,
  PRODUCTION_DEPENDENCIES,
  uncategorizedDependencies,
  unknownCategoryDependencies,
} from '../dependency-readiness';

describe('every kind of third party this product can rest on is answered for', () => {
  it('names a distinct category once each, with no category left blank', () => {
    const names = DEPENDENCY_CATEGORIES.map((entry) => entry.category);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9_]*$/u);
  });

  it('answers each category with registered dependencies, or says why there are none', () => {
    const unanswered: string[] = [];
    for (const entry of DEPENDENCY_CATEGORIES) {
      if (entry.dependencies.length > 0) {
        if (entry.absent !== undefined) {
          unanswered.push(`${entry.category} both names dependencies and claims to have none`);
        }
        continue;
      }
      if ((entry.absent ?? '').trim().length <= 20) {
        unanswered.push(`${entry.category} has nothing behind it and no reason why`);
      }
    }
    expect(unanswered).toEqual([]);
  });

  it('only names dependencies the registry declares', () => {
    expect(unknownCategoryDependencies()).toEqual([]);
  });

  it('leaves no registered dependency outside every category', () => {
    expect(uncategorizedDependencies()).toEqual([]);
  });

  it('carries every field a reader needs on each dependency a category names', () => {
    const byId = new Map(PRODUCTION_DEPENDENCIES.map((entry) => [entry.id, entry]));
    const thin: string[] = [];

    for (const entry of DEPENDENCY_CATEGORIES) {
      for (const id of entry.dependencies) {
        const dependency = byId.get(id);
        if (!dependency) continue;
        const observed = dependency.liveProbe ?? dependency.liveProbeGap ?? '';
        if (observed.length === 0) thin.push(`${entry.category}/${id} says nothing about itself`);
        if (dependency.timeoutMs === null && dependency.retry !== 'none') {
          thin.push(`${entry.category}/${id} is retried with no bound on a call`);
        }
        if (dependency.replacement.trim().length <= 20) {
          thin.push(`${entry.category}/${id} names no way off it`);
        }
      }
    }

    expect(thin).toEqual([]);
  });
});
