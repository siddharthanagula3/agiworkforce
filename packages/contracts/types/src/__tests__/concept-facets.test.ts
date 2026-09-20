import { describe, expect, it } from 'vitest';

import {
  CONCEPT_REGISTRY,
  absentConceptFacets,
  conceptFacets,
  getConcept,
} from '../concept-registry';

const HIERARCHY = getConcept('workspace');

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
    const facets = conceptFacets('workspace');
    const declared = new Set((HIERARCHY.facetSubjects ?? []).map((subject) => subject.name));

    expect(facets.length).toBeGreaterThan(0);
    for (const subject of declared) {
      expect(facets.some((facet) => facet.subject === subject)).toBe(true);
    }
    for (const facet of facets) {
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
    const absent = absentConceptFacets('workspace');

    expect(absent.length).toBeGreaterThan(0);
    for (const facet of absent) {
      expect(facet.kind).toBe('absent');
      if (facet.kind !== 'absent') continue;
      expect(facet.source.instead.trim().length).toBeGreaterThan(20);
    }
  });

  it('records that a workspace has no membership and no resources of its own', () => {
    const absent = new Set(absentConceptFacets('workspace').map((facet) => facet.id));

    expect(absent.has('workspace-members-absent')).toBe(true);
    expect(absent.has('workspace-resources-absent')).toBe(true);
    expect(absent.has('membership-id-absent')).toBe(true);
  });
});
