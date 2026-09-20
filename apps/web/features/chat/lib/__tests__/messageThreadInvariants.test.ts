import { describe, expect, it } from 'vitest';

import {
  compareThreadOrder,
  deepestDescendant,
  linearTail,
  resolveSurvivingLeaf,
  resolveVisibleThread,
  siblingGroup,
  stampLinearParents,
  subtreeIds,
  variantInfoByMessage,
  type ThreadedMessage,
} from '../messageThread';

interface Row extends ThreadedMessage {
  parentId: string | null;
  createdAt: string;
  role: 'user' | 'assistant';
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stamp(index: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
}

// A page of rows arrives in whatever order the reader fetched it, so nothing
// below may lean on the array order matching the thread order.
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const held = out[index] as T;
    out[index] = out[swap] as T;
    out[swap] = held;
  }
  return out;
}

/** Grows a conversation by appending, regenerating, editing and branching. */
function generateConversation(seed: number, steps: number): { rows: Row[]; leaf: string | null } {
  const random = seeded(seed);
  const rows: Row[] = [];
  let leaf: string | null = null;
  let clock = 0;

  const add = (parentId: string | null, role: Row['role']): Row => {
    clock += 1;
    const row: Row = { id: `m${clock}`, parentId, createdAt: stamp(clock), role };
    rows.push(row);
    return row;
  };

  for (let step = 0; step < steps; step += 1) {
    const roll = random();
    if (rows.length === 0 || roll < 0.45) {
      const question = add(leaf, 'user');
      leaf = add(question.id, 'assistant').id;
      continue;
    }
    const pick = rows[Math.floor(random() * rows.length)];
    if (!pick) continue;
    if (roll < 0.7) {
      leaf = add(pick.parentId, pick.role).id;
      continue;
    }
    if (roll < 0.85) {
      leaf = deepestDescendant(rows, pick.id);
      continue;
    }
    const doomed = new Set(subtreeIds(rows, pick.id));
    const surviving = resolveSurvivingLeaf(rows, pick.id);
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (row && doomed.has(row.id)) rows.splice(index, 1);
    }
    leaf = surviving && !doomed.has(surviving) ? surviving : (linearTail(rows) ?? null);
  }

  return { rows: shuffled(rows, random), leaf };
}

function assertPathIsARootedChain(rows: readonly Row[], leaf: string | null): void {
  const path = resolveVisibleThread(rows, leaf);
  if (!leaf || rows.length === 0) return;
  const known = new Map(rows.map((row) => [row.id, row]));
  if (!known.has(leaf)) return;

  expect(path[path.length - 1]?.id).toBe(leaf);
  expect(new Set(path.map((row) => row.id)).size).toBe(path.length);
  const head = path[0];
  expect(head).toBeDefined();
  expect(head?.parentId === null || !known.has(head?.parentId ?? '')).toBe(true);
  for (let index = 1; index < path.length; index += 1) {
    expect(path[index]?.parentId).toBe(path[index - 1]?.id);
  }
}

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233];

describe('the message tree holds its shape however it was grown', () => {
  it('always reads the visible transcript as one cycle-free chain ending at the leaf', () => {
    for (const seed of SEEDS) {
      const { rows, leaf } = generateConversation(seed, 40);
      assertPathIsARootedChain(rows, leaf);
    }
  });

  it('puts every member of a variant group under the same parent, in pager order', () => {
    for (const seed of SEEDS) {
      const { rows } = generateConversation(seed, 40);
      for (const row of rows) {
        const group = siblingGroup(rows, row);
        expect(group.ids).toContain(row.id);
        expect(group.index).toBe(group.ids.indexOf(row.id));
        const members = group.ids.map((id) => rows.find((candidate) => candidate.id === id));
        for (const member of members) {
          expect(member?.parentId ?? null).toBe(row.parentId ?? null);
        }
        const ordered = [...members].sort((left, right) =>
          compareThreadOrder(left as ThreadedMessage, right as ThreadedMessage),
        );
        expect(ordered.map((member) => member?.id)).toEqual(group.ids);
      }
    }
  });

  it('keeps a subtree closed under descent, so a delete takes no stranger with it', () => {
    for (const seed of SEEDS) {
      const { rows } = generateConversation(seed, 40);
      for (const row of rows) {
        const doomed = new Set(subtreeIds(rows, row.id));
        expect(doomed.has(row.id)).toBe(true);
        for (const candidate of rows) {
          const parentIsDoomed = candidate.parentId !== null && doomed.has(candidate.parentId);
          expect(parentIsDoomed ? doomed.has(candidate.id) : true).toBe(true);
        }
      }
    }
  });

  it('leaves the transcript a rooted chain after any single subtree delete', () => {
    for (const seed of SEEDS) {
      const { rows } = generateConversation(seed, 30);
      for (const row of rows) {
        const doomed = new Set(subtreeIds(rows, row.id));
        const surviving = resolveSurvivingLeaf(rows, row.id);
        const remaining = rows.filter((candidate) => !doomed.has(candidate.id));
        expect(surviving === null || !doomed.has(surviving)).toBe(true);
        expect(remaining.some((candidate) => candidate.parentId === surviving)).toBe(false);
        assertPathIsARootedChain(remaining, surviving);
      }
    }
  });

  it('agrees with the sibling pager about every row the reader can see', () => {
    for (const seed of SEEDS) {
      const { rows, leaf } = generateConversation(seed, 40);
      const info = variantInfoByMessage(rows, leaf);
      for (const [id, entry] of Object.entries(info)) {
        const row = rows.find((candidate) => candidate.id === id);
        expect(row).toBeDefined();
        const group = siblingGroup(rows, row as ThreadedMessage);
        expect(entry.total).toBe(group.total);
        expect(entry.index).toBe(group.index);
        expect(entry.previousId).toBe(
          group.index > 0 ? (group.ids[group.index - 1] ?? null) : null,
        );
        expect(entry.nextId).toBe(
          group.index < group.total - 1 ? (group.ids[group.index + 1] ?? null) : null,
        );
      }
    }
  });

  it('gives a linear conversation exactly one root and keeps every row', () => {
    for (const seed of SEEDS) {
      const { rows } = generateConversation(seed, 20);
      const flat = rows.map((row) => ({ ...row, parentId: null }));
      const stamped = stampLinearParents(flat);
      expect(stamped.map((row) => row.id).sort()).toEqual(flat.map((row) => row.id).sort());
      expect(stamped.filter((row) => (row.parentId ?? null) === null)).toHaveLength(1);
      assertPathIsARootedChain(stamped as Row[], linearTail(stamped));
    }
  });

  it('terminates on a tree corrupted into a cycle rather than hanging the tab', () => {
    const rows: Row[] = [
      { id: 'a', parentId: 'c', createdAt: stamp(1), role: 'user' },
      { id: 'b', parentId: 'a', createdAt: stamp(2), role: 'assistant' },
      { id: 'c', parentId: 'b', createdAt: stamp(3), role: 'user' },
    ];

    expect(resolveVisibleThread(rows, 'c').length).toBeLessThanOrEqual(rows.length);
    expect(subtreeIds(rows, 'a').sort()).toEqual(['a', 'b', 'c']);
    expect(rows.some((row) => row.id === deepestDescendant(rows, 'a'))).toBe(true);
  });
});
