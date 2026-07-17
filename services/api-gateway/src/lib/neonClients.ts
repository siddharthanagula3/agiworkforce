import { neon } from '@neondatabase/serverless';
import { createDatabaseClient, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { requireEnv } from '../env';
import { logger } from './logger';

type SqlClient = ReturnType<typeof neon>;
type QueryRows = Record<string, unknown>[];
type LooseDbRow = ReturnType<typeof JSON.parse>;

/**
 * Minimal shape the query builder needs from its executor: a parameterized
 * query method returning either a bare row array or `{ rows }` (both are
 * normalized by rowsFromResult() below). The service-role neon() HTTP client
 * and the RLS-capable data-layer DatabaseAdapter are both wrapped down to
 * this shape so NeonQueryBuilder/NeonDataClient never depend on which one is
 * live behind them.
 */
interface QueryExecutor {
  query(text: string, values: unknown[]): Promise<unknown>;
}

export interface DbError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export interface DbResult<T = LooseDbRow> {
  data: T | null;
  error: DbError | null;
  count?: number | null;
}

interface Filter {
  column: string;
  op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN' | 'IS' | 'IS NOT';
  value: unknown;
}

interface OrderBy {
  column: string;
  ascending: boolean;
}

interface SelectOptions {
  count?: 'exact';
  head?: boolean;
}

interface UpsertOptions {
  onConflict?: string;
  ignoreDuplicates?: boolean;
}

let serviceSql: SqlClient | null = null;

function getSql(): SqlClient {
  if (serviceSql) return serviceSql;
  serviceSql = neon(requireEnv('NEON_DATABASE_URL'));
  return serviceSql;
}

function toDbError(error: unknown): DbError {
  if (error && typeof error === 'object') {
    const err = error as { message?: unknown; code?: unknown; detail?: unknown; hint?: unknown };
    return {
      message: typeof err.message === 'string' ? err.message : String(error),
      code: typeof err.code === 'string' ? err.code : undefined,
      details: typeof err.detail === 'string' ? err.detail : undefined,
      hint: typeof err.hint === 'string' ? err.hint : undefined,
    };
  }
  return { message: String(error) };
}

function assertIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return `"${trimmed.replace(/"/g, '""')}"`;
}

function assertColumnList(columns: string): string {
  const trimmed = columns.trim();
  if (trimmed === '*' || trimmed.length === 0) return '*';
  if (trimmed.includes('(') || trimmed.includes(')')) return '*';
  return trimmed
    .split(',')
    .map((column) => assertIdentifier(column.trim()))
    .join(', ');
}

function whereClause(filters: Filter[], values: unknown[]): string {
  if (filters.length === 0) return '';
  const clauses = filters.map((filter) => {
    const column = assertIdentifier(filter.column);
    if (filter.op === 'IN') {
      const entries = Array.isArray(filter.value) ? filter.value : [];
      if (entries.length === 0) return 'FALSE';
      const placeholders = entries.map((entry) => {
        values.push(entry);
        return `$${values.length}`;
      });
      return `${column} IN (${placeholders.join(', ')})`;
    }
    if (filter.op === 'IS') {
      if (filter.value === null) return `${column} IS NULL`;
      if (filter.value === true) return `${column} IS TRUE`;
      if (filter.value === false) return `${column} IS FALSE`;
      values.push(filter.value);
      return `${column} IS NOT DISTINCT FROM $${values.length}`;
    }
    if (filter.op === 'IS NOT') {
      if (filter.value === null) return `${column} IS NOT NULL`;
      if (filter.value === true) return `${column} IS NOT TRUE`;
      if (filter.value === false) return `${column} IS NOT FALSE`;
      values.push(filter.value);
      return `${column} IS DISTINCT FROM $${values.length}`;
    }
    values.push(filter.value);
    return `${column} ${filter.op} $${values.length}`;
  });
  return ` WHERE ${clauses.join(' AND ')}`;
}

function rowsFromResult(result: unknown): QueryRows {
  if (Array.isArray(result)) return result as QueryRows;
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: QueryRows }).rows;
  }
  return [];
}

function normalizeRows<T = LooseDbRow>(rows: unknown[]): T[] {
  return rows as T[];
}

function payloadRows(values: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(values) ? values : [values];
  return rows.filter((row): row is Record<string, unknown> => {
    return typeof row === 'object' && row !== null && !Array.isArray(row);
  });
}

class NeonQueryBuilder<T = LooseDbRow> implements PromiseLike<DbResult<T[]>> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private selected = '*';
  private selectOptions: SelectOptions = {};
  private payload: unknown;
  private filters: Filter[] = [];
  private orderBy: OrderBy[] = [];
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private upsertOptions: UpsertOptions = {};

  constructor(
    private readonly sql: QueryExecutor,
    private readonly table: string,
  ) {}

  select(columns = '*', options: SelectOptions = {}): this {
    this.selected = columns;
    this.selectOptions = options;
    return this;
  }

  insert(values: unknown): this {
    this.op = 'insert';
    this.payload = values;
    return this;
  }

  update(values: unknown): this {
    this.op = 'update';
    this.payload = values;
    return this;
  }

  delete(): this {
    this.op = 'delete';
    return this;
  }

  upsert(values: unknown, options: UpsertOptions = {}): this {
    this.op = 'upsert';
    this.payload = values;
    this.upsertOptions = options;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: '=', value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ column, op: '!=', value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ column, op: '>', value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ column, op: '>=', value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ column, op: '<', value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ column, op: '<=', value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ column, op: 'IN', value: values });
    return this;
  }

  is(column: string, value: boolean | null): this {
    this.filters.push({ column, op: 'IS', value });
    return this;
  }

  not(
    column: string,
    operator: 'is' | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in',
    value: unknown,
  ): this {
    switch (operator) {
      case 'is':
        this.filters.push({ column, op: 'IS NOT', value });
        break;
      case 'eq':
        this.filters.push({ column, op: '!=', value });
        break;
      case 'neq':
        this.filters.push({ column, op: '=', value });
        break;
      case 'gt':
        this.filters.push({ column, op: '<=', value });
        break;
      case 'gte':
        this.filters.push({ column, op: '<', value });
        break;
      case 'lt':
        this.filters.push({ column, op: '>=', value });
        break;
      case 'lte':
        this.filters.push({ column, op: '>', value });
        break;
      case 'in':
        this.filters.push({ column, op: '!=', value });
        break;
    }
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}): this {
    this.orderBy.push({ column, ascending: options.ascending !== false });
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetValue = from;
    this.limitValue = Math.max(0, to - from + 1);
    return this;
  }

  async single(): Promise<DbResult<T>> {
    const result = await this.execute();
    if (result.error) return { data: null, error: result.error, count: result.count };
    const rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length !== 1) {
      return {
        data: null,
        error: { message: rows.length === 0 ? 'No rows returned' : 'Multiple rows returned' },
        count: result.count,
      };
    }
    return { data: rows[0] as T, error: null, count: result.count };
  }

  async maybeSingle(): Promise<DbResult<T>> {
    const result = await this.execute();
    if (result.error) return { data: null, error: result.error, count: result.count };
    const rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length > 1) {
      return { data: null, error: { message: 'Multiple rows returned' }, count: result.count };
    }
    return { data: (rows[0] as T | undefined) ?? null, error: null, count: result.count };
  }

  then<TResult1 = DbResult<T[]>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<DbResult<T[]>> {
    try {
      switch (this.op) {
        case 'select':
          return await this.executeSelect();
        case 'insert':
          return await this.executeInsert(false);
        case 'upsert':
          return await this.executeInsert(true);
        case 'update':
          return await this.executeUpdate();
        case 'delete':
          return await this.executeDelete();
      }
    } catch (error) {
      return { data: null, error: toDbError(error), count: null };
    }
  }

  private async executeSelect(): Promise<DbResult<T[]>> {
    const values: unknown[] = [];
    const table = assertIdentifier(this.table);
    const columns = assertColumnList(this.selected);
    const where = whereClause(this.filters, values);
    const order = this.orderBy.length
      ? ` ORDER BY ${this.orderBy
          .map((entry) => `${assertIdentifier(entry.column)} ${entry.ascending ? 'ASC' : 'DESC'}`)
          .join(', ')}`
      : '';
    const limit = this.limitValue !== null ? ` LIMIT ${Number(this.limitValue)}` : '';
    const offset = this.offsetValue !== null ? ` OFFSET ${Number(this.offsetValue)}` : '';

    let count: number | null = null;
    if (this.selectOptions.count === 'exact') {
      const countRows = rowsFromResult(
        await this.sql.query(`SELECT COUNT(*)::int AS count FROM ${table}${where}`, values),
      );
      count = Number((countRows[0] as { count?: unknown } | undefined)?.count ?? 0);
      if (this.selectOptions.head === true) {
        return { data: null, error: null, count };
      }
    }

    const rows = rowsFromResult(
      await this.sql.query(
        `SELECT ${columns} FROM ${table}${where}${order}${limit}${offset}`,
        values,
      ),
    );
    return { data: normalizeRows<T>(rows), error: null, count };
  }

  private async executeInsert(isUpsert: boolean): Promise<DbResult<T[]>> {
    const rows = payloadRows(this.payload);
    if (rows.length === 0) return { data: [], error: null, count: 0 };

    const table = assertIdentifier(this.table);
    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).sort();
    const values: unknown[] = [];
    const valueTuples = rows.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column] ?? null);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    const conflict = isUpsert ? this.upsertClause(columns) : '';
    const returning = assertColumnList(this.selected);
    const inserted = rowsFromResult(
      await this.sql.query(
        `INSERT INTO ${table} (${columns.map(assertIdentifier).join(', ')}) VALUES ${valueTuples.join(
          ', ',
        )}${conflict} RETURNING ${returning}`,
        values,
      ),
    );
    return { data: normalizeRows<T>(inserted), error: null, count: inserted.length };
  }

  private async executeUpdate(): Promise<DbResult<T[]>> {
    const row = payloadRows(this.payload)[0] ?? {};
    const columns = Object.keys(row).sort();
    const table = assertIdentifier(this.table);
    const values: unknown[] = [];
    const assignments = columns.map((column) => {
      values.push(row[column] ?? null);
      return `${assertIdentifier(column)} = $${values.length}`;
    });
    const where = whereClause(this.filters, values);
    const returning = assertColumnList(this.selected);

    const rows = rowsFromResult(
      await this.sql.query(
        `UPDATE ${table} SET ${assignments.join(', ')}${where} RETURNING ${returning}`,
        values,
      ),
    );
    return { data: normalizeRows<T>(rows), error: null, count: rows.length };
  }

  private async executeDelete(): Promise<DbResult<T[]>> {
    const values: unknown[] = [];
    const table = assertIdentifier(this.table);
    const where = whereClause(this.filters, values);
    const rows = rowsFromResult(
      await this.sql.query(`DELETE FROM ${table}${where} RETURNING *`, values),
    );
    return { data: normalizeRows<T>(rows), error: null, count: rows.length };
  }

  private upsertClause(columns: string[]): string {
    const conflictColumns = this.upsertOptions.onConflict
      ? this.upsertOptions.onConflict.split(',').map((column) => column.trim())
      : columns.includes('id')
        ? ['id']
        : columns;
    const target = conflictColumns.map(assertIdentifier).join(', ');

    if (this.upsertOptions.ignoreDuplicates) {
      return ` ON CONFLICT (${target}) DO NOTHING`;
    }

    const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
    if (updateColumns.length === 0) {
      return ` ON CONFLICT (${target}) DO NOTHING`;
    }

    return ` ON CONFLICT (${target}) DO UPDATE SET ${updateColumns
      .map((column) => `${assertIdentifier(column)} = EXCLUDED.${assertIdentifier(column)}`)
      .join(', ')}`;
  }
}

interface SystemAccessScope {
  purpose: SystemClientPurpose;
  tables: ReadonlySet<string>;
}

class NeonDataClient {
  constructor(
    private readonly sql: QueryExecutor,
    private readonly systemScope?: SystemAccessScope,
  ) {}

  from<T = LooseDbRow>(table: string): NeonQueryBuilder<T> {
    if (this.systemScope && !this.systemScope.tables.has(table)) {
      throw new Error(
        `System database purpose ${this.systemScope.purpose} is not authorized for table ${table}`,
      );
    }
    return new NeonQueryBuilder<T>(this.sql, table);
  }

  async rpc<T = LooseDbRow>(
    functionName: string,
    args: Record<string, unknown> = {},
  ): Promise<DbResult<T>> {
    if (this.systemScope) {
      return {
        data: null,
        error: {
          message: `System database purpose ${this.systemScope.purpose} is not authorized for RPC ${functionName}`,
        },
        count: null,
      };
    }
    try {
      const functionIdentifier = assertIdentifier(functionName);
      const values: unknown[] = [];
      const params = Object.entries(args).map(([key, value]) => {
        values.push(value);
        return `${assertIdentifier(key)} => $${values.length}`;
      });
      const sql = `SELECT * FROM ${functionIdentifier}(${params.join(', ')})`;
      const rows = rowsFromResult(await this.sql.query(sql, values));

      if (rows.length === 1 && Object.keys(rows[0] ?? {}).length === 1) {
        const [value] = Object.values(rows[0] ?? {});
        return { data: value as T, error: null, count: 1 };
      }

      return { data: rows as T, error: null, count: rows.length };
    } catch (error) {
      return { data: null, error: toDbError(error), count: null };
    }
  }
}

let systemClients = new Map<SystemClientPurpose, NeonDataClient>();

export type CloudDbClient = NeonDataClient;

export type SystemClientPurpose =
  | 'device-authorization'
  | 'gateway-health'
  | 'shadow-schema-compatibility';

const SYSTEM_TABLES: Record<SystemClientPurpose, ReadonlySet<string>> = {
  'device-authorization': new Set(['device_authorization_codes', 'profiles']),
  'gateway-health': new Set(['profiles']),
  'shadow-schema-compatibility': new Set([
    'agent_approval_requests',
    'chat_messages',
    'conversations',
    'device_pairings',
    'enterprise_audit_events',
    'messages',
    'organization_admin_policies',
    'organization_usage_ledger',
    'support_cases',
  ]),
};

/**
 * Return the privileged database connection for operations that cannot run as
 * an end user. Callers must name the purpose so service-role access remains
 * visible in review. User-owned canonical data must use getUserScopedClient.
 */
export function getSystemClient(_purpose: SystemClientPurpose): CloudDbClient {
  const existing = systemClients.get(_purpose);
  if (existing) return existing;
  const tables = SYSTEM_TABLES[_purpose];
  if (!tables) {
    throw new Error(`Unknown system database purpose: ${String(_purpose)}`);
  }
  const sql = getSql();
  const client = new NeonDataClient(
    { query: (text, values) => sql.query(text, values) },
    { purpose: _purpose, tables },
  );
  systemClients.set(_purpose, client);
  return client;
}

export interface UserAuth {
  /** Clerk or gateway-issued user id — must match the token's own `sub` claim. */
  userId: string;
  /**
   * Raw bearer token, ALREADY signature-verified by the caller. authenticateToken
   * (middleware/auth.ts) verifies it via Clerk verifyToken() or
   * jwt.verify(..., JWT_SECRET) and attaches the raw string as req.user.token —
   * that verification is the precondition withUser() below assumes. Never pass
   * an unverified token here.
   */
  token: string;
}

let rlsAdapter: DatabaseAdapter | null = null;

/**
 * Lazily construct the pooled, RLS-capable Neon adapter that backs
 * getUserScopedClient(). Deliberately separate from getSql() above: this uses
 * @neondatabase/serverless's WebSocket Pool (via @agiworkforce/data-layer's
 * NeonDatabaseAdapter) instead of the one-shot HTTP driver, because
 * `SET LOCAL` only persists for the lifetime of a held connection/transaction.
 *
 * `unsafeAllowUnverifiedJwtSubject: true` is safe here ONLY because every
 * caller of getUserScopedClient() is contractually required to pass a
 * UserAuth.token that was already signature-verified upstream — see the
 * UserAuth doc comment.
 */
function getRlsAdapter(): DatabaseAdapter {
  rlsAdapter ??= createDatabaseClient({
    provider: 'neon',
    connectionString: requireEnv('NEON_DATABASE_URL'),
    applicationName: 'agi-gateway-rls',
    unsafeAllowUnverifiedJwtSubject: true,
  });
  return rlsAdapter;
}

/**
 * Release the pooled RLS adapter's connections. Call on graceful shutdown
 * (SIGTERM) alongside closing the HTTP/WS servers. No-op if the adapter was
 * never constructed — most short-lived processes (e.g. tests) never touch
 * this lazy path.
 */
export async function disposeUserScopedClientPool(): Promise<void> {
  if (!rlsAdapter) return;
  await rlsAdapter.dispose();
}

/**
 * SECURITY (P1-GW-RLS, real fix): binds `auth.token` via
 * NeonDatabaseAdapter.withUser() (packages/platform/data-layer/src/adapters/neon.ts),
 * which runs every query as the NON-BYPASSRLS `app_rls` role with
 * `request.jwt.claim.sub` set to the token's own `sub` claim — the same
 * mechanism apps/web/lib/server/rls-db.ts uses in production. RLS policies
 * keyed on that GUC (0037_rls_user_isolation.sql and friends) now enforce
 * tenant isolation at the DATABASE level for tables that have one.
 *
 * This boundary is fail closed. Missing or malformed tokens throw before a
 * query is built. Connection, role, policy, and query failures are returned to
 * the caller as database errors by NeonQueryBuilder; they are never retried on
 * the privileged system connection. This deliberately turns RLS provisioning
 * drift into an observable request failure instead of silent tenant-boundary
 * bypass.
 */
export function getUserScopedClient(auth: UserAuth): CloudDbClient {
  if (!auth.token) {
    throw new Error('User-scoped database access requires a verified bearer token');
  }

  let userAdapter: DatabaseAdapter;
  try {
    userAdapter = getRlsAdapter().withUser(auth.token);
  } catch (err) {
    logger.error(
      { err, userId: auth.userId },
      'getUserScopedClient: refusing request because the verified token could not be bound',
    );
    throw new Error('User-scoped database access could not bind the verified token', {
      cause: err,
    });
  }

  return new NeonDataClient({
    query: (text, values) => userAdapter.query(text, values),
  });
}

export function _resetCloudDbForTests(): void {
  systemClients = new Map<SystemClientPurpose, NeonDataClient>();
  serviceSql = null;
  rlsAdapter = null;
}
