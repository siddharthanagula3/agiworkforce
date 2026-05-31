/**
 * Unit tests for dedupeAgainstExisting — the pure consolidation dedup step.
 * (consolidateFactsFromTurn is the thin async DB wrapper; its dedup logic lives
 * here and is exercised directly.)
 */
import { dedupeAgainstExisting } from '../src/features/memory/services/consolidation';
import type { MemoryFact } from '../storage/types';

function existing(...facts: string[]): MemoryFact[] {
  return facts.map((f, i) => ({
    id: String(i),
    fact: f,
    source_conversation_id: null,
    pinned: false,
    created_at: 0,
  }));
}

describe('dedupeAgainstExisting', () => {
  it('returns all candidates when nothing exists', () => {
    expect(dedupeAgainstExisting(['User likes Rust', 'User lives in Pune'], [])).toEqual([
      'User likes Rust',
      'User lives in Pune',
    ]);
  });

  it('filters out candidates already stored (case/space-insensitive)', () => {
    const out = dedupeAgainstExisting(
      ['User likes Rust', 'user   likes rust', 'User lives in Pune'],
      existing('USER LIKES RUST'),
    );
    expect(out).toEqual(['User lives in Pune']);
  });

  it('dedupes within the candidate list itself', () => {
    const out = dedupeAgainstExisting(['User likes Rust', 'User likes Rust'], []);
    expect(out).toEqual(['User likes Rust']);
  });

  it('drops empty / whitespace-only candidates', () => {
    expect(dedupeAgainstExisting(['', '   ', 'User likes Rust'], [])).toEqual(['User likes Rust']);
  });

  it('trims surviving candidates', () => {
    expect(dedupeAgainstExisting(['  User likes Rust  '], [])).toEqual(['User likes Rust']);
  });

  it('returns [] when every candidate already exists', () => {
    expect(dedupeAgainstExisting(['User likes Rust'], existing('user likes rust'))).toEqual([]);
  });
});
