/**
 * Offset pagination is unstable the moment anything is written: a row inserted
 * above the window shifts every later row down, so page two repeats a row page
 * one already showed and skips one nobody sees. A keyset cursor names the last
 * row instead of counting rows, so a concurrent write cannot move the window.
 *
 * The tiebreaker is not optional. `updated_at` is not unique, so ordering by it
 * alone leaves rows with equal timestamps in an order the database is free to
 * change between queries.
 */

export type PageDirection = 'asc' | 'desc';

export interface KeysetCursor {
  /** The sort column's value on the last row of the page just returned. */
  readonly sortValue: string;
  /** The unique tiebreaker, always the row id. */
  readonly id: string;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export function clampPageSize(requested: number | null | undefined): number {
  if (requested === null || requested === undefined || !Number.isFinite(requested)) {
    return DEFAULT_PAGE_SIZE;
  }
  const size = Math.trunc(requested);
  if (size < 1) return 1;
  return Math.min(size, MAX_PAGE_SIZE);
}

export function encodeKeysetCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify([cursor.sortValue, cursor.id]), 'utf8').toString('base64url');
}

export function decodeKeysetCursor(value: string | null | undefined): KeysetCursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [sortValue, id] = parsed;
    if (typeof sortValue !== 'string' || typeof id !== 'string') return null;
    if (sortValue.length === 0 || id.length === 0) return null;
    return { sortValue, id };
  } catch {
    return null;
  }
}

export interface Page<Item> {
  readonly items: readonly Item[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/**
 * Callers fetch `limit + 1` rows. The extra row is the evidence that another
 * page exists, and it is dropped rather than returned.
 */
export function buildPage<Item>(
  rows: readonly Item[],
  limit: number,
  keyOf: (item: Item) => KeysetCursor,
): Page<Item> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor: hasMore && last !== undefined ? encodeKeysetCursor(keyOf(last)) : null,
  };
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/u;

function assertIdentifier(name: string, role: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`pagination: ${role} '${name}' is not an identifier`);
  return name;
}

export interface KeysetSql {
  readonly orderBy: string;
  readonly where: string | null;
  readonly params: readonly string[];
}

/**
 * Builds the ordering and the cursor predicate together, because a predicate
 * whose column order differs from the ORDER BY silently returns wrong pages.
 */
export function keysetSql(input: {
  sortColumn: string;
  idColumn?: string;
  direction?: PageDirection;
  cursor?: KeysetCursor | null;
  firstParamIndex?: number;
}): KeysetSql {
  const sortColumn = assertIdentifier(input.sortColumn, 'sort column');
  const idColumn = assertIdentifier(input.idColumn ?? 'id', 'id column');
  const direction: PageDirection = input.direction ?? 'desc';
  const keyword = direction === 'asc' ? 'asc' : 'desc';
  const comparison = direction === 'asc' ? '>' : '<';
  const orderBy = `order by ${sortColumn} ${keyword}, ${idColumn} ${keyword}`;

  if (!input.cursor) return { orderBy, where: null, params: [] };

  const first = input.firstParamIndex ?? 1;
  return {
    orderBy,
    where: `(${sortColumn}, ${idColumn}) ${comparison} ($${first}, $${first + 1})`,
    params: [input.cursor.sortValue, input.cursor.id],
  };
}
