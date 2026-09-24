import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const neonDir = resolve(import.meta.dirname);
const webRoot = resolve(neonDir, '..', '..');
const repoRoot = resolve(webRoot, '..', '..');

const RESERVATION_TABLE = 'managed_usage_requests';
const MAX_INITIAL_LEASE_SECONDS = 6 * 60 * 60;
const MAX_LEASE_FROM_CREATION_SECONDS = 24 * 60 * 60;
const STATUSES_THAT_HOLD_NOTHING = ['completed', 'released', 'outcome_unknown', 'declined'];

/**
 * Writers whose renewal has no ceiling measured from creation. Each is allowed
 * only for the reason given, and an entry that stops being needed fails below.
 */
const UNCAPPED_RENEWALS: Readonly<Record<string, string>> = {
  claim_video_generation_job:
    'a video reservation is held while its provider task is alive: the providers that cannot cancel may still deliver, and a task stalled past two hours raises an operator incident instead of refunding a video that can still arrive',
};

interface FunctionDefinition {
  file: string;
  body: string;
}

function migrationFiles(): string[] {
  return readdirSync(neonDir)
    .filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10) || a.localeCompare(b));
}

function withoutLineComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

/** The definition Postgres holds today: the last one in chain order wins, a drop removes it. */
function currentFunctionDefinitions(): Map<string, FunctionDefinition> {
  const current = new Map<string, FunctionDefinition>();
  const statement =
    /\bdrop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)|\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
  for (const file of migrationFiles()) {
    const sql = withoutLineComments(readFileSync(resolve(neonDir, file), 'utf8'));
    for (const match of sql.matchAll(statement)) {
      if (match[1]) {
        current.delete(match[1].toLowerCase());
        continue;
      }
      const name = (match[2] as string).toLowerCase();
      const rest = sql.slice(match.index);
      const tag = /\bas\s+(\$[a-z_]*\$)/i.exec(rest);
      if (!tag) throw new Error(`${file}: ${name} has no dollar-quoted body`);
      const bodyStart = tag.index + tag[0].length;
      const bodyEnd = rest.indexOf(tag[1] as string, bodyStart);
      if (bodyEnd < 0) throw new Error(`${file}: ${name} body is never closed`);
      current.set(name, { file, body: rest.slice(bodyStart, bodyEnd) });
    }
  }
  return current;
}

/** One expression, read up to the first comma, keyword or terminator outside parentheses. */
function readExpression(text: string, start: number): string {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') depth += 1;
    else if (char === ')') {
      if (depth === 0) return text.slice(start, index).trim();
      depth -= 1;
    } else if (depth === 0) {
      if (char === ',' || char === ';') return text.slice(start, index).trim();
      if (/^\s(where|returning|from)\b/i.test(text.slice(index, index + 12))) {
        return text.slice(start, index).trim();
      }
    }
  }
  return text.slice(start).trim();
}

function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index < list.length; index += 1) {
    const char = list[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(list.slice(from, index).trim());
      from = index + 1;
    }
  }
  parts.push(list.slice(from).trim());
  return parts;
}

function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('unbalanced parentheses');
}

/** Every expression a body assigns to a reservation's lease, from updates and inserts alike. */
function leaseAssignments(body: string): string[] {
  const assignments: string[] = [];
  const update = new RegExp(
    `update\\s+(?:public\\.)?${RESERVATION_TABLE}\\b[^;]*?\\bset\\b([\\s\\S]*?)(?:\\bwhere\\b|\\breturning\\b|;)`,
    'gi',
  );
  for (const match of body.matchAll(update)) {
    const setList = match[1] as string;
    for (const lease of setList.matchAll(/\blease_expires_at\s*=(?!=)/gi)) {
      assignments.push(readExpression(setList, (lease.index as number) + lease[0].length));
    }
  }
  const insert = new RegExp(`insert\\s+into\\s+(?:public\\.)?${RESERVATION_TABLE}\\s*\\(`, 'gi');
  for (const match of body.matchAll(insert)) {
    const columnsOpen = (match.index as number) + match[0].length - 1;
    const columnsClose = closingParen(body, columnsOpen);
    const columns = splitTopLevel(body.slice(columnsOpen + 1, columnsClose));
    const leaseColumn = columns.findIndex((column) => /^lease_expires_at$/i.test(column));
    if (leaseColumn < 0) continue;
    const valuesOpen = body.indexOf('(', body.toLowerCase().indexOf('values', columnsClose));
    const values = splitTopLevel(body.slice(valuesOpen + 1, closingParen(body, valuesOpen)));
    assignments.push(values[leaseColumn] as string);
  }
  return assignments;
}

function clampedCeiling(body: string, variable: string): number | null {
  const assignment = new RegExp(`\\b${variable}\\s*:=\\s*([^;]+);`, 'i').exec(body);
  if (!assignment) return null;
  const expression = assignment[1] as string;
  const least = /\bleast\s*\(/i.exec(expression);
  if (!least) return null;
  const open = least.index + least[0].length - 1;
  const bounds = splitTopLevel(expression.slice(open + 1, closingParen(expression, open)))
    .map((argument) => (/^\d+$/.test(argument) ? Number(argument) : null))
    .filter((bound): bound is number => bound !== null);
  return bounds.length > 0 ? Math.min(...bounds) : null;
}

type LeaseVerdict = 'initial' | 'renewal_capped' | 'renewal_uncapped' | 'unbounded';

function classifyLease(expression: string, body: string): LeaseVerdict {
  const normalized = expression.replace(/\s+/g, ' ').toLowerCase();
  const extendsExisting = /greatest\s*\([^)]*lease_expires_at/.test(normalized);
  const creationCeiling = /created_at \+ make_interval\(secs => (\d+)\)/.exec(normalized);
  if (normalized.startsWith('least(') && creationCeiling) {
    return Number(creationCeiling[1]) <= MAX_LEASE_FROM_CREATION_SECONDS
      ? 'renewal_capped'
      : 'unbounded';
  }
  if (extendsExisting) return 'renewal_uncapped';
  if (normalized === 'now()') return 'initial';
  const fresh = /^now\(\) \+ make_interval\(secs => ([a-z0-9_]+)\)$/.exec(normalized);
  if (!fresh) return 'unbounded';
  const horizon = fresh[1] as string;
  const ceiling = /^\d+$/.test(horizon) ? Number(horizon) : clampedCeiling(body, horizon);
  return ceiling !== null && ceiling <= MAX_INITIAL_LEASE_SECONDS ? 'initial' : 'unbounded';
}

function reservationStatuses(): string[] {
  const definition = readFileSync(
    resolve(neonDir, '0056_managed_usage_request_lifecycle.sql'),
    'utf8',
  );
  const table = new RegExp(
    `create table if not exists public\\.${RESERVATION_TABLE} \\(([\\s\\S]*?)\\n\\);`,
    'i',
  ).exec(definition);
  const statusCheck =
    /status text not null[^\n]*\n\s*check \(status = any \(array\[([\s\S]*?)\]\)\)/i.exec(
      table?.[1] ?? '',
    );
  return [...(statusCheck?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((match) => match[1] as string);
}

const definitions = currentFunctionDefinitions();
const leaseWriters = [...definitions.entries()]
  .map(([name, definition]) => ({
    name,
    file: definition.file,
    verdicts: leaseAssignments(definition.body).map((expression) => ({
      expression,
      verdict: classifyLease(expression, definition.body),
    })),
  }))
  .filter((writer) => writer.verdicts.length > 0);

describe('a managed usage reservation cannot be held indefinitely', () => {
  it('reads the whole migration chain and finds the functions that write a lease', () => {
    expect(definitions.size).toBeGreaterThan(100);
    expect(leaseWriters.map((writer) => writer.name)).toEqual(
      expect.arrayContaining([
        'reserve_managed_usage_request_microusd',
        'extend_managed_usage_request_provider_step_microusd',
      ]),
    );
  });

  it('bounds every lease a function writes, from now or from the reservation itself', () => {
    const unbounded = leaseWriters.flatMap((writer) =>
      writer.verdicts
        .filter(({ verdict }) => verdict === 'unbounded')
        .map(({ expression }) => `${writer.file} ${writer.name}: ${expression}`),
    );
    expect(unbounded).toEqual([]);
  });

  it('caps every renewal at a fixed age from creation, except the reasons listed', () => {
    const uncapped = leaseWriters
      .filter((writer) => writer.verdicts.some(({ verdict }) => verdict === 'renewal_uncapped'))
      .map((writer) => writer.name)
      .sort();
    expect(uncapped).toEqual(Object.keys(UNCAPPED_RENEWALS).sort());
    for (const reason of Object.values(UNCAPPED_RENEWALS))
      expect(reason.length).toBeGreaterThan(60);
  });

  it('sweeps every status that still holds credit once its lease has passed', () => {
    const recovery = definitions.get('recover_stale_managed_usage_requests');
    expect(recovery, 'the recovery sweep is defined').toBeDefined();
    const sweep =
      /where\s+request_row\.status\s+in\s+\(([^)]*)\)\s+and\s+request_row\.lease_expires_at\s*<=\s*now\(\)/i.exec(
        recovery?.body ?? '',
      );
    expect(sweep, 'the sweep selects on an expired lease').not.toBeNull();
    const swept = [...(sweep?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(
      (match) => match[1] as string,
    );

    const statuses = reservationStatuses();
    expect(statuses.length).toBeGreaterThan(STATUSES_THAT_HOLD_NOTHING.length);
    const holding = statuses.filter((status) => !STATUSES_THAT_HOLD_NOTHING.includes(status));
    expect(swept.sort()).toEqual(holding.sort());
  });

  it('runs the sweep on a schedule, ahead of the settlement queue it feeds', () => {
    const queue = definitions.get('process_credit_settlement_queue');
    expect(queue?.body).toMatch(/recover_stale_managed_usage_requests\s*\(/);

    const creditService = readFileSync(resolve(webRoot, 'lib/services/credit-service.ts'), 'utf8');
    expect(creditService).toMatch(/process_credit_settlement_queue\(/);
    const route = readFileSync(
      resolve(webRoot, 'app/api/cron/recover-reservations/route.ts'),
      'utf8',
    );
    expect(route).toMatch(/CreditService\.processPendingSettlements\(/);

    const crons =
      (
        JSON.parse(readFileSync(resolve(repoRoot, 'vercel.json'), 'utf8')) as {
          crons?: Array<{ path: string; schedule: string }>;
        }
      ).crons ?? [];
    const schedule = crons.find((cron) => cron.path === '/api/cron/recover-reservations')?.schedule;
    expect(schedule, 'the recovery sweep is scheduled').toBeDefined();
    const [minutes, hours] = (schedule as string).split(/\s+/);
    expect(hours).toBe('*');
    expect((minutes as string).split(',').length).toBeGreaterThanOrEqual(1);
  });
});
