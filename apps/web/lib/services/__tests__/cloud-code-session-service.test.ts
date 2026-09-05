import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/e2b/runtime', () => ({ getE2BExecutor: vi.fn(), killE2BSession: vi.fn() }));
vi.mock('@/lib/e2b/egress-host-resolution', () => ({
  assertExtraEgressHostsResolveSafely: vi.fn(async () => undefined),
}));
const { managedCloudCodeSessionScope } = vi.hoisted(() => ({
  managedCloudCodeSessionScope: vi.fn(() => ({ scope: 'test' })),
}));
vi.mock('@/lib/e2b/session-store', () => ({
  managedCloudCodeSessionScope,
  CHAT_SANDBOX_NETWORK_ACCESS: 'trusted',
  deleteE2BSession: vi.fn(),
  getE2BSession: vi.fn(),
  saveE2BSession: vi.fn(),
  withUserSandboxLock: vi.fn(async (_scope: unknown, critical: () => Promise<unknown>) => ({
    locked: true,
    result: await critical(),
  })),
}));
vi.mock('@/lib/github-app', () => ({
  isGitHubAppConfigured: vi.fn(() => true),
  isGitHubInstallationLinkingAvailable: vi.fn(() => true),
  getInstallationAccessToken: vi.fn(),
  getPrDiff: vi.fn(),
  postIssueComment: vi.fn(),
  postPrReview: vi.fn(),
}));
vi.mock('@/lib/user-connector-tools', () => ({
  getUserGithubInstallations: vi.fn(async () => []),
}));
vi.mock('@/lib/e2b/templates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/e2b/templates')>();
  return {
    ...actual,
    listCloudCodeRuntimes: vi.fn(async () => [
      { id: 'claude', name: 'Claude Code' },
      { id: 'codex', name: 'Codex' },
      { id: 'droid', name: 'Droid' },
    ]),
  };
});

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getPlanMaxSandboxes, type CreateCloudCodeSessionInput } from '@agiworkforce/types';
import { CHAT_COMPLETIONS_FUNCTION_LIMIT_MS } from '@/lib/deadline-policy';
import { getE2BExecutor } from '@/lib/e2b/runtime';
import { getInstallationAccessToken } from '@/lib/github-app';
import { getUserGithubInstallations } from '@/lib/user-connector-tools';
import {
  CLOUD_CODE_RUN_LEASE_SECONDS,
  CloudCodeConflictError,
  CloudCodeLimitError,
  CloudCodeValidationError,
  claimCloudCodeSessionForRun,
  commitAndPushCloudCodeSession,
  createCloudCodeSession,
  releaseCloudCodeSessionAfterRun,
  runCloudCodeCommand,
  validateCreateCloudCodeSession,
  type CloudCodeOwner,
} from '@/lib/services/cloud-code-session-service';

const PLAN_TIER = 'basic';
const MAX_SESSIONS = getPlanMaxSandboxes(PLAN_TIER);
const ACTIVE_STATES = ['provisioning', 'ready', 'running'];

type StoredRow = {
  id: string;
  user_id: unknown;
  organization_id: unknown;
  request_id: unknown;
  title: unknown;
  repository_url: unknown;
  network_access: unknown;
  extra_hosts: unknown;
  state: unknown;
  workspace_path: unknown;
  last_error: unknown;
  run_lease_token: string | null;
  run_lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

interface TerminalRow {
  id: number;
  session_id: unknown;
  command: unknown;
  stdout: unknown;
  stderr: unknown;
  exit_code: unknown;
  started_at: unknown;
  completed_at: unknown;
}

/*
 * A very small SQL evaluator, enough for the statements this service emits.
 *
 * The fake adapter below used to decide behaviour by asking whether the SQL
 * contained a substring and then applying its own hand-written TypeScript in
 * place of the predicate. That catches a deleted predicate and nothing else:
 * rewriting the lease expiry to `now() + interval '999 days'` makes every LIVE
 * lease instantly reclaimable, two runs driving one sandbox, worse than the
 * wedge the feature fixes, and the suite stayed green. So the fake now parses
 * and executes the WHERE and SET the service actually emits. Anything it
 * cannot represent throws rather than being quietly approximated, so a rewrite
 * of these statements is loud instead of silently unasserted.
 */

type SqlValue =
  | { kind: 'null' }
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'timestamp'; value: number }
  | { kind: 'interval'; value: number }
  | { kind: 'array'; value: unknown[] };

const NULL_VALUE: SqlValue = { kind: 'null' };

const TIMESTAMP_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'closed_at',
  'run_lease_expires_at',
]);

const INTERVAL_UNIT_MS: Record<string, number> = {
  second: 1_000,
  seconds: 1_000,
  minute: 60_000,
  minutes: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
  day: 86_400_000,
  days: 86_400_000,
};

const COMPARISONS = new Set(['=', '<>', '!=', '<', '<=', '>', '>=']);
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, ' ');
}

function tokenize(sql: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < sql.length) {
    const char = sql[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "'") {
      let end = index + 1;
      while (end < sql.length && sql[end] !== "'") end += 1;
      if (end >= sql.length) throw new Error(`Fake adapter read an unterminated literal: ${sql}`);
      tokens.push(sql.slice(index, end + 1));
      index = end + 1;
      continue;
    }
    const pair = sql.slice(index, index + 2);
    if (['::', '=>', '<=', '>=', '<>', '!='].includes(pair)) {
      tokens.push(pair);
      index += 2;
      continue;
    }
    if ('=<>+-(),[]'.includes(char)) {
      tokens.push(char);
      index += 1;
      continue;
    }
    const word = /^[a-z_$][a-z0-9_$]*/i.exec(sql.slice(index));
    if (word) {
      tokens.push(word[0].toLowerCase());
      index += word[0].length;
      continue;
    }
    const number = /^\d+(?:\.\d+)?/.exec(sql.slice(index));
    if (number) {
      tokens.push(number[0]);
      index += number[0].length;
      continue;
    }
    throw new Error(`Fake adapter cannot tokenize '${char}' in: ${sql}`);
  }
  return tokens;
}

function literalValue(value: unknown, timestamp: boolean): SqlValue {
  if (value === null || value === undefined) return NULL_VALUE;
  if (Array.isArray(value)) return { kind: 'array', value };
  if (typeof value === 'number') return { kind: 'number', value };
  if (typeof value === 'string') {
    if (!timestamp) return { kind: 'text', value };
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) throw new Error(`Fake adapter read a bad timestamp: ${value}`);
    return { kind: 'timestamp', value: parsed };
  }
  throw new Error(`Fake adapter cannot represent the SQL value ${String(value)}`);
}

function storedValue(value: SqlValue): unknown {
  switch (value.kind) {
    case 'null':
      return null;
    case 'text':
      return value.value;
    case 'number':
      return value.value;
    case 'timestamp':
      return new Date(value.value).toISOString();
    default:
      throw new Error(`Fake adapter cannot store a ${value.kind}`);
  }
}

function numeric(value: SqlValue): number {
  if (value.kind === 'number' || value.kind === 'timestamp' || value.kind === 'interval') {
    return value.value;
  }
  throw new Error(`Fake adapter cannot order a ${value.kind}`);
}

function textOf(value: SqlValue): string {
  if (value.kind === 'text') return value.value;
  if (value.kind === 'number') return String(value.value);
  throw new Error(`Fake adapter cannot compare a ${value.kind} with text`);
}

function equalValues(left: SqlValue, right: SqlValue): boolean {
  if (left.kind === 'text' || right.kind === 'text') return textOf(left) === textOf(right);
  return numeric(left) === numeric(right);
}

/** Null propagates to false, which is how a WHERE clause treats SQL's unknown. */
function compareValues(operator: string, left: SqlValue, right: SqlValue): boolean {
  if (left.kind === 'null' || right.kind === 'null') return false;
  if (operator === '=') return equalValues(left, right);
  if (operator === '<>' || operator === '!=') return !equalValues(left, right);
  const first = numeric(left);
  const second = numeric(right);
  if (operator === '<') return first < second;
  if (operator === '<=') return first <= second;
  if (operator === '>') return first > second;
  if (operator === '>=') return first >= second;
  throw new Error(`Fake adapter cannot evaluate the operator '${operator}'`);
}

function addValues(operator: string, left: SqlValue, right: SqlValue): SqlValue {
  const signed = (base: number, offset: number) =>
    operator === '+' ? base + offset : base - offset;
  if (left.kind === 'timestamp' && right.kind === 'interval') {
    return { kind: 'timestamp', value: signed(left.value, right.value) };
  }
  if (left.kind === 'number' && right.kind === 'number') {
    return { kind: 'number', value: signed(left.value, right.value) };
  }
  throw new Error(`Fake adapter cannot apply '${operator}' to ${left.kind} and ${right.kind}`);
}

function intervalMs(literal: string): number {
  const match = /^(-?\d+(?:\.\d+)?)\s+([a-z]+)$/.exec(literal.trim());
  const unit = match?.[2] ? INTERVAL_UNIT_MS[match[2]] : undefined;
  if (!match?.[1] || unit === undefined) {
    throw new Error(`Fake adapter cannot read the interval '${literal}'`);
  }
  return Number(match[1]) * unit;
}

/** Parses and evaluates one clause against one row in a single pass. */
class SqlClause {
  private position = 0;

  constructor(
    private readonly tokens: string[],
    private readonly row: Record<string, unknown>,
    private readonly params: readonly unknown[],
    private readonly now: number,
  ) {}

  private peek(): string | undefined {
    return this.tokens[this.position];
  }

  private next(): string {
    const token = this.tokens[this.position];
    if (token === undefined) throw new Error('Fake adapter ran off the end of a SQL clause');
    this.position += 1;
    return token;
  }

  private expect(word: string): void {
    const token = this.next();
    if (token !== word) throw new Error(`Fake adapter expected '${word}' but read '${token}'`);
  }

  assertConsumed(): void {
    if (this.position !== this.tokens.length) {
      throw new Error(
        `Fake adapter left SQL unread: ${this.tokens.slice(this.position).join(' ')}`,
      );
    }
  }

  parseBoolean(): boolean {
    let value = this.parseConjunction();
    while (this.peek() === 'or') {
      this.next();
      const right = this.parseConjunction();
      value = value || right;
    }
    return value;
  }

  parseAssignments(): [string, SqlValue][] {
    const assignments: [string, SqlValue][] = [];
    for (;;) {
      const column = this.next();
      if (!IDENTIFIER.test(column)) throw new Error(`Fake adapter cannot assign to '${column}'`);
      this.expect('=');
      assignments.push([column, this.parseValue()]);
      if (this.peek() !== ',') break;
      this.next();
    }
    return assignments;
  }

  private parseConjunction(): boolean {
    let value = this.parseNegation();
    while (this.peek() === 'and') {
      this.next();
      const right = this.parseNegation();
      value = value && right;
    }
    return value;
  }

  private parseNegation(): boolean {
    if (this.peek() !== 'not') return this.parseComparison();
    this.next();
    return !this.parseNegation();
  }

  private parseComparison(): boolean {
    if (this.peek() === '(') {
      this.next();
      const grouped = this.parseBoolean();
      this.expect(')');
      return grouped;
    }
    const left = this.parseValue();
    const operator = this.next();
    if (operator === 'is') return this.parseIs(left);
    if (operator === 'in') return this.parseIn(left);
    if (!COMPARISONS.has(operator)) {
      throw new Error(`Fake adapter cannot evaluate the operator '${operator}'`);
    }
    if (operator === '=' && this.peek() === 'any') {
      this.next();
      this.expect('(');
      const array = this.parseValue();
      this.expect(')');
      return this.anyOf(left, array);
    }
    return compareValues(operator, left, this.parseValue());
  }

  private parseIs(left: SqlValue): boolean {
    const negated = this.peek() === 'not';
    if (negated) this.next();
    const token = this.next();
    if (token === 'null') return negated ? left.kind !== 'null' : left.kind === 'null';
    if (token !== 'distinct') throw new Error(`Fake adapter cannot evaluate 'is ${token}'`);
    this.expect('from');
    const right = this.parseValue();
    const equal =
      left.kind === 'null' || right.kind === 'null'
        ? left.kind === right.kind
        : equalValues(left, right);
    return negated ? equal : !equal;
  }

  private parseIn(left: SqlValue): boolean {
    this.expect('(');
    const candidates: SqlValue[] = [];
    for (;;) {
      candidates.push(this.parseValue());
      if (this.peek() !== ',') break;
      this.next();
    }
    this.expect(')');
    return candidates.some((candidate) => compareValues('=', left, candidate));
  }

  private anyOf(left: SqlValue, array: SqlValue): boolean {
    if (array.kind !== 'array') throw new Error("Fake adapter expected an array after '= any'");
    return array.value.some((candidate) =>
      compareValues('=', left, literalValue(candidate, false)),
    );
  }

  private parseValue(): SqlValue {
    let value = this.parseTerm();
    for (;;) {
      const operator = this.peek();
      if (operator !== '+' && operator !== '-') return value;
      this.next();
      value = addValues(operator, value, this.parseTerm());
    }
  }

  private parseTerm(): SqlValue {
    const value = this.parseAtom();
    while (this.peek() === '::') {
      this.next();
      this.next();
      if (this.peek() === '[') {
        this.next();
        this.expect(']');
      }
    }
    return value;
  }

  private parseAtom(): SqlValue {
    const token = this.next();
    if (token.startsWith("'")) {
      return { kind: 'text', value: token.slice(1, -1).replaceAll("''", "'") };
    }
    if (/^\$\d+$/.test(token)) return literalValue(this.params[Number(token.slice(1)) - 1], false);
    if (/^\d/.test(token)) return { kind: 'number', value: Number(token) };
    if (token === 'null') return NULL_VALUE;
    if (token === 'now') {
      this.expect('(');
      this.expect(')');
      return { kind: 'timestamp', value: this.now };
    }
    if (token === 'interval') {
      const literal = this.next();
      if (!literal.startsWith("'"))
        throw new Error(`Fake adapter cannot read 'interval ${literal}'`);
      return { kind: 'interval', value: intervalMs(literal.slice(1, -1)) };
    }
    if (token === 'make_interval') {
      this.expect('(');
      this.expect('secs');
      this.expect('=>');
      const seconds = this.parseValue();
      this.expect(')');
      if (seconds.kind !== 'number') {
        throw new Error(`Fake adapter cannot read make_interval(secs => ${seconds.kind})`);
      }
      return { kind: 'interval', value: seconds.value * 1_000 };
    }
    if (token === 'case') {
      this.expect('when');
      const condition = this.parseBoolean();
      this.expect('then');
      const consequent = this.parseValue();
      this.expect('else');
      const alternate = this.parseValue();
      this.expect('end');
      return condition ? consequent : alternate;
    }
    if (!IDENTIFIER.test(token)) throw new Error(`Fake adapter cannot evaluate '${token}'`);
    if (!(token in this.row)) throw new Error(`Fake adapter has no column '${token}'`);
    return literalValue(this.row[token], TIMESTAMP_COLUMNS.has(token));
  }
}

function clauseBetween(sql: string, opening: RegExp, closing: RegExp): string {
  const body = stripSqlComments(sql);
  const start = opening.exec(body);
  if (!start) throw new Error(`Fake adapter found no ${String(opening)} in: ${sql}`);
  const rest = body.slice(start.index + start[0].length);
  const end = closing.exec(rest);
  const clause = (end ? rest.slice(0, end.index) : rest).trim();
  if (!clause) throw new Error(`Fake adapter read an empty clause from: ${sql}`);
  return clause;
}

const WHERE_END = /\breturning\b|\border\s+by\b|\blimit\b/;

function matchesWhere(sql: string, row: StoredRow, params: readonly unknown[], now: number) {
  const clause = new SqlClause(
    tokenize(clauseBetween(sql, /\bwhere\b/, WHERE_END)),
    row,
    params,
    now,
  );
  const matched = clause.parseBoolean();
  clause.assertConsumed();
  return matched;
}

function applyAssignments(
  sql: string,
  row: StoredRow,
  params: readonly unknown[],
  now: number,
): void {
  const clause = new SqlClause(
    tokenize(clauseBetween(sql, /\bset\b/, /\bwhere\b/)),
    row,
    params,
    now,
  );
  // Every right-hand side reads the pre-update row, as Postgres does.
  const assignments = clause.parseAssignments();
  clause.assertConsumed();
  const target: Record<string, unknown> = row;
  for (const [column, value] of assignments) {
    if (!(column in row)) throw new Error(`Fake adapter has no column '${column}'`);
    target[column] = storedValue(value);
  }
}

function applyLimit(sql: string, rows: StoredRow[]): StoredRow[] {
  const limit = /\blimit\s+(\d+)/.exec(stripSqlComments(sql));
  return limit?.[1] ? rows.slice(0, Number(limit[1])) : rows;
}

interface FakeDb extends DatabaseAdapter {
  rows: StoredRow[];
  lockKeys: string[];
  /** Models wall-clock passing beyond a held lease without moving the suite's clock. */
  expireLease: (sessionId: string) => void;
}

function createFakeDb(): FakeDb {
  const rows: StoredRow[] = [];
  const terminalRows: TerminalRow[] = [];
  const lockKeys: string[] = [];
  const locks = new Map<string, Promise<void>>();
  let sequence = 0;

  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  async function acquire(key: string): Promise<() => void> {
    for (;;) {
      const held = locks.get(key);
      if (!held) break;
      await held;
    }
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = () => {
        locks.delete(key);
        resolve();
      };
    });
    locks.set(key, held);
    return release;
  }

  async function run<T>(
    sql: string,
    params: unknown[] = [],
    releases?: (() => void)[],
  ): Promise<T[]> {
    await tick();
    // One `now()` for the whole statement, as Postgres gives a statement.
    const now = Date.now();
    if (sql.includes('pg_advisory_xact_lock')) {
      if (!releases) throw new Error('advisory lock taken outside a transaction');
      const key = String(params[0]);
      lockKeys.push(key);
      releases.push(await acquire(key));
      return [] as T[];
    }
    if (sql.includes('insert into cloud_code_sessions')) {
      sequence += 1;
      const timestamp = new Date(now).toISOString();
      const row: StoredRow = {
        // Session ids are validated as UUIDs before any lookup runs.
        id: `0190a000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
        user_id: params[0],
        organization_id: params[1],
        request_id: params[2],
        title: params[3],
        repository_url: params[4],
        network_access: params[5],
        state: 'provisioning',
        workspace_path: params[6],
        extra_hosts: params[9],
        last_error: null,
        run_lease_token: null,
        run_lease_expires_at: null,
        created_at: timestamp,
        updated_at: timestamp,
        closed_at: null,
      };
      rows.push(row);
      return [row] as unknown as T[];
    }
    // Every remaining statement against cloud_code_sessions is answered by
    // running its own WHERE, including the lease predicate, whatever the
    // service currently emits, over the fixture rows.
    if (sql.includes('from cloud_code_sessions') && sql.includes('count(*)')) {
      const count = rows.filter((row) => matchesWhere(sql, row, params, now)).length;
      return [{ count }] as unknown as T[];
    }
    if (sql.includes('select *') && sql.includes('from cloud_code_sessions')) {
      const matched = rows.filter((row) => matchesWhere(sql, row, params, now));
      return applyLimit(sql, matched) as unknown as T[];
    }
    if (sql.includes('update cloud_code_sessions')) {
      const matched = rows.filter((row) => matchesWhere(sql, row, params, now));
      for (const row of matched) applyAssignments(sql, row, params, now);
      return matched as unknown as T[];
    }
    if (sql.includes('insert into cloud_code_terminal_entries')) {
      const entry: TerminalRow = {
        id: terminalRows.length + 1,
        session_id: params[0],
        command: params[3],
        stdout: params[4],
        stderr: params[5],
        exit_code: params[6],
        started_at: params[7],
        completed_at: params[8],
      };
      terminalRows.push(entry);
      return [entry] as unknown as T[];
    }
    throw new Error(`Unexpected SQL in fake adapter: ${sql}`);
  }

  function adapter(releases?: (() => void)[]): DatabaseAdapter {
    return {
      query: (sql, params) => run(sql, params, releases),
      execute: async (sql, params) => (await run(sql, params, releases)).length,
      transaction: async (fn) => {
        if (releases) throw new Error('nested transaction');
        const held: (() => void)[] = [];
        try {
          return await fn(adapter(held));
        } finally {
          for (const release of held) release();
        }
      },
      withUser: () => adapter(releases),
      withOrg: () => adapter(releases),
      dispose: async () => {},
    };
  }

  function expireLease(sessionId: string): void {
    const row = rows.find((candidate) => candidate.id === sessionId);
    if (!row) throw new Error(`No fake session row for ${sessionId}`);
    row.run_lease_expires_at = new Date(Date.now() - 1_000).toISOString();
  }

  return Object.assign(adapter(), { rows, lockKeys, expireLease });
}

function createInput(index: number): CreateCloudCodeSessionInput {
  return {
    requestId: `request-00${index}`,
    title: `Session ${index}`,
    networkAccess: 'none',
  } as CreateCloudCodeSessionInput;
}

const OWNER: CloudCodeOwner = { userId: 'user-1', organizationId: null };

function activeRows(db: FakeDb): StoredRow[] {
  return db.rows.filter((row) => ACTIVE_STATES.includes(String(row.state)));
}

describe('createCloudCodeSession quota enforcement', () => {
  beforeEach(() => {
    vi.mocked(getE2BExecutor).mockResolvedValue({
      runCommand: vi.fn(async () => ({ ok: true, stdout: '', stderr: '', exitCode: 0 })),
      pause: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    } as unknown as Awaited<ReturnType<typeof getE2BExecutor>>);
  });

  it('caps concurrent creates at the plan sandbox quota', async () => {
    const db = createFakeDb();
    const attempts = MAX_SESSIONS + 2;

    const settled = await Promise.allSettled(
      Array.from({ length: attempts }, (_, index) =>
        createCloudCodeSession(db, OWNER, createInput(index), PLAN_TIER),
      ),
    );

    const created = settled.filter((result) => result.status === 'fulfilled');
    const rejected = settled.filter((result) => result.status === 'rejected');
    expect(created).toHaveLength(MAX_SESSIONS);
    expect(activeRows(db)).toHaveLength(MAX_SESSIONS);
    expect(rejected).toHaveLength(attempts - MAX_SESSIONS);
    for (const result of rejected) {
      expect(result.reason).toBeInstanceOf(CloudCodeLimitError);
    }
    expect(db.lockKeys).toContain('-:user-1');
  });

  it('keys the quota lock on the organization when the owner is an organization', async () => {
    const db = createFakeDb();
    await createCloudCodeSession(
      db,
      { userId: 'user-1', organizationId: 'org-9' },
      createInput(0),
      PLAN_TIER,
    );
    expect(db.lockKeys).toEqual(['org-9:user-1']);
  });

  it('reuses the existing session for a repeated requestId without a second insert', async () => {
    const db = createFakeDb();
    const first = await createCloudCodeSession(db, OWNER, createInput(0), PLAN_TIER);
    const second = await createCloudCodeSession(db, OWNER, createInput(0), PLAN_TIER);

    expect(second.id).toBe(first.id);
    expect(db.rows).toHaveLength(1);
  });

  it('rejects a reused requestId that carries different session details', async () => {
    const db = createFakeDb();
    await createCloudCodeSession(db, OWNER, createInput(0), PLAN_TIER);

    await expect(
      createCloudCodeSession(db, OWNER, { ...createInput(0), title: 'Different title' }, PLAN_TIER),
    ).rejects.toBeInstanceOf(CloudCodeConflictError);
    expect(db.rows).toHaveLength(1);
  });
});

describe('createCloudCodeSession extra egress hosts', () => {
  beforeEach(() => {
    managedCloudCodeSessionScope.mockClear();
    vi.mocked(getE2BExecutor).mockResolvedValue({
      runCommand: vi.fn(async () => ({ ok: true, stdout: '', stderr: '', exitCode: 0 })),
      pause: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    } as unknown as Awaited<ReturnType<typeof getE2BExecutor>>);
  });

  it('rejects an invalid extra host at validation time', () => {
    expect(() =>
      validateCreateCloudCodeSession({
        ...createInput(0),
        extraHosts: ['not a host'],
      }),
    ).toThrow(CloudCodeValidationError);
  });

  it('rejects more than the named maximum of extra hosts', () => {
    expect(() =>
      validateCreateCloudCodeSession({
        ...createInput(0),
        extraHosts: Array.from({ length: 11 }, (_, i) => `host-${i}.example.com`),
      }),
    ).toThrow(CloudCodeValidationError);
  });

  it('normalizes and forwards extra hosts to the sandbox scope', async () => {
    const db = createFakeDb();
    await createCloudCodeSession(
      db,
      OWNER,
      { ...createInput(0), extraHosts: ['Example.com', 'example.com'] },
      PLAN_TIER,
    );

    expect(managedCloudCodeSessionScope).toHaveBeenCalledWith(
      OWNER.userId,
      expect.any(String),
      'none',
      PLAN_TIER,
      null,
      null,
      ['example.com'],
    );
  });

  it('persists the normalized extra hosts and returns them from the created session', async () => {
    const db = createFakeDb();
    const session = await createCloudCodeSession(
      db,
      OWNER,
      { ...createInput(0), extraHosts: ['Example.com', 'example.com', 'other.example.com'] },
      PLAN_TIER,
    );

    expect(session.extraHosts.slice().sort()).toEqual(['example.com', 'other.example.com']);
  });

  it('reports no extra hosts for a session created without any', async () => {
    const db = createFakeDb();
    const session = await createCloudCodeSession(db, OWNER, createInput(0), PLAN_TIER);

    expect(session.extraHosts).toEqual([]);
  });

  it('reuses the session unchanged when a retried requestId repeats the same extra hosts', async () => {
    const db = createFakeDb();
    const first = await createCloudCodeSession(
      db,
      OWNER,
      { ...createInput(0), extraHosts: ['example.com'] },
      PLAN_TIER,
    );
    const second = await createCloudCodeSession(
      db,
      OWNER,
      { ...createInput(0), extraHosts: ['example.com'] },
      PLAN_TIER,
    );

    expect(second.id).toBe(first.id);
    expect(db.rows).toHaveLength(1);
  });

  it('reuses the session when a retried requestId repeats the same hosts in a different order', async () => {
    const db = createFakeDb();
    const first = await createCloudCodeSession(
      db,
      OWNER,
      { ...createInput(0), extraHosts: ['a.example.com', 'b.example.com'] },
      PLAN_TIER,
    );
    const second = await createCloudCodeSession(
      db,
      OWNER,
      { ...createInput(0), extraHosts: ['b.example.com', 'a.example.com'] },
      PLAN_TIER,
    );

    expect(second.id).toBe(first.id);
    expect(db.rows).toHaveLength(1);
  });

  it('rejects a reused requestId that changes the extra hosts, as a conflict rather than a silent no-op', async () => {
    const db = createFakeDb();
    await createCloudCodeSession(
      db,
      OWNER,
      { ...createInput(0), extraHosts: ['example.com'] },
      PLAN_TIER,
    );

    await expect(
      createCloudCodeSession(
        db,
        OWNER,
        { ...createInput(0), extraHosts: ['different.example.com'] },
        PLAN_TIER,
      ),
    ).rejects.toBeInstanceOf(CloudCodeConflictError);
    expect(db.rows).toHaveLength(1);
  });

  it('rejects a reused requestId that drops a previously requested extra host', async () => {
    const db = createFakeDb();
    await createCloudCodeSession(
      db,
      OWNER,
      { ...createInput(0), extraHosts: ['example.com'] },
      PLAN_TIER,
    );

    await expect(
      createCloudCodeSession(db, OWNER, { ...createInput(0), extraHosts: [] }, PLAN_TIER),
    ).rejects.toBeInstanceOf(CloudCodeConflictError);
  });
});

describe('createCloudCodeSession codex proxy bootstrap', () => {
  const originalAppUrl = process.env['NEXT_PUBLIC_APP_URL'];
  let writeFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://app.agiworkforce.test';
    writeFile = vi.fn(async () => ({ ok: true, output: '' }));
    vi.mocked(getE2BExecutor).mockResolvedValue({
      runCommand: vi.fn(async () => ({ ok: true, stdout: '', stderr: '', exitCode: 0 })),
      writeFile,
      pause: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    } as unknown as Awaited<ReturnType<typeof getE2BExecutor>>);
  });

  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env['NEXT_PUBLIC_APP_URL'];
    else process.env['NEXT_PUBLIC_APP_URL'] = originalAppUrl;
  });

  it('writes a codex config.toml pointing at the session proxy root and the credential env var, once at creation', async () => {
    const db = createFakeDb();
    const session = await createCloudCodeSession(
      db,
      OWNER,
      { ...createInput(0), runtimeId: 'codex' },
      PLAN_TIER,
    );

    expect(writeFile).toHaveBeenCalledTimes(1);
    const call = writeFile.mock.calls[0]![0] as { path: string; content: string };
    expect(call.path).toBe('/home/user/.codex/config.toml');
    expect(call.content).toContain(
      `base_url = "https://app.agiworkforce.test/api/code/sessions/${session.id}/provider-proxy"`,
    );
    expect(call.content).toContain('env_key = "CODEX_API_KEY"');
    expect(call.content).toContain('wire_api = "responses"');
  });

  it('does not write a config file for claude, which the proxy covers through an env var instead', async () => {
    const db = createFakeDb();
    await createCloudCodeSession(db, OWNER, { ...createInput(1), runtimeId: 'claude' }, PLAN_TIER);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('does not write a config file for a harness the proxy does not cover at all', async () => {
    const db = createFakeDb();
    await createCloudCodeSession(db, OWNER, { ...createInput(2), runtimeId: 'droid' }, PLAN_TIER);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('skips the config file once the caller brings an explicit harness credential', async () => {
    const db = createFakeDb();
    await createCloudCodeSession(
      db,
      OWNER,
      { ...createInput(3), runtimeId: 'codex', harnessCredential: 'sk-user-openai-key' },
      PLAN_TIER,
    );
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('cloud code session run lease', () => {
  beforeEach(() => {
    vi.mocked(getE2BExecutor).mockResolvedValue({
      runCommand: vi.fn(async () => ({ ok: true, stdout: 'out', stderr: '', exitCode: 0 })),
      pause: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    } as unknown as Awaited<ReturnType<typeof getE2BExecutor>>);
  });

  async function readySession(db: FakeDb): Promise<string> {
    const session = await createCloudCodeSession(db, OWNER, createInput(0), PLAN_TIER);
    expect(session.state).toBe('ready');
    return session.id;
  }

  function storedRow(db: FakeDb, sessionId: string): StoredRow {
    const row = db.rows.find((candidate) => candidate.id === sessionId);
    if (!row) throw new Error(`No fake session row for ${sessionId}`);
    return row;
  }

  it('outlives the longest turn the platform will let run', () => {
    // The agent route declares maxDuration = 300, tied to this same limit. The
    // lease clock starts at claim time, strictly after the request began, so a
    // TTL above the platform's kill point means a live turn can never lose its
    // session to a second claimant.
    expect(CLOUD_CODE_RUN_LEASE_SECONDS * 1_000).toBeGreaterThan(
      CHAT_COMPLETIONS_FUNCTION_LIMIT_MS,
    );
  });

  it('records a bounded lease when a run claims a ready session', async () => {
    const db = createFakeDb();
    const sessionId = await readySession(db);

    const claim = await claimCloudCodeSessionForRun(db, OWNER, sessionId);

    expect(claim).not.toBeNull();
    expect(claim?.session.state).toBe('running');
    const row = storedRow(db, sessionId);
    expect(row.run_lease_token).toBe(claim?.leaseToken);
    expect(Date.parse(String(row.run_lease_expires_at))).toBeGreaterThan(Date.now());
  });

  it('refuses a second claim while the lease is still live', async () => {
    const db = createFakeDb();
    const sessionId = await readySession(db);
    const first = await claimCloudCodeSessionForRun(db, OWNER, sessionId);

    const second = await claimCloudCodeSessionForRun(db, OWNER, sessionId);

    expect(second).toBeNull();
    expect(storedRow(db, sessionId).run_lease_token).toBe(first?.leaseToken);
  });

  it('reclaims a session whose holder was killed before it could release', async () => {
    const db = createFakeDb();
    const sessionId = await readySession(db);
    const killed = await claimCloudCodeSessionForRun(db, OWNER, sessionId);
    // The run is SIGKILLed here: no release, no state change, lease left behind.
    db.expireLease(sessionId);

    const reclaimed = await claimCloudCodeSessionForRun(db, OWNER, sessionId);

    expect(reclaimed).not.toBeNull();
    expect(reclaimed?.leaseToken).not.toBe(killed?.leaseToken);
    expect(storedRow(db, sessionId).run_lease_token).toBe(reclaimed?.leaseToken);
  });

  it('returns the session to ready when its holder releases it', async () => {
    const db = createFakeDb();
    const sessionId = await readySession(db);
    const claim = await claimCloudCodeSessionForRun(db, OWNER, sessionId);

    const released = await releaseCloudCodeSessionAfterRun(
      db,
      OWNER,
      sessionId,
      String(claim?.leaseToken),
    );

    expect(released?.state).toBe('ready');
    const row = storedRow(db, sessionId);
    expect(row.run_lease_token).toBeNull();
    expect(row.run_lease_expires_at).toBeNull();
  });

  it('ignores a release from a run whose lease was already reclaimed', async () => {
    const db = createFakeDb();
    const sessionId = await readySession(db);
    const stale = await claimCloudCodeSessionForRun(db, OWNER, sessionId);
    db.expireLease(sessionId);
    const current = await claimCloudCodeSessionForRun(db, OWNER, sessionId);

    // The killed run somehow survives and reaches its `finally`.
    const released = await releaseCloudCodeSessionAfterRun(
      db,
      OWNER,
      sessionId,
      String(stale?.leaseToken),
    );

    expect(released).toBeNull();
    const row = storedRow(db, sessionId);
    expect(row.state).toBe('running');
    expect(row.run_lease_token).toBe(current?.leaseToken);
  });

  it('runs a command on a session wedged by a killed turn instead of reporting it busy', async () => {
    const db = createFakeDb();
    const sessionId = await readySession(db);
    await claimCloudCodeSessionForRun(db, OWNER, sessionId);
    db.expireLease(sessionId);

    const result = await runCloudCodeCommand(db, OWNER, sessionId, 'ls', PLAN_TIER);

    expect(result.session.state).toBe('ready');
    expect(result.terminalEntry.stdout).toBe('out');
    const row = storedRow(db, sessionId);
    expect(row.run_lease_token).toBeNull();
  });

  it('still reports a session busy while another run holds a live lease', async () => {
    const db = createFakeDb();
    const sessionId = await readySession(db);
    await claimCloudCodeSessionForRun(db, OWNER, sessionId);

    await expect(runCloudCodeCommand(db, OWNER, sessionId, 'ls', PLAN_TIER)).rejects.toThrow(
      new CloudCodeConflictError('Code session is busy; wait and try again'),
    );
  });
});

const REPO_URL = 'https://github.com/acme/widgets.git';

function repoInput(index: number): CreateCloudCodeSessionInput {
  return {
    requestId: `request-repo-${index}`,
    title: `Repo session ${index}`,
    networkAccess: 'trusted',
    repositoryUrl: REPO_URL,
  } as CreateCloudCodeSessionInput;
}

function gitExecutor() {
  return {
    runCommand: vi.fn(async () => ({ ok: true, stdout: '', stderr: '', exitCode: 0 })),
    git: {
      clone: vi.fn(async (_input: Record<string, unknown>) => ({
        ok: true,
        output: '',
        stdout: '',
        stderr: '',
        exitCode: 0,
      })),
      add: vi.fn(async () => ({ ok: true, output: '', stdout: '', stderr: '', exitCode: 0 })),
      commit: vi.fn(async () => ({ ok: true, output: '', stdout: '', stderr: '', exitCode: 0 })),
      push: vi.fn(async () => ({
        ok: true,
        output: 'pushed',
        stdout: 'pushed',
        stderr: '',
        exitCode: 0,
      })),
    },
    pause: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  };
}

describe('cloud code session GitHub App credentials', () => {
  beforeEach(() => {
    vi.mocked(getUserGithubInstallations).mockResolvedValue([]);
  });

  it('clones with the connected GitHub App installation token', async () => {
    const db = createFakeDb();
    const executor = gitExecutor();
    vi.mocked(getE2BExecutor).mockResolvedValue(
      executor as unknown as Awaited<ReturnType<typeof getE2BExecutor>>,
    );
    vi.mocked(getUserGithubInstallations).mockResolvedValue([
      { installationId: 42, login: 'acme' },
    ]);
    vi.mocked(getInstallationAccessToken).mockResolvedValue('installation-token');

    await createCloudCodeSession(db, OWNER, repoInput(0), PLAN_TIER);

    expect(executor.git.clone).toHaveBeenCalledWith(
      expect.objectContaining({
        url: REPO_URL,
        username: 'x-access-token',
        password: 'installation-token',
      }),
    );
  });

  it('clones anonymously when no installation covers the repository owner', async () => {
    const db = createFakeDb();
    const executor = gitExecutor();
    vi.mocked(getE2BExecutor).mockResolvedValue(
      executor as unknown as Awaited<ReturnType<typeof getE2BExecutor>>,
    );
    vi.mocked(getUserGithubInstallations).mockResolvedValue([]);

    await createCloudCodeSession(db, OWNER, repoInput(1), PLAN_TIER);

    const call = executor.git.clone.mock.calls[0]![0] as Record<string, unknown>;
    expect(call['username']).toBeUndefined();
    expect(call['password']).toBeUndefined();
  });
});

describe('commitAndPushCloudCodeSession', () => {
  async function readySession(
    db: FakeDb,
    executor: ReturnType<typeof gitExecutor>,
  ): Promise<string> {
    vi.mocked(getE2BExecutor).mockResolvedValue(
      executor as unknown as Awaited<ReturnType<typeof getE2BExecutor>>,
    );
    const session = await createCloudCodeSession(db, OWNER, repoInput(0), PLAN_TIER);
    expect(session.state).toBe('ready');
    return session.id;
  }

  it('refuses to push when no GitHub installation can authenticate the remote', async () => {
    const db = createFakeDb();
    const executor = gitExecutor();
    vi.mocked(getUserGithubInstallations).mockResolvedValue([]);
    const sessionId = await readySession(db, executor);

    await expect(
      commitAndPushCloudCodeSession(db, OWNER, sessionId, PLAN_TIER, 'fix things'),
    ).rejects.toBeInstanceOf(CloudCodeValidationError);
    expect(executor.git.push).not.toHaveBeenCalled();
  });

  it('stages, commits and pushes through the authenticated remote', async () => {
    const db = createFakeDb();
    const executor = gitExecutor();
    vi.mocked(getUserGithubInstallations).mockResolvedValue([{ installationId: 7, login: 'acme' }]);
    vi.mocked(getInstallationAccessToken).mockResolvedValue('push-token');
    const sessionId = await readySession(db, executor);

    const result = await commitAndPushCloudCodeSession(
      db,
      OWNER,
      sessionId,
      PLAN_TIER,
      'fix things',
    );

    expect(executor.git.add).toHaveBeenCalledWith(expect.objectContaining({ all: true }));
    expect(executor.git.commit).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'fix things' }),
    );
    expect(executor.git.push).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'x-access-token', password: 'push-token' }),
    );
    expect(result.session.state).toBe('ready');
    expect(result.push.stdout).toBe('pushed');
  });

  it('rejects an empty commit message', async () => {
    const db = createFakeDb();
    const executor = gitExecutor();
    vi.mocked(getUserGithubInstallations).mockResolvedValue([{ installationId: 7, login: 'acme' }]);
    vi.mocked(getInstallationAccessToken).mockResolvedValue('push-token');
    const sessionId = await readySession(db, executor);

    await expect(
      commitAndPushCloudCodeSession(db, OWNER, sessionId, PLAN_TIER, '  '),
    ).rejects.toBeInstanceOf(CloudCodeValidationError);
    expect(executor.git.add).not.toHaveBeenCalled();
  });
});
