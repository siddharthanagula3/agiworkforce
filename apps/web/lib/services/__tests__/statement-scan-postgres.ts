/**
 * A Postgres that evaluates the statement it is given against seeded rows.
 *
 * A reader is safe because of the predicates in its statement, so a test that
 * only matched the statement's text would pass on a predicate Postgres reads
 * differently. This runs the statement instead: it resolves the sources a
 * statement puts in scope (tables, CTEs, subqueries and LATERAL), attaches each
 * AND-ed comparison to the alias it names, and scans the seeded rows through
 * them. Drop `deleted_at is null` from a reader and the withdrawn row it named
 * comes back in the result.
 *
 * The subset is what these readers use: SELECT with FROM/JOIN/LEFT JOIN/CROSS
 * JOIN, WITH (including RECURSIVE), UNION ALL, LATERAL and scalar subqueries,
 * INSERT (VALUES or SELECT) ... RETURNING, UPDATE ... FROM, `=`, `<>`, IS [NOT] NULL,
 * IS [NOT] DISTINCT FROM, IN and `= any`.
 * A comparison it cannot read is ignored rather than guessed, which can only
 * let more rows through: a test that asserts a withdrawn row is absent still
 * fails when the predicate keeping it out is removed.
 */

export type Row = Record<string, unknown>;
type Env = Record<string, Row>;
type Params = readonly unknown[];

type Operand =
  | { kind: 'column'; alias: string | null; column: string }
  | { kind: 'param'; index: number }
  | { kind: 'literal'; value: string }
  | { kind: 'null' }
  | { kind: 'list'; values: string[] };

type Comparison = { left: Operand; operator: string; right: Operand };

type Source = {
  alias: string;
  table: string | null;
  body: string | null;
  optional: boolean;
};

const IDENTIFIER = '[a-z_][a-z0-9_]*';

const SOURCE_KEYWORDS = new Set([
  'as',
  'on',
  'where',
  'group',
  'order',
  'limit',
  'offset',
  'union',
  'left',
  'right',
  'inner',
  'outer',
  'full',
  'cross',
  'join',
  'lateral',
  'returning',
  'for',
  'window',
  'having',
  'and',
  'or',
]);

function clean(sql: string): string {
  return sql
    .replace(/::[a-z_]+(\[\])?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split on a keyword or character that sits outside every bracket and quote. */
function splitTop(sql: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]!;
    if (quoted) {
      if (char === "'") quoted = false;
      continue;
    }
    if (char === "'") {
      quoted = true;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (depth === 0) {
      separator.lastIndex = index;
      const match = separator.exec(sql);
      if (match !== null && match.index === index) {
        parts.push(sql.slice(start, index));
        index += match[0].length - 1;
        start = index + 1;
      }
    }
  }
  parts.push(sql.slice(start));
  return parts;
}

function matchingParen(sql: string, open: number): number {
  let depth = 0;
  for (let index = open; index < sql.length; index += 1) {
    if (sql[index] === '(') depth += 1;
    else if (sql[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return sql.length;
}

function operand(text: string): Operand | null {
  const token = text.trim();
  if (token.length === 0) return null;
  if (/^null$/i.test(token)) return { kind: 'null' };
  if (/^(true|false)$/i.test(token)) return { kind: 'literal', value: token.toLowerCase() };
  if (/^\$\d+$/.test(token)) return { kind: 'param', index: Number(token.slice(1)) - 1 };
  if (/^'[\s\S]*'$/.test(token)) return { kind: 'literal', value: token.slice(1, -1) };
  const list = /^\(\s*([\s\S]+)\s*\)$/.exec(token);
  if (list !== null && list[1]!.includes("'")) {
    return {
      kind: 'list',
      values: [...list[1]!.matchAll(/'([^']*)'/g)].map((entry) => entry[1]!),
    };
  }
  const qualified = new RegExp(`^(${IDENTIFIER})\\.(${IDENTIFIER})$`, 'i').exec(token);
  if (qualified !== null) {
    return { kind: 'column', alias: qualified[1]!.toLowerCase(), column: qualified[2]! };
  }
  if (new RegExp(`^${IDENTIFIER}$`, 'i').test(token) && !SOURCE_KEYWORDS.has(token.toLowerCase())) {
    return { kind: 'column', alias: null, column: token };
  }
  return null;
}

const TRAILING_CLAUSE =
  /\b(order\s+by|group\s+by|having|limit|offset|for\s+update|returning|union|on\s+conflict|window|from|join|left|right|inner|full|cross|natural|lateral)\b/i;

function comparisons(body: string): Comparison[] {
  const found: Comparison[] = [];
  // WHERE and ON both introduce conjuncts, so they separate exactly as AND does.
  // `is [not] distinct from` is one operator, collapsed so its FROM is not
  // mistaken for the start of a clause.
  const flattened = body
    .replace(/\bis\s+not\s+distinct\s+from\b/gi, 'isnotdistinctfrom')
    .replace(/\bis\s+distinct\s+from\b/gi, 'isdistinctfrom')
    .replace(/\bwhere\b|\bon\b/gi, ' and ');
  for (const raw of splitTop(flattened, /\band\b/gi)) {
    const piece = raw.split(TRAILING_CLAUSE)[0] ?? raw;
    const nullTest = new RegExp(
      `((?:${IDENTIFIER}\\.)?${IDENTIFIER})\\s+is\\s+(not\\s+)?null\\s*$`,
      'i',
    ).exec(piece.trim());
    if (nullTest !== null) {
      const left = operand(nullTest[1]!);
      if (left !== null) {
        found.push({
          left,
          operator: nullTest[2] === undefined ? 'is null' : 'is not null',
          right: { kind: 'null' },
        });
      }
      continue;
    }
    const distinct = /^([\s\S]+?)\s+is(not)?distinctfrom\s+([\s\S]+?)\s*$/i.exec(piece.trim());
    if (distinct !== null) {
      const left = operand(distinct[1]!);
      const right = operand(distinct[3]!);
      if (left !== null && right !== null) {
        found.push({
          left,
          operator: distinct[2] === undefined ? 'distinct' : 'not distinct',
          right,
        });
      }
      continue;
    }
    const anyTest = /^([\s\S]+?)\s*=\s*any\s*\(([\s\S]+)\)\s*$/i.exec(piece.trim());
    if (anyTest !== null) {
      const left = operand(anyTest[1]!);
      if (left !== null) {
        const right = operand(anyTest[2]!.trim());
        if (right !== null) found.push({ left, operator: 'any', right });
      }
      continue;
    }
    const inTest = /^([\s\S]+?)\s+in\s*(\([\s\S]+\))\s*$/i.exec(piece.trim());
    if (inTest !== null) {
      const left = operand(inTest[1]!);
      const right = inTest[2] === undefined ? null : operand(inTest[2]);
      if (left !== null && right !== null) found.push({ left, operator: 'in', right });
      continue;
    }
    const compare = /^([\s\S]+?)\s*(<>|!=|=)\s*([\s\S]+?)\s*$/.exec(piece.trim());
    if (compare === null) continue;
    const left = operand(compare[1]!);
    const right = operand(compare[3]!);
    if (left === null || right === null) continue;
    found.push({ left, operator: compare[2] === '=' ? '=' : '<>', right });
  }
  return found;
}

function sources(body: string): Source[] {
  const found: Source[] = [];
  const pattern = new RegExp(
    `\\b(from|(?:left\\s+|right\\s+|inner\\s+|full\\s+|cross\\s+)*join)\\s+(lateral\\s+)?` +
      `(\\(|(?:public\\s*\\.\\s*)?${IDENTIFIER})`,
    'gi',
  );
  const depths: number[] = [];
  let depth = 0;
  let quoted = false;
  for (const char of body) {
    depths.push(depth);
    if (quoted) {
      if (char === "'") quoted = false;
    } else if (char === "'") quoted = true;
    else if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
  }

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    // A FROM inside brackets belongs to a scalar subquery in the select list,
    // not to this statement's own source chain.
    if ((depths[match.index] ?? 0) > 0) continue;
    const optional = /left|full/i.test(match[1]!);
    let cursor = match.index + match[0].length;
    let table: string | null = null;
    let inner: string | null = null;
    if (match[3] === '(') {
      const close = matchingParen(body, cursor - 1);
      inner = body.slice(cursor, close);
      cursor = close + 1;
    } else {
      table = match[3]!.replace(/^public\s*\.\s*/i, '').toLowerCase();
    }
    const rest = body.slice(cursor);
    const alias = new RegExp(`^\\s*(?:as\\s+)?(${IDENTIFIER})`, 'i').exec(rest);
    const named =
      alias !== null && !SOURCE_KEYWORDS.has(alias[1]!.toLowerCase())
        ? alias[1]!.toLowerCase()
        : null;
    found.push({ alias: named ?? table ?? `sub${found.length}`, table, body: inner, optional });
    pattern.lastIndex = cursor;
  }
  return found;
}

/** `name as ( body )` pairs in front of the statement they feed. */
function commonTables(sql: string): {
  entries: Array<{ name: string; body: string }>;
  tail: string;
} {
  const head = /^\s*with\s+(recursive\s+)?/i.exec(sql);
  if (head === null) return { entries: [], tail: sql };
  const entries: Array<{ name: string; body: string }> = [];
  let cursor = head[0].length;
  for (;;) {
    const next = new RegExp(`\\s*(${IDENTIFIER})\\s+as\\s+(?:materialized\\s+)?\\(`, 'iy');
    next.lastIndex = cursor;
    const match = next.exec(sql);
    if (match === null) break;
    const open = cursor + match[0].length - 1 + (match.index - cursor);
    const close = matchingParen(sql, open);
    entries.push({ name: match[1]!.toLowerCase(), body: sql.slice(open + 1, close) });
    cursor = close + 1;
    const comma = /^\s*,/.exec(sql.slice(cursor));
    if (comma === null) break;
    cursor += comma[0].length;
  }
  return { entries, tail: sql.slice(cursor) };
}

function selectList(body: string): string {
  const start = /\bselect\b(?:\s+distinct(?:\s+on\s*\([^)]*\))?)?/i.exec(body);
  if (start === null) return '';
  const rest = body.slice(start.index + start[0].length);
  const [list] = splitTop(rest, /\bfrom\b/gi);
  return list ?? rest;
}

function outputName(expression: string, index: number): string {
  const named = new RegExp(`\\bas\\s+(${IDENTIFIER})\\s*$`, 'i').exec(expression);
  if (named !== null) return named[1]!;
  const qualified = new RegExp(`^\\s*(?:${IDENTIFIER}\\.)?(${IDENTIFIER})\\s*$`, 'i').exec(
    expression,
  );
  if (qualified !== null) return qualified[1]!;
  return `column${index}`;
}

let generated = 0;

export class StatementScanPostgres {
  readonly statements: string[] = [];
  private readonly tables = new Map<string, Row[]>();

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [table, rows] of Object.entries(seed)) {
      this.tables.set(
        table,
        rows.map((row) => ({ ...row })),
      );
    }
  }

  rowsIn(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  query = async <T>(sql: string, params: Params = []): Promise<T[]> => {
    this.statements.push(sql);
    return this.run(clean(sql), params, {}, new Map()) as T[];
  };

  execute = async (sql: string, params: Params = []): Promise<number> => {
    const rows = await this.query(sql, params);
    return rows.length;
  };

  transaction = async <T>(run: (tx: StatementScanPostgres) => Promise<T>): Promise<T> => run(this);

  private run(sql: string, params: Params, outer: Env, ctes: Map<string, Row[]>): Row[] {
    const { entries, tail } = commonTables(sql);
    const scope = new Map(ctes);
    for (const entry of entries) {
      scope.set(entry.name, this.commonTable(entry.name, entry.body, params, outer, scope));
    }

    const branches = splitTop(tail, /\bunion\s+all\b/gi);
    if (branches.length > 1) {
      return branches.flatMap((branch) => this.run(branch, params, outer, scope));
    }

    const insert = new RegExp(
      `^\\s*insert\\s+into\\s+(?:public\\s*\\.\\s*)?(${IDENTIFIER})\\s*\\(`,
      'i',
    ).exec(tail);
    if (insert !== null) return this.insert(tail, insert[1]!.toLowerCase(), params, outer, scope);

    if (/^\s*update\b/i.test(tail)) return this.update(tail, params, outer, scope);
    if (/^\s*delete\b/i.test(tail)) return [];
    return this.select(tail, params, outer, scope);
  }

  /**
   * A CTE that names itself is run to its fixed point, so a step that finds no
   * row ends the walk exactly where Postgres ends it.
   */
  private commonTable(
    name: string,
    body: string,
    params: Params,
    outer: Env,
    scope: Map<string, Row[]>,
  ): Row[] {
    const branches = splitTop(body, /\bunion(\s+all)?\b/gi);
    const steps = branches.slice(1).join(' ');
    if (branches.length < 2 || !new RegExp(`\\b${name}\\b`, 'i').test(steps)) {
      return this.run(body, params, outer, scope);
    }
    let rows = this.run(branches[0]!, params, outer, scope);
    const seen = new Set(rows.map((row) => JSON.stringify(row)));
    for (let step = 0; step < 50; step += 1) {
      scope.set(name, rows);
      const produced = branches
        .slice(1)
        .flatMap((branch) => this.run(branch, params, outer, scope))
        .filter((row) => !seen.has(JSON.stringify(row)));
      if (produced.length === 0) break;
      for (const row of produced) seen.add(JSON.stringify(row));
      rows = [...rows, ...produced];
    }
    scope.set(name, rows);
    return rows;
  }

  private update(sql: string, params: Params, outer: Env, ctes: Map<string, Row[]>): Row[] {
    const head = new RegExp(
      `^\\s*update\\s+(?:public\\s*\\.\\s*)?(${IDENTIFIER})(?:\\s+as)?(?:\\s+(${IDENTIFIER}))?\\s+set\\s+`,
      'i',
    ).exec(sql);
    if (head === null) return [];
    const alias = head[2] !== undefined && head[2].toLowerCase() !== 'set' ? head[2] : head[1]!;
    const body = sql.slice(head[0].length);
    // Everything from the first FROM or WHERE onwards is the statement that
    // chooses the rows, keyword included, so an UPDATE ... FROM keeps its join.
    const assignments = splitTop(body, /\bwhere\b|\bfrom\b/gi)[0] ?? '';
    const rest = body.slice(assignments.length);
    const envs = this.select(`select * from ${head[1]} ${alias} ${rest}`, params, outer, ctes);
    const touched = (this.tables.get(head[1]!.toLowerCase()) ?? []).filter((row) =>
      envs.some((candidate) => candidate['id'] === row['id']),
    );
    for (const item of splitTop(assignments, /,/g)) {
      const pair = new RegExp(`^\\s*(${IDENTIFIER})\\s*=\\s*([\\s\\S]+)$`, 'i').exec(item);
      if (pair === null) continue;
      for (const row of touched) {
        row[pair[1]!] = this.value(pair[2]!, { [alias]: row }, params, ctes);
      }
    }
    return touched;
  }

  private insert(
    sql: string,
    table: string,
    params: Params,
    outer: Env,
    ctes: Map<string, Row[]>,
  ): Row[] {
    const open = sql.indexOf('(');
    const close = matchingParen(sql, open);
    const columns = sql
      .slice(open + 1, close)
      .split(',')
      .map((column) => column.trim());
    const [source, returned] = splitTop(sql.slice(close + 1), /\breturning\b/gi);
    const values = /^\s*values\s*\(/i.exec(source ?? '');
    const rows =
      values === null
        ? this.select(source ?? '', params, outer, ctes, columns)
        : [
            this.literalRow(
              source!,
              values.index + values[0].length - 1,
              columns,
              params,
              outer,
              ctes,
            ),
          ];
    const target = this.tables.get(table) ?? [];
    for (const row of rows) target.push({ ...row });
    this.tables.set(table, target);
    if (returned === undefined) return [];
    return rows.map((row) => {
      const projected: Row = {};
      for (const [index, item] of splitTop(returned, /,/g).entries()) {
        projected[outputName(item, index)] = row[outputName(item, index)];
      }
      return projected;
    });
  }

  private literalRow(
    source: string,
    open: number,
    columns: string[],
    params: Params,
    outer: Env,
    ctes: Map<string, Row[]>,
  ): Row {
    const items = splitTop(source.slice(open + 1, matchingParen(source, open)), /,/g);
    const row: Row = {};
    for (const [index, column] of columns.entries()) {
      const item = items[index];
      if (item !== undefined) row[column] = this.value(item, outer, params, ctes);
    }
    return row;
  }

  private select(
    body: string,
    params: Params,
    outer: Env,
    ctes: Map<string, Row[]>,
    columnNames?: string[],
  ): Row[] {
    const tests = comparisons(body);
    let envs: Env[] = [{ ...outer }];
    for (const source of sources(body)) {
      const next: Env[] = [];
      for (const env of envs) {
        const candidates =
          source.body !== null
            ? this.run(source.body, params, env, ctes)
            : (ctes.get(source.table!) ?? this.tables.get(source.table!) ?? []);
        const kept = candidates.filter((row) => {
          const trial: Env = { ...env, [source.alias]: row };
          if (source.table !== null) trial[source.table] = row;
          return tests
            .filter((test) => this.addresses(test, source, env))
            .every((test) => this.holds(test, trial, params));
        });
        if (kept.length === 0 && source.optional) {
          next.push({ ...env, [source.alias]: {} });
          continue;
        }
        for (const row of kept) {
          const bound: Env = { ...env, [source.alias]: row };
          if (source.table !== null) bound[source.table] = row;
          next.push(bound);
        }
      }
      envs = next;
    }

    const items = splitTop(selectList(body), /,/g).filter((item) => item.trim().length > 0);
    if (items.length === 1 && /^\s*count\s*\(\s*\*\s*\)/i.test(items[0]!)) {
      return [{ [columnNames?.[0] ?? outputName(items[0]!, 0)]: String(envs.length) }];
    }
    return envs.map((env) => {
      const row: Row = {};
      for (const [index, item] of items.entries()) {
        const spread = new RegExp(`^\\s*(?:(${IDENTIFIER})\\.)?\\*\\s*$`, 'i').exec(item);
        if (spread !== null) {
          const from =
            spread[1] === undefined ? Object.values(env) : [env[spread[1].toLowerCase()]];
          for (const source of from) Object.assign(row, source ?? {});
          continue;
        }
        row[columnNames?.[index] ?? outputName(item, index)] = this.value(item, env, params, ctes);
      }
      return row;
    });
  }

  /**
   * A comparison applies where the last name it reads comes into scope: the one
   * side names this source and every other side is already bound.
   */
  private addresses(test: Comparison, source: Source, bound: Env): boolean {
    const names = [source.alias, source.table].filter((name): name is string => name !== null);
    const mentions = (side: Operand): boolean =>
      side.kind === 'column' &&
      (side.alias === null
        ? source.table !== null && source.alias === source.table
        : names.includes(side.alias));
    const resolvable = (side: Operand): boolean =>
      side.kind !== 'column' ||
      side.alias === null ||
      names.includes(side.alias) ||
      Object.hasOwn(bound, side.alias);
    if (mentions(test.left)) return resolvable(test.right);
    if (mentions(test.right)) return resolvable(test.left);
    return false;
  }

  private holds(test: Comparison, env: Env, params: Params): boolean {
    const left = this.resolve(test.left, env, params);
    if (test.operator === 'is null') return left === null || left === undefined;
    if (test.operator === 'is not null') return left !== null && left !== undefined;
    const right = this.resolve(test.right, env, params);
    if (test.operator === 'distinct' || test.operator === 'not distinct') {
      const empty = (value: unknown) => value === null || value === undefined;
      const same =
        empty(left) || empty(right) ? empty(left) && empty(right) : String(left) === String(right);
      return test.operator === 'not distinct' ? same : !same;
    }
    if (test.operator === 'in' || test.operator === 'any') {
      const values = Array.isArray(right)
        ? right
        : test.right.kind === 'list'
          ? test.right.values
          : [right];
      return values.some((value) => String(value) === String(left));
    }
    const equal = left === null || right === null ? left === right : String(left) === String(right);
    return test.operator === '=' ? equal : !equal;
  }

  private resolve(source: Operand, env: Env, params: Params): unknown {
    if (source.kind === 'null') return null;
    if (source.kind === 'literal') return source.value;
    if (source.kind === 'list') return source.values;
    if (source.kind === 'param') return params[source.index] ?? null;
    if (source.alias !== null) return env[source.alias]?.[source.column] ?? null;
    for (const row of Object.values(env)) {
      if (Object.hasOwn(row, source.column)) return row[source.column];
    }
    return null;
  }

  /** What one select-list item evaluates to for the row it is being read on. */
  private value(expression: string, env: Env, params: Params, ctes: Map<string, Row[]>): unknown {
    const text = expression.replace(new RegExp(`\\s+as\\s+${IDENTIFIER}\\s*$`, 'i'), '').trim();
    if (/^gen_random_uuid\s*\(\s*\)$/i.test(text)) {
      generated += 1;
      return `generated-${generated}`;
    }
    const subquery = /\(\s*select\b/i.exec(text);
    if (subquery !== null) {
      const open = text.indexOf('(', subquery.index);
      const inner = text.slice(open + 1, matchingParen(text, open));
      const rows = this.run(clean(inner), params, env, ctes);
      if (/\bcount\s*\(/i.test(inner)) return rows.length;
      const values = rows
        .map((row) => Object.values(row)[0])
        .filter((value) => value !== undefined);
      if (/\bstring_agg\s*\(/i.test(inner)) return values.join('\n');
      return values[0] ?? (/coalesce/i.test(text) ? '' : null);
    }
    const parameter = /^\$(\d+)$/.exec(text);
    if (parameter !== null) return params[Number(parameter[1]) - 1] ?? null;
    if (/^'[\s\S]*'$/.test(text)) return text.slice(1, -1);
    const column = new RegExp(`(${IDENTIFIER})\\.(${IDENTIFIER})`, 'i').exec(text);
    if (column !== null) return env[column[1]!.toLowerCase()]?.[column[2]!] ?? null;
    const bare = new RegExp(`(${IDENTIFIER})`, 'i').exec(text);
    if (bare === null) return null;
    return this.resolve({ kind: 'column', alias: null, column: bare[1]! }, env, params);
  }
}
