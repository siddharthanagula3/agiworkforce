// A Postgres small enough to read and large enough to judge a WHERE clause. It
// knows nothing about holds, so dropping a scope lets the held row back in.

type Value = unknown;
type Row = Record<string, Value>;
type Env = Map<string, Row | null>;

interface Token {
  kind: 'word' | 'name' | 'string' | 'param' | 'punct' | 'number';
  value: string;
}

const KEYWORDS = new Set([
  'select',
  'from',
  'where',
  'and',
  'or',
  'not',
  'is',
  'null',
  'exists',
  'any',
  'join',
  'left',
  'inner',
  'on',
  'count',
  'delete',
  'returning',
  'as',
  'public',
  'with',
  'using',
  'in',
  'order',
  'by',
  'asc',
  'desc',
  'limit',
  'true',
  'false',
  'now',
  'interval',
  'make_interval',
  'days',
  'update',
  'set',
  'coalesce',
  'filter',
  'group',
  'distinct',
]);

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < sql.length) {
    const rest = sql.slice(index);
    const space = /^\s+/.exec(rest);
    if (space) {
      index += space[0].length;
      continue;
    }
    const cast = /^::[a-z_]+(\[\])?/i.exec(rest);
    if (cast) {
      index += cast[0].length;
      continue;
    }
    const digits = /^\d+/.exec(rest);
    if (digits) {
      tokens.push({ kind: 'number', value: digits[0] });
      index += digits[0].length;
      continue;
    }
    const param = /^\$\d+/.exec(rest);
    if (param) {
      tokens.push({ kind: 'param', value: param[0] });
      index += param[0].length;
      continue;
    }
    const text = /^'((?:[^']|'')*)'/.exec(rest);
    if (text) {
      tokens.push({ kind: 'string', value: (text[1] ?? '').replace(/''/g, "'") });
      index += text[0].length;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_*][A-Za-z0-9_]*)?/.exec(rest);
    if (name) {
      const lower = name[0].toLowerCase();
      tokens.push({ kind: KEYWORDS.has(lower) ? 'word' : 'name', value: lower });
      index += name[0].length;
      continue;
    }
    tokens.push({ kind: 'punct', value: rest.slice(0, 1) });
    index += 1;
  }
  return tokens;
}

/** `'30 days'` and friends, the only interval spellings these statements use. */
export function intervalMs(literal: string): number {
  const match = /^(\d+)\s*(day|days|hour|hours|minute|minutes)$/.exec(literal.trim());
  if (!match) throw new Error(`Unsupported interval ${literal}`);
  const size = { day: 86_400_000, hour: 3_600_000, minute: 60_000 };
  const unit = (match[2] ?? 'day').replace(/s$/, '') as keyof typeof size;
  return Number(match[1]) * size[unit];
}

type Predicate = (env: Env) => boolean;
type Operand = (env: Env) => Value;

interface JoinSpec {
  table: string;
  alias: string;
  left: boolean;
  on: Predicate;
}

interface SelectSpec {
  table: string;
  alias: string;
  joins: JoinSpec[];
  where: Predicate | null;
  /** The single column an `in (select ...)` compares against. */
  projection: string;
  limit: number | null;
  /** Target-list expressions the caller reads back, e.g. `exists (...) as held`. */
  computed: Array<{ name: string; predicate: Predicate }>;
  /** `count(*)` entries, each with the FILTER that narrows it or null. */
  aggregates: Array<{ name: string; filter: Predicate | null }>;
}

export class SqlSubsetParser {
  private position = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly params: readonly Value[],
    private readonly tables: ReadonlyMap<string, Row[]>,
  ) {}

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.position + offset];
  }

  private take(): Token {
    const token = this.tokens[this.position];
    if (!token) throw new Error('Unexpected end of statement');
    this.position += 1;
    return token;
  }

  private accept(value: string): boolean {
    if (this.peek()?.value !== value) return false;
    this.position += 1;
    return true;
  }

  private expect(value: string): void {
    if (!this.accept(value)) {
      throw new Error(`Expected ${value}, found ${this.peek()?.value ?? 'end of statement'}`);
    }
  }

  expression(): Predicate {
    let left = this.conjunction();
    while (this.accept('or')) {
      const right = this.conjunction();
      const previous = left;
      left = (env) => previous(env) || right(env);
    }
    return left;
  }

  private conjunction(): Predicate {
    let left = this.negation();
    while (this.accept('and')) {
      const right = this.negation();
      const previous = left;
      left = (env) => previous(env) && right(env);
    }
    return left;
  }

  private negation(): Predicate {
    if (this.accept('not')) {
      const inner = this.negation();
      return (env) => !inner(env);
    }
    return this.primary();
  }

  private primary(): Predicate {
    if (this.accept('(')) {
      const inner = this.expression();
      this.expect(')');
      return inner;
    }
    if (this.accept('exists')) {
      this.expect('(');
      const spec = this.select();
      this.expect(')');
      return (env) => this.rows(spec, env).length > 0;
    }
    return this.comparison();
  }

  private comparison(): Predicate {
    // A literal, e.g. the `where false` of a FILTER that can never match.
    if (this.peek()?.value === 'true' || this.peek()?.value === 'false') {
      const literal = this.take().value === 'true';
      return () => literal;
    }
    // A bare boolean column, e.g. `candidate.temporary_chat`.
    const next = this.peek(1);
    if (
      this.peek()?.kind === 'name' &&
      (next === undefined || ['and', 'or', ')', 'order', 'limit', 'group'].includes(next.value))
    ) {
      const column = this.operand();
      return (env) => column(env) === true;
    }

    const left = this.operand();
    if (this.accept('in')) {
      this.expect('(');
      const spec = this.select();
      this.expect(')');
      return (env) => {
        const wanted = left(env);
        return this.rows(spec, env).some((row) => {
          const source = row.get(spec.alias);
          return source !== null && source !== undefined && source[spec.projection] === wanted;
        });
      };
    }
    if (this.accept('is')) {
      const negated = this.accept('not');
      if (this.accept('distinct')) {
        this.expect('from');
        const other = this.operand();
        return (env) => {
          const a = left(env) ?? null;
          const b = other(env) ?? null;
          return negated ? a === b : a !== b;
        };
      }
      this.expect('null');
      return (env) => {
        const value = left(env);
        const isNull = value === null || value === undefined;
        return negated ? !isNull : isNull;
      };
    }
    if (this.peek()?.value === '<' && this.peek(1)?.value === '>') {
      this.expect('<');
      this.expect('>');
      const other = this.operand();
      return (env) => {
        const a = left(env);
        const b = other(env);
        if (a === null || a === undefined || b === null || b === undefined) return false;
        return a !== b;
      };
    }
    for (const operator of ['<', '>'] as const) {
      if (!this.accept(operator)) continue;
      const inclusive = this.accept('=');
      const bound = this.operand();
      return (env) => {
        const a = left(env);
        const b = bound(env);
        if (a === null || a === undefined || b === null || b === undefined) return false;
        const one = Date.parse(String(a));
        const two = Date.parse(String(b));
        const [x, y] =
          Number.isNaN(one) || Number.isNaN(two) ? [a as number, b as number] : [one, two];
        if (inclusive) return operator === '<' ? x <= y : x >= y;
        return operator === '<' ? x < y : x > y;
      };
    }
    if (this.accept('&')) {
      this.expect('&');
      const other = this.operand();
      return (env) => {
        const a = left(env);
        const b = other(env);
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        return a.some((value) => b.includes(value as never));
      };
    }
    this.expect('=');
    if (this.accept('any')) {
      this.expect('(');
      const array = this.operand();
      this.expect(')');
      return (env) => {
        const values = array(env);
        return Array.isArray(values) && values.includes(left(env) as never);
      };
    }
    const right = this.operand();
    return (env) => {
      const a = left(env);
      const b = right(env);
      if (a === null || a === undefined || b === null || b === undefined) return false;
      return a === b;
    };
  }

  private operand(): Operand {
    const base = this.operandTerm();
    // `now() - <interval>` is the only arithmetic these statements use, and
    // NOW is fixed so a cutoff is deterministic.
    if (this.accept('-')) {
      const shift = this.operandTerm();
      return (env) => {
        const raw = shift(env);
        const ms = typeof raw === 'number' ? raw : intervalMs(String(raw));
        return new Date(Date.parse(String(base(env))) - ms).toISOString();
      };
    }
    return base;
  }

  private operandTerm(): Operand {
    if (this.accept('now')) {
      this.expect('(');
      this.expect(')');
      return () => FakePostgres.NOW;
    }
    if (this.accept('true')) return () => true;
    if (this.accept('false')) return () => false;
    if (this.accept('interval')) {
      const literal = this.take().value;
      return () => intervalMs(literal);
    }
    if (this.accept('make_interval')) {
      this.expect('(');
      this.expect('days');
      this.accept('=');
      this.accept('>');
      const days = this.operandTerm();
      this.expect(')');
      return (env) => Number(days(env)) * 86_400_000;
    }
    const token = this.take();
    if (token.kind === 'number') {
      const value = Number(token.value);
      return () => value;
    }
    if (token.kind === 'string') {
      const value = token.value;
      return () => value;
    }
    if (token.kind === 'param') {
      const value = this.params[Number(token.value.slice(1)) - 1];
      return () => value ?? null;
    }
    if (token.kind === 'name' || token.kind === 'word') {
      const [alias, column] = token.value.includes('.')
        ? token.value.split('.')
        : [null, token.value];
      return (env) => {
        if (alias !== null) {
          if (!env.has(alias)) throw new Error(`Unknown alias ${alias}`);
          return env.get(alias)?.[column ?? ''] ?? null;
        }
        const carrying = [...env.values()].filter(
          (row) => row !== null && column !== undefined && column in row,
        );
        if (carrying.length === 0) return null;
        return carrying[0]?.[column ?? ''] ?? null;
      };
    }
    throw new Error(`Unexpected ${token.value} where a value was expected`);
  }

  select(): SelectSpec {
    this.expect('select');
    // Skip the target list, counting parens so a subquery's own FROM does not
    // end it, and remember the last column named so `in (select id ...)` knows
    // which one it is comparing.
    let depth = 0;
    let projection = '';
    const computed: Array<{ name: string; predicate: Predicate }> = [];
    const aggregates: Array<{ name: string; filter: Predicate | null }> = [];
    while (this.peek() && !(depth === 0 && this.peek()?.value === 'from')) {
      if (depth === 0 && ['exists', 'not'].includes(this.peek()?.value ?? '')) {
        const predicate = this.expression();
        this.expect('as');
        computed.push({ name: this.take().value, predicate });
        continue;
      }
      if (depth === 0 && this.peek()?.value === 'count') {
        this.expect('count');
        this.expect('(');
        this.expect('*');
        this.expect(')');
        let filter: Predicate | null = null;
        if (this.accept('filter')) {
          this.expect('(');
          this.expect('where');
          filter = this.expression();
          this.expect(')');
        }
        if (this.accept('as')) aggregates.push({ name: this.take().value, filter });
        else aggregates.push({ name: 'count', filter });
        this.accept(',');
        continue;
      }
      const token = this.take();
      if (token.value === '(') depth += 1;
      else if (token.value === ')') depth -= 1;
      else if (depth === 0 && token.kind === 'name' && projection === '') {
        projection = token.value.includes('.') ? (token.value.split('.')[1] ?? 'id') : token.value;
      }
    }
    this.expect('from');
    if (projection === '') projection = 'id';
    const { table, alias } = this.source();

    const joins: JoinSpec[] = [];
    for (;;) {
      const left = this.peek()?.value === 'left';
      if (left || this.peek()?.value === 'inner') this.position += 1;
      if (!this.accept('join')) break;
      const joined = this.source();
      this.expect('on');
      joins.push({ table: joined.table, alias: joined.alias, left, on: this.expression() });
    }

    const where = this.accept('where') ? this.expression() : null;

    if (this.accept('order')) {
      this.expect('by');
      while (this.peek() && !['limit', ')'].includes(this.peek()?.value ?? '')) this.position += 1;
    }
    let limit: number | null = null;
    if (this.accept('limit')) {
      const bound = this.operandTerm();
      limit = Number(bound(new Map()));
    }
    return { table, alias, joins, where, projection, limit, computed, aggregates };
  }

  private source(): { table: string; alias: string } {
    if (this.accept('public')) this.expect('.');
    const table = this.take().value.replace(/^public\./, '');
    let alias = table;
    this.accept('as');
    const next = this.peek();
    if (next && (next.kind === 'name' || next.kind === 'word') && !this.isClauseKeyword(next)) {
      alias = this.take().value;
    }
    return { table, alias };
  }

  private isClauseKeyword(token: Token): boolean {
    return ['where', 'on', 'join', 'left', 'inner', 'returning', 'and', 'or'].includes(token.value);
  }

  /** The rows a FROM with its joins produces, filtered by WHERE. */
  rows(spec: SelectSpec, outer: Env = new Map()): Env[] {
    let envs: Env[] = (this.tables.get(spec.table) ?? []).map((row) => {
      const env: Env = new Map(outer);
      env.set(spec.alias, row);
      return env;
    });

    for (const join of spec.joins) {
      const next: Env[] = [];
      for (const env of envs) {
        const candidates = (this.tables.get(join.table) ?? []).filter((row) => {
          const trial: Env = new Map(env);
          trial.set(join.alias, row);
          return join.on(trial);
        });
        if (candidates.length === 0) {
          if (!join.left) continue;
          const empty: Env = new Map(env);
          empty.set(join.alias, null);
          next.push(empty);
          continue;
        }
        for (const row of candidates) {
          const matched: Env = new Map(env);
          matched.set(join.alias, row);
          next.push(matched);
        }
      }
      envs = next;
    }

    const matched = spec.where === null ? envs : envs.filter((env) => spec.where?.(env) === true);
    return spec.limit === null ? matched : matched.slice(0, spec.limit);
  }
}

export class FakePostgres {
  readonly tables = new Map<string, Row[]>();
  readonly statements: string[] = [];

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [table, rows] of Object.entries(seed)) this.tables.set(table, [...rows]);
  }

  rowsIn(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  static NOW = '2026-09-20T00:00:00.000Z';

  query = async <T>(sql: string, params: readonly Value[] = []): Promise<T[]> => {
    this.statements.push(sql);
    const purge =
      /^\s*with\s+([a-z_]+)\s+as\s*\(([\s\S]*?)\)\s*delete\s+from\s+(?:public\s*\.\s*)?([a-z_]+)(?:\s+as)?\s+([a-z_]+)\s+using\s+\1\s+where\s+\4\.([a-z_]+)\s*=[\s\S]*$/i.exec(
        sql,
      );
    if (purge) {
      return this.runDelete(
        `delete from public.${purge[3]} ${purge[4]}
          where ${purge[4]}.${purge[5]} in (${purge[2]})`,
        params,
      ) as T[];
    }
    const cte = /^\s*with\s+[a-z_]+\s+as\s*\(([\s\S]*)\)\s*select([\s\S]*)$/i.exec(sql);
    if (cte) {
      const affected = await this.query<Record<string, Value>>(cte[1] ?? '', params);
      return (
        /count\s*\(\s*\*\s*\)/i.test(cte[2] ?? '') ? [{ count: affected.length }] : affected
      ) as T[];
    }
    if (/^\s*update\s+/i.test(sql)) return this.runUpdate(sql, params) as T[];
    if (/^\s*delete\s+from/i.test(sql)) return this.runDelete(sql, params) as T[];

    const parser = new SqlSubsetParser(tokenize(sql), params, this.tables);
    const spec = parser.select();
    const matched = parser.rows(spec);
    if (spec.aggregates.length > 0) {
      const counted: Row = {};
      for (const aggregate of spec.aggregates) {
        counted[aggregate.name] =
          aggregate.filter === null
            ? matched.length
            : matched.filter((env) => aggregate.filter?.(env) === true).length;
      }
      return [counted as unknown as T];
    }
    if (/count\s*\(\s*\*\s*\)/i.test(sql)) return [{ count: matched.length } as unknown as T];
    return matched.map((env) => {
      const row: Row = { ...(env.get(spec.alias) ?? {}) };
      for (const entry of spec.computed) row[entry.name] = entry.predicate(env);
      return row as unknown as T;
    });
  };

  execute = async (sql: string, params: readonly Value[] = []): Promise<void> => {
    await this.query(sql, params);
  };

  transaction = async <T>(run: (tx: FakePostgres) => Promise<T>): Promise<T> => run(this);

  /** `delete from public.T alias where <expr> returning <col>` */
  private runUpdate(sql: string, params: readonly Value[]): Row[] {
    const assignment = /^\s*update\s+(?:public\s*\.\s*)?([a-z_]+)\s+set\s+([a-z_]+)\s*=/i.exec(sql);
    if (!assignment) throw new Error('Unsupported UPDATE');
    const select = sql
      .replace(/^\s*update\s+/i, 'select * from ')
      .replace(/\s+set\s+[\s\S]*?where/i, ' where')
      .replace(/returning[\s\S]*$/i, '');
    const parser = new SqlSubsetParser(tokenize(select), params, this.tables);
    const spec = parser.select();
    const touched = parser.rows(spec).map((env) => env.get(spec.alias));
    for (const row of touched) {
      if (row) row[assignment[2] ?? ''] = FakePostgres.NOW;
    }
    return touched.filter((row): row is Row => row !== null && row !== undefined);
  }

  private runDelete(sql: string, params: readonly Value[]): Row[] {
    const select = sql
      .replace(/^\s*delete\s+from/i, 'select * from')
      .replace(
        /\susing\s+[a-z_]+\s+where\s+[a-z_]+\.[a-z_]+\s*=\s*[a-z_]+\.[a-z_]+/i,
        ' where true',
      )
      .replace(/returning[\s\S]*$/i, '');
    const parser = new SqlSubsetParser(tokenize(select), params, this.tables);
    const spec = parser.select();
    const doomed = new Set(parser.rows(spec).map((env) => env.get(spec.alias)));
    this.tables.set(
      spec.table,
      this.rowsIn(spec.table).filter((row) => !doomed.has(row)),
    );
    return [...doomed].filter((row): row is Row => row !== null && row !== undefined);
  }
}
