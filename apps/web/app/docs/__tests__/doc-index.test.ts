import { describe, expect, it } from 'vitest';

import { documentationIndex } from '../doc-index';

describe('documentation index', () => {
  const index = documentationIndex();

  it('lists every help-centre document exactly once', () => {
    const ids = index.groups.flatMap((group) => group.entries.map((entry) => entry.docId));
    expect(ids.length).toBe(index.documentCount);
    expect(new Set(ids).size).toBe(ids.length);
    expect(index.documentCount).toBeGreaterThan(0);
  });

  it('carries applicability and an update date on every row', () => {
    for (const group of index.groups) {
      for (const entry of group.entries) {
        expect(entry.metadata, entry.docId).not.toBeNull();
        expect(entry.updated, entry.docId).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(entry.href.startsWith('/'), entry.docId).toBe(true);
      }
    }
  });

  it('reports the newest update date across the whole index', () => {
    const dates = index.groups.flatMap((group) => group.entries.map((entry) => entry.updated));
    expect(index.newestUpdate).toBe([...dates].sort().at(-1));
  });
});
