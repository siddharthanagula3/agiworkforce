import { describe, expect, it } from 'vitest';
import {
  EMPTY_VARIANT_INFO,
  compareThreadOrder,
  deepestDescendant,
  linearTail,
  resolveLeafForSibling,
  resolveSurvivingLeaf,
  resolveVisibleThread,
  sameVariantInfoMap,
  siblingGroup,
  stampLinearParents,
  subtreeIds,
  variantInfoByMessage,
  type ThreadedMessage,
} from '../message-thread';

const BASE_TIME = Date.parse('2026-09-01T10:00:00.000Z');
const MINUTE_MS = 60_000;

interface SurfaceMessage extends ThreadedMessage {
  role: 'user' | 'assistant';
  content: string;
}

function message(
  id: string,
  options: { parentId?: string | null; minute?: number; role?: SurfaceMessage['role'] } = {},
): SurfaceMessage {
  return {
    id,
    role: options.role ?? 'user',
    content: id,
    createdAt: new Date(BASE_TIME + (options.minute ?? 0) * MINUTE_MS).toISOString(),
    ...(options.parentId === undefined ? {} : { parentId: options.parentId }),
  };
}

/** u1 -> a1 -> u2 -> a2, with a2b as a second answer to u2. */
function threadedRows(): SurfaceMessage[] {
  return [
    message('u1', { parentId: null, minute: 0 }),
    message('a1', { parentId: 'u1', minute: 1, role: 'assistant' }),
    message('u2', { parentId: 'a1', minute: 2 }),
    message('a2', { parentId: 'u2', minute: 3, role: 'assistant' }),
    message('a2b', { parentId: 'u2', minute: 4, role: 'assistant' }),
  ];
}

describe('resolveVisibleThread', () => {
  it('returns a legacy conversation by identity so no memo downstream sees a change', () => {
    const rows = [message('m1'), message('m2', { minute: 1 })];

    expect(resolveVisibleThread(rows, null)).toBe(rows);
    expect(resolveVisibleThread(rows, undefined)).toBe(rows);
  });

  it('hands the caller back its own message shape, not the structural minimum', () => {
    const visible = resolveVisibleThread(threadedRows(), 'a2b');

    expect(visible.map((row) => row.content)).toEqual(['u1', 'a1', 'u2', 'a2b']);
  });

  it('returns the ancestors of the leaf, root first', () => {
    expect(resolveVisibleThread(threadedRows(), 'a2b').map((m) => m.id)).toEqual([
      'u1',
      'a1',
      'u2',
      'a2b',
    ]);
  });

  it('leaves the other variant off the path entirely', () => {
    expect(resolveVisibleThread(threadedRows(), 'a2').map((m) => m.id)).not.toContain('a2b');
  });

  it('reads a row whose parent is not loaded as a root rather than dropping it', () => {
    const rows = [
      message('orphan', { parentId: 'missing', minute: 0 }),
      message('child', { parentId: 'orphan', minute: 1 }),
    ];

    expect(resolveVisibleThread(rows, 'child').map((m) => m.id)).toEqual(['orphan', 'child']);
  });

  it('stops at the repeat instead of walking a cycle forever', () => {
    const rows = [
      message('a', { parentId: 'b', minute: 0 }),
      message('b', { parentId: 'a', minute: 1 }),
    ];

    expect(resolveVisibleThread(rows, 'a').map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('falls back to the newest chain when the leaf names a row it cannot see', () => {
    expect(resolveVisibleThread(threadedRows(), 'deleted-elsewhere').map((m) => m.id)).toEqual([
      'u1',
      'a1',
      'u2',
      'a2b',
    ]);
  });

  it('shows the rows in order when every one of them claims a parent', () => {
    const rows = [
      message('b', { parentId: 'gone', minute: 1 }),
      message('a', { parentId: 'gone', minute: 0 }),
    ];

    expect(resolveVisibleThread(rows, 'nowhere').map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('has nothing to show for an empty conversation with a stale leaf', () => {
    expect(resolveVisibleThread([], 'anything')).toEqual([]);
  });
});

describe('sibling ordering', () => {
  it('orders a group by created_at then id, matching the server pager', () => {
    const rows = [
      message('parent', { parentId: null, minute: 0 }),
      message('zzz', { parentId: 'parent', minute: 1 }),
      message('aaa', { parentId: 'parent', minute: 1 }),
      message('mid', { parentId: 'parent', minute: 2 }),
    ];

    expect(siblingGroup(rows, rows[1]!).ids).toEqual(['aaa', 'zzz', 'mid']);
    expect(siblingGroup(rows, rows[1]!).index).toBe(1);
    expect(siblingGroup(rows, rows[1]!).total).toBe(3);
  });

  it('reports a message that is not in the rows as having no position', () => {
    expect(siblingGroup(threadedRows(), message('elsewhere')).index).toBe(-1);
  });

  it('breaks a created_at tie by id, both directions', () => {
    const earlier = message('a', { minute: 1 });
    const later = message('b', { minute: 1 });

    expect(compareThreadOrder(earlier, later)).toBeLessThan(0);
    expect(compareThreadOrder(later, earlier)).toBeGreaterThan(0);
    expect(compareThreadOrder(earlier, earlier)).toBe(0);
  });

  /** unified-chat's message shape leaves createdAt optional. */
  it('keeps a total order over rows that carry no timestamp', () => {
    const undated: ThreadedMessage[] = [{ id: 'b' }, { id: 'a' }];

    expect(compareThreadOrder(undated[0]!, undated[1]!)).toBeGreaterThan(0);
    expect(compareThreadOrder(undated[0]!, message('z', { minute: 0 }))).toBeLessThan(0);
    expect(linearTail(undated)).toBe('b');
  });
});

describe('deepestDescendant', () => {
  it('descends by newest child, which is what the pager defaults to', () => {
    const rows = [
      ...threadedRows(),
      message('u3', { parentId: 'a2', minute: 5 }),
      message('a3', { parentId: 'u3', minute: 6, role: 'assistant' }),
    ];

    expect(deepestDescendant(rows, 'a2')).toBe('a3');
    expect(resolveLeafForSibling(rows, 'a2')).toBe('a3');
  });

  it('answers with the row itself when it has no children', () => {
    expect(deepestDescendant(threadedRows(), 'a2b')).toBe('a2b');
  });

  it('terminates on a cycle', () => {
    const rows = [
      message('a', { parentId: 'b', minute: 0 }),
      message('b', { parentId: 'a', minute: 1 }),
    ];

    expect(['a', 'b']).toContain(deepestDescendant(rows, 'a'));
  });
});

describe('stampLinearParents', () => {
  it('chains by (created_at, id), the same key the server backfills on', () => {
    const rows = [
      message('third', { minute: 2 }),
      message('first', { minute: 0 }),
      message('second', { minute: 1 }),
    ];

    const stamped = stampLinearParents(rows);

    expect(stamped.map((m) => [m.id, m.parentId ?? null])).toEqual([
      ['third', 'second'],
      ['first', null],
      ['second', 'first'],
    ]);
  });

  it('leaves a row that already names a parent alone', () => {
    const rows = [
      message('a', { minute: 0 }),
      message('b', { parentId: 'a', minute: 1 }),
      message('c', { minute: 2 }),
    ];

    expect(stampLinearParents(rows)[1]?.parentId).toBe('a');
    expect(stampLinearParents(rows)[2]?.parentId).toBe('b');
  });

  it('returns the same array when there is nothing to stamp', () => {
    const alreadyThreaded = threadedRows();
    const empty: SurfaceMessage[] = [];

    expect(stampLinearParents(alreadyThreaded)).toBe(alreadyThreaded);
    expect(stampLinearParents(empty)).toBe(empty);
  });

  it('carries the surface fields it does not know about onto a stamped row', () => {
    const stamped = stampLinearParents([message('a', { minute: 0 }), message('b', { minute: 1 })]);

    expect(stamped[1]).toEqual({
      id: 'b',
      role: 'user',
      content: 'b',
      createdAt: new Date(BASE_TIME + MINUTE_MS).toISOString(),
      parentId: 'a',
    });
  });

  it('leaves the first row parentless, so the conversation keeps one root', () => {
    const stamped = stampLinearParents([message('a', { minute: 0 }), message('b', { minute: 1 })]);

    expect(stamped[0]?.parentId ?? null).toBeNull();
  });
});

describe('linearTail', () => {
  it('names the last row in thread order, not in array order', () => {
    expect(linearTail([message('b', { minute: 5 }), message('a', { minute: 0 })])).toBe('b');
  });

  it('has no tail for an empty conversation', () => {
    expect(linearTail([])).toBeNull();
  });
});

describe('variantInfoByMessage', () => {
  it('gives a conversation with no leaf the shared empty map', () => {
    const rows = [message('a'), message('b', { minute: 1 })];

    expect(variantInfoByMessage(rows, null)).toBe(EMPTY_VARIANT_INFO);
    expect(variantInfoByMessage([], 'leaf')).toBe(EMPTY_VARIANT_INFO);
  });

  it('gives a threaded conversation with no branch the shared empty map', () => {
    const rows = [
      message('u1', { parentId: null, minute: 0 }),
      message('a1', { parentId: 'u1', minute: 1, role: 'assistant' }),
    ];

    expect(variantInfoByMessage(rows, 'a1')).toBe(EMPTY_VARIANT_INFO);
  });

  it('reports the position of the selected variant and where paging leads', () => {
    const info = variantInfoByMessage(threadedRows(), 'a2b');

    expect(info['a2b']).toEqual({ index: 1, total: 2, previousId: 'a2', nextId: null });
    expect(info['u2']).toBeUndefined();
  });

  it('says nothing about a variant that is not on the visible path', () => {
    expect(variantInfoByMessage(threadedRows(), 'a2b')['a2']).toBeUndefined();
  });

  it('counts root siblings, which are edits of the opening message', () => {
    const rows = [
      message('u1', { parentId: null, minute: 0 }),
      message('u1b', { parentId: null, minute: 1 }),
      message('a1b', { parentId: 'u1b', minute: 2, role: 'assistant' }),
    ];

    expect(variantInfoByMessage(rows, 'a1b')['u1b']).toEqual({
      index: 1,
      total: 2,
      previousId: 'u1',
      nextId: null,
    });
  });
});

describe('sameVariantInfoMap', () => {
  it('holds the previous identity when a streamed frame says nothing new', () => {
    const rows = threadedRows();
    const before = variantInfoByMessage(rows, 'a2b');
    const after = variantInfoByMessage(
      rows.map((row) => (row.id === 'a2b' ? { ...row, content: 'more text' } : row)),
      'a2b',
    );

    expect(after).not.toBe(before);
    expect(sameVariantInfoMap(before, after)).toBe(true);
  });

  it('sees the regenerate that turns a one-answer turn into two', () => {
    const before = variantInfoByMessage(threadedRows().slice(0, 4), 'a2');
    const after = variantInfoByMessage(threadedRows(), 'a2');

    expect(sameVariantInfoMap(before, after)).toBe(false);
  });

  it('sees a switch that moves the reader between siblings', () => {
    expect(
      sameVariantInfoMap(
        variantInfoByMessage(threadedRows(), 'a2'),
        variantInfoByMessage(threadedRows(), 'a2b'),
      ),
    ).toBe(false);
  });

  it('is true for the same map compared with itself', () => {
    expect(sameVariantInfoMap(EMPTY_VARIANT_INFO, EMPTY_VARIANT_INFO)).toBe(true);
  });
});

describe('subtreeIds', () => {
  it('takes the variant and the exchange that continued from it', () => {
    const rows = [
      ...threadedRows(),
      message('u3', { parentId: 'a2b', minute: 5 }),
      message('a3', { parentId: 'u3', minute: 6, role: 'assistant' }),
    ];

    expect(subtreeIds(rows, 'a2b').sort()).toEqual(['a2b', 'a3', 'u3']);
  });

  it('leaves the siblings of the deleted variant alone', () => {
    expect(subtreeIds(threadedRows(), 'a2')).toEqual(['a2']);
  });

  it('takes the whole conversation when the root goes', () => {
    expect(subtreeIds(threadedRows(), 'u1').sort()).toEqual(['a1', 'a2', 'a2b', 'u1', 'u2']);
  });

  it('answers for nothing when the id is not a row in this conversation', () => {
    expect(subtreeIds(threadedRows(), 'not-here')).toEqual([]);
  });

  it('answers the same for a legacy conversation with no parents at all', () => {
    const rows = [message('m1'), message('m2', { minute: 1 })];

    expect(subtreeIds(rows, 'm1')).toEqual(['m1']);
  });

  it('terminates on a row that points back into its own ancestry', () => {
    const rows = [
      message('a', { parentId: 'c', minute: 0 }),
      message('b', { parentId: 'a', minute: 1 }),
      message('c', { parentId: 'b', minute: 2 }),
    ];

    expect(subtreeIds(rows, 'a').sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('resolveSurvivingLeaf', () => {
  it('lands on the end of the newest surviving sibling own tail', () => {
    const rows = [
      ...threadedRows(),
      message('u3', { parentId: 'a2', minute: 5 }),
      message('a3', { parentId: 'u3', minute: 6, role: 'assistant' }),
    ];

    expect(resolveSurvivingLeaf(rows, 'a2b')).toBe('a3');
  });

  it('falls back to the branch point when the deleted variant was the last one', () => {
    const rows = [
      message('u1', { parentId: null, minute: 0 }),
      message('a1', { parentId: 'u1', minute: 1, role: 'assistant' }),
    ];

    expect(resolveSurvivingLeaf(rows, 'a1')).toBe('u1');
  });

  it('goes back to linear when the deleted root was the whole conversation', () => {
    expect(resolveSurvivingLeaf([message('u1', { parentId: null, minute: 0 })], 'u1')).toBeNull();
  });

  it('never lands inside the subtree that is about to go', () => {
    const rows = [
      ...threadedRows(),
      message('u3', { parentId: 'a2b', minute: 5 }),
      message('a3', { parentId: 'u3', minute: 6, role: 'assistant' }),
    ];

    expect(subtreeIds(rows, 'a2b')).not.toContain(resolveSurvivingLeaf(rows, 'a2b'));
  });

  it('answers for nothing when the id is not a row in this conversation', () => {
    expect(resolveSurvivingLeaf(threadedRows(), 'not-here')).toBeNull();
  });
});
