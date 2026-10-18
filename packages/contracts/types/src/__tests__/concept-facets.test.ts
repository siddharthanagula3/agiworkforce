import { describe, expect, it } from 'vitest';

import { CONCEPT_REGISTRY, type ConceptFacet, type ConceptRecord } from '../concept-registry';

const HIERARCHY = CONCEPT_REGISTRY.concepts.find(
  (concept) => concept.name === 'workspace',
) as ConceptRecord;

const HIERARCHY_FACETS: readonly ConceptFacet[] = HIERARCHY.facets ?? [];

const HIERARCHY_ABSENT = HIERARCHY_FACETS.filter((facet) => facet.kind === 'absent');

describe('the hierarchy facet inventory', () => {
  it('covers organization, workspace and membership over the tables the concept owns', () => {
    const subjects = HIERARCHY.facetSubjects ?? [];

    expect(subjects.map((subject) => subject.name).sort()).toEqual([
      'membership',
      'organization',
      'workspace',
    ]);
    for (const subject of subjects) {
      expect(HIERARCHY.tables).toContain(subject.table);
      expect(subject.why.length).toBeGreaterThan(20);
    }
  });

  it('gives every subject facets and every facet a declared subject', () => {
    const declared = new Set((HIERARCHY.facetSubjects ?? []).map((subject) => subject.name));

    expect(HIERARCHY_FACETS.length).toBeGreaterThan(0);
    for (const subject of declared) {
      expect(HIERARCHY_FACETS.some((facet) => facet.subject === subject)).toBe(true);
    }
    for (const facet of HIERARCHY_FACETS) {
      expect(declared.has(facet.subject)).toBe(true);
      expect(facet.claim.length).toBeGreaterThan(20);
    }
  });

  it('identifies every facet uniquely across the registry', () => {
    const ids = CONCEPT_REGISTRY.concepts.flatMap((concept) =>
      (concept.facets ?? []).map((facet) => facet.id),
    );

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names what stands in for each facet the hierarchy does not have', () => {
    expect(HIERARCHY_ABSENT.length).toBeGreaterThan(0);
    for (const facet of HIERARCHY_ABSENT) {
      if (facet.kind !== 'absent') continue;
      expect(facet.source.instead.trim().length).toBeGreaterThan(20);
    }
  });

  it('records that a workspace has no membership and no resources of its own', () => {
    const absent = new Set(HIERARCHY_ABSENT.map((facet) => facet.id));

    expect(absent.has('workspace-members-absent')).toBe(true);
    expect(absent.has('workspace-resources-absent')).toBe(true);
    expect(absent.has('membership-id-absent')).toBe(true);
  });
});
