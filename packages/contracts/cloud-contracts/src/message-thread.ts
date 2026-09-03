/**
 * Mirrors MAX_THREAD_WALK_DEPTH in the messages route's message-thread lib. A
 * parent pointer only ever names a row that already existed, so no cycle should
 * exist to find; the bound is here so a row corrupted by something outside these
 * paths costs one wrong transcript rather than a hung tab.
 */
const MAX_THREAD_WALK_DEPTH = 10_000;

/**
 * The least a surface's message shape has to say for these functions to resolve
 * a thread from it. Web, Desktop, Mobile and unified-chat each carry their own
 * richer message type; every one of them satisfies this, and every function
 * below is generic over it so a caller gets its own type back.
 *
 * `createdAt` is optional because unified-chat's shape leaves it so. A row
 * without one sorts ahead of every row that has one, and ties break by id, so
 * the order stays total either way.
 */
export interface ThreadedMessage {
  id: string;
  parentId?: string | null;
  createdAt?: string;
}

export interface SiblingGroup {
  ids: string[];
  index: number;
  total: number;
}

export interface VariantInfo {
  index: number;
  total: number;
  previousId: string | null;
  nextId: string | null;
}

export type VariantInfoByMessageId = Readonly<Record<string, VariantInfo>>;

export const EMPTY_VARIANT_INFO: VariantInfoByMessageId = Object.freeze({});

const UNDATED_ORDER_KEY = '';

function parentOf(message: ThreadedMessage): string | null {
  return message.parentId ?? null;
}

function orderKeyOf(message: ThreadedMessage): string {
  return message.createdAt ?? UNDATED_ORDER_KEY;
}

export function compareThreadOrder(left: ThreadedMessage, right: ThreadedMessage): number {
  const leftKey = orderKeyOf(left);
  const rightKey = orderKeyOf(right);
  if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function indexById<TMessage extends ThreadedMessage>(
  rows: readonly TMessage[],
): Map<string, TMessage> {
  const byId = new Map<string, TMessage>();
  for (const row of rows) byId.set(row.id, row);
  return byId;
}

function newestChildByParent<TMessage extends ThreadedMessage>(
  rows: readonly TMessage[],
): Map<string | null, TMessage> {
  const newest = new Map<string | null, TMessage>();
  for (const row of rows) {
    const key = parentOf(row);
    const current = newest.get(key);
    if (!current || compareThreadOrder(current, row) < 0) newest.set(key, row);
  }
  return newest;
}

/**
 * Walks from `id` to the end of its newest-child chain, which is the leaf the
 * pager's default selection implies at every step: the reader lands where they
 * would have got to by paging to this variant by hand.
 */
export function deepestDescendant(rows: readonly ThreadedMessage[], id: string): string {
  const newest = newestChildByParent(rows);
  const seen = new Set<string>([id]);
  let current = id;
  for (let depth = 0; depth < MAX_THREAD_WALK_DEPTH; depth += 1) {
    const child = newest.get(current);
    if (!child || seen.has(child.id)) return current;
    seen.add(child.id);
    current = child.id;
  }
  return current;
}

export function subtreeIds(rows: readonly ThreadedMessage[], id: string): string[] {
  if (!rows.some((row) => row.id === id)) return [];
  const childrenByParent = new Map<string | null, ThreadedMessage[]>();
  for (const row of rows) {
    const key = parentOf(row);
    const bucket = childrenByParent.get(key);
    if (bucket) bucket.push(row);
    else childrenByParent.set(key, [row]);
  }
  const doomed = new Set<string>([id]);
  const pending = [id];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    for (const child of childrenByParent.get(current) ?? []) {
      if (doomed.has(child.id)) continue;
      doomed.add(child.id);
      pending.push(child.id);
    }
  }
  return [...doomed];
}

/**
 * The leaf to activate when the reader pages onto `siblingId`: the end of that
 * variant's own tail, so switching a user message shows the whole exchange it
 * produced rather than the message alone.
 */
export function resolveLeafForSibling(rows: readonly ThreadedMessage[], siblingId: string): string {
  return deepestDescendant(rows, siblingId);
}

export function resolveSurvivingLeaf(
  rows: readonly ThreadedMessage[],
  messageId: string,
): string | null {
  const message = rows.find((row) => row.id === messageId);
  if (!message) return null;
  const parentId = parentOf(message);
  const siblings = rows
    .filter((row) => parentOf(row) === parentId && row.id !== messageId)
    .sort(compareThreadOrder);
  const newest = siblings[siblings.length - 1];
  return newest ? deepestDescendant(rows, newest.id) : parentId;
}

/**
 * The path a conversation with no recorded leaf still has: the newest root, then
 * the newest child at each step. Used when the recorded leaf names a row this
 * client cannot see, so a stale pointer costs the reader the selection they made
 * rather than the whole transcript.
 */
function deepestLatestChain<TMessage extends ThreadedMessage>(
  rows: readonly TMessage[],
): TMessage[] {
  if (rows.length === 0) return [];
  const newest = newestChildByParent(rows);
  const root = newest.get(null);
  // Every row claiming a parent leaves no root to descend from, which is not a
  // shape these paths can produce. Showing the bucket in order is still a
  // transcript; showing nothing is the outcome this fallback exists to prevent.
  if (!root) return [...rows].sort(compareThreadOrder);
  const chain: TMessage[] = [root];
  const seen = new Set<string>([root.id]);
  for (let depth = 0; depth < MAX_THREAD_WALK_DEPTH; depth += 1) {
    const tail = chain[chain.length - 1];
    const next = tail ? newest.get(tail.id) : undefined;
    if (!next || seen.has(next.id)) break;
    seen.add(next.id);
    chain.push(next);
  }
  return chain;
}

export function resolveVisibleThread<TMessage extends ThreadedMessage>(
  rows: readonly TMessage[],
  activeLeafId: string | null | undefined,
): TMessage[] {
  if (!activeLeafId) return rows as TMessage[];
  const byId = indexById(rows);
  const leaf = byId.get(activeLeafId);
  if (!leaf) return deepestLatestChain(rows);

  const path: TMessage[] = [];
  const seen = new Set<string>();
  let current: TMessage | undefined = leaf;
  while (current && !seen.has(current.id) && path.length < MAX_THREAD_WALK_DEPTH) {
    seen.add(current.id);
    path.push(current);
    const parentId = parentOf(current);
    current = parentId === null ? undefined : byId.get(parentId);
  }
  path.reverse();
  return path;
}

/**
 * The variants `message` sits among: every row sharing its parent, in pager
 * order. A conversation that has never branched puts every row in the same
 * null-parent group, so callers gate this on a conversation that has a leaf.
 */
export function siblingGroup(
  rows: readonly ThreadedMessage[],
  message: ThreadedMessage,
): SiblingGroup {
  const parentId = parentOf(message);
  const siblings = rows.filter((row) => parentOf(row) === parentId).sort(compareThreadOrder);
  const ids = siblings.map((row) => row.id);
  return { ids, index: ids.indexOf(message.id), total: ids.length };
}

export function variantInfoByMessage(
  rows: readonly ThreadedMessage[],
  activeLeafId: string | null | undefined,
): VariantInfoByMessageId {
  if (!activeLeafId || rows.length === 0) return EMPTY_VARIANT_INFO;
  const visible = resolveVisibleThread(rows, activeLeafId);
  let info: Record<string, VariantInfo> | null = null;
  for (const message of visible) {
    const group = siblingGroup(rows, message);
    if (group.total <= 1 || group.index < 0) continue;
    info ??= {};
    info[message.id] = {
      index: group.index,
      total: group.total,
      previousId: group.index > 0 ? (group.ids[group.index - 1] ?? null) : null,
      nextId: group.index < group.total - 1 ? (group.ids[group.index + 1] ?? null) : null,
    };
  }
  return info ? Object.freeze(info) : EMPTY_VARIANT_INFO;
}

/**
 * Whether two pager maps say the same thing. A streamed token rewrites the row
 * array every frame without touching the tree, so the recomputed map is almost
 * always value-equal to the last one; holding the old identity when it is keeps
 * a transcript's row memos from re-rendering per frame.
 */
export function sameVariantInfoMap(
  left: VariantInfoByMessageId,
  right: VariantInfoByMessageId,
): boolean {
  if (left === right) return true;
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => {
    const a = left[key];
    const b = right[key];
    if (!a || !b) return false;
    return (
      a.index === b.index &&
      a.total === b.total &&
      a.previousId === b.previousId &&
      a.nextId === b.nextId
    );
  });
}

/**
 * Gives a conversation that has only ever been linear the parent pointers its
 * history implies, so the row about to be added has something to branch from.
 *
 * The client mirror of the server's `stampLinearParents`, down to the ordering
 * key: it chains by `(created_at, id)` over ALL rows and writes only where no
 * parent is set, so a bucket that already carries server-assigned parents comes
 * back by identity and the two sides cannot disagree about lineage.
 */
export function stampLinearParents<TMessage extends ThreadedMessage>(
  rows: readonly TMessage[],
): TMessage[] {
  if (rows.length === 0) return rows as TMessage[];
  const ordered = [...rows].sort(compareThreadOrder);
  const assigned = new Map<string, string>();
  for (let index = 1; index < ordered.length; index += 1) {
    const row = ordered[index];
    const previous = ordered[index - 1];
    if (!row || !previous || parentOf(row) !== null) continue;
    assigned.set(row.id, previous.id);
  }
  if (assigned.size === 0) return rows as TMessage[];
  return rows.map((row) => {
    const parentId = assigned.get(row.id);
    return parentId ? { ...row, parentId } : row;
  });
}

/** The row a parentless write continues from once a conversation is a tree. */
export function linearTail(rows: readonly ThreadedMessage[]): string | null {
  if (rows.length === 0) return null;
  const ordered = [...rows].sort(compareThreadOrder);
  return ordered[ordered.length - 1]?.id ?? null;
}
