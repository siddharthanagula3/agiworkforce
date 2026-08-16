import {
  describeMemoryFreshness,
  summarizeMemoryFacts,
} from '../src/features/memory/services/consolidation';
import type { MemoryFact } from '../storage/types';

const DAY = 86_400_000;

function fact(overrides: Partial<MemoryFact> & Pick<MemoryFact, 'id' | 'fact'>): MemoryFact {
  return {
    source_conversation_id: null,
    pinned: false,
    created_at: 1_700_000_000_000,
    ...overrides,
  };
}

describe('summarizeMemoryFacts', () => {
  it('groups entries only by fields the store actually holds', () => {
    const summary = summarizeMemoryFacts([
      fact({ id: '1', fact: 'prefers rust', pinned: true, created_at: 300 }),
      fact({ id: '2', fact: 'lives in Berlin', source_conversation_id: 'conv-1', created_at: 200 }),
      fact({ id: '3', fact: 'allergic to peanuts', created_at: 100 }),
    ]);

    expect(summary.sections.map((section) => section.key)).toEqual([
      'pinned',
      'from-chats',
      'added-by-you',
    ]);
    expect(summary.sections[0].facts).toEqual(['prefers rust']);
    expect(summary.sections[1].facts).toEqual(['lives in Berlin']);
    expect(summary.sections[2].facts).toEqual(['allergic to peanuts']);
    expect(summary.sourceCount).toBe(3);
    expect(summary.includedCount).toBe(3);
    expect(summary.newestAt).toBe(300);
    expect(summary.oldestAt).toBe(100);
  });

  it('omits a section entirely rather than rendering an empty group', () => {
    const summary = summarizeMemoryFacts([fact({ id: '1', fact: 'prefers rust', pinned: true })]);

    expect(summary.sections).toHaveLength(1);
    expect(summary.sections[0].key).toBe('pinned');
  });

  it('dedupes restatements of the same fact within a section', () => {
    const summary = summarizeMemoryFacts([
      fact({ id: '1', fact: 'Prefers  Rust' }),
      fact({ id: '2', fact: 'prefers rust' }),
      fact({ id: '3', fact: 'ships on Fridays' }),
    ]);

    expect(summary.sections).toHaveLength(1);
    expect(summary.sections[0].facts).toEqual(['Prefers  Rust', 'ships on Fridays']);
    expect(summary.sourceCount).toBe(3);
    expect(summary.includedCount).toBe(2);
  });

  it('returns an empty, non-claiming summary for an empty store', () => {
    const summary = summarizeMemoryFacts([]);

    expect(summary.sections).toEqual([]);
    expect(summary.sourceCount).toBe(0);
    expect(summary.includedCount).toBe(0);
    expect(summary.newestAt).toBeNull();
    expect(summary.oldestAt).toBeNull();
  });
});

describe('describeMemoryFreshness', () => {
  const now = 1_800_000_000_000;

  it('returns null when nothing can date the store', () => {
    expect(describeMemoryFreshness([], now)).toBeNull();
    expect(
      describeMemoryFreshness(
        [fact({ id: '1', fact: 'x', created_at: Number.NaN as unknown as number })],
        now,
      ),
    ).toBeNull();
  });

  it('reports the newest entry, not the first or the last', () => {
    const entries = [
      fact({ id: 'old', fact: 'old', created_at: now - 40 * DAY }),
      fact({ id: 'new', fact: 'new', created_at: now - 2 * DAY }),
      fact({ id: 'mid', fact: 'mid', created_at: now - 10 * DAY }),
    ];

    expect(describeMemoryFreshness(entries, now)).toBe('Updated 2 days ago');
  });

  it('formats each freshness bucket', () => {
    const at = (msAgo: number) => [fact({ id: 'a', fact: 'a', created_at: now - msAgo })];

    expect(describeMemoryFreshness(at(0), now)).toBe('Updated today');
    expect(describeMemoryFreshness(at(DAY), now)).toBe('Updated yesterday');
    expect(describeMemoryFreshness(at(3 * DAY), now)).toBe('Updated 3 days ago');
    expect(describeMemoryFreshness(at(29 * DAY), now)).toBe('Updated 29 days ago');
    expect(describeMemoryFreshness(at(35 * DAY), now)).toBe('Updated 1 month ago');
    expect(describeMemoryFreshness(at(200 * DAY), now)).toBe('Updated 6 months ago');
  });
});
