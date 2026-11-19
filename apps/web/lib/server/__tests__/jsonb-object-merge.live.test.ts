// @vitest-environment node
import { PostgresDatabaseAdapter } from '@agiworkforce/data-layer';
import { afterAll, describe, expect, it } from 'vitest';
import { jsonbObjectSql, mergeJsonbObjectSql } from '@/lib/server/jsonb-object-merge';

const liveDatabaseUrl = process.env['AGI_LIVE_DATABASE_URL'] ?? '';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLoopbackDatabase(connectionString: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(connectionString).hostname);
  } catch {
    return false;
  }
}

const live = isLoopbackDatabase(liveDatabaseUrl);
const database = live ? new PostgresDatabaseAdapter({ connectionString: liveDatabaseUrl }) : null;

afterAll(async () => {
  await database?.dispose();
});

async function objectOf(stored: string | null): Promise<unknown> {
  const [row] = await database!.query<{ value: unknown }>(
    `select ${jsonbObjectSql('$1::jsonb')} as value`,
    [stored],
  );
  return row?.value;
}

async function merged(stored: string | null, patch: string): Promise<unknown> {
  const [row] = await database!.query<{ value: unknown }>(
    `select ${mergeJsonbObjectSql('$1::jsonb', '$2::jsonb')} as value`,
    [stored, patch],
  );
  return row?.value;
}

// llm-guardrail-allow: needs a loopback AGI_LIVE_DATABASE_URL, which ci.yml js-verify sets for its test step; every case only selects over literals.
describe.skipIf(!live)('jsonbObjectSql against PostgreSQL', () => {
  it('reproduces the defect it guards: a plain merge onto JSON null builds an array', async () => {
    const [row] = await database!.query<{ value: unknown }>(
      `select 'null'::jsonb || '{"a": 1}'::jsonb as value`,
    );
    expect(row?.value).toEqual([null, { a: 1 }]);
  });

  it('reads SQL NULL, JSON null, a scalar, an array and an object as an object', async () => {
    expect(await objectOf(null)).toEqual({});
    expect(await objectOf('null')).toEqual({});
    expect(await objectOf('"stop"')).toEqual({});
    expect(await objectOf('[null, {"followUpSuggestions": ["Why?"]}]')).toEqual({
      followUpSuggestions: ['Why?'],
    });
    expect(await objectOf('[null, {"a": 1, "b": 1}, 3, {"a": 2}]')).toEqual({ a: 2, b: 1 });
    expect(await objectOf('[]')).toEqual({});
    expect(await objectOf('{"a": {"b": [1]}}')).toEqual({ a: { b: [1] } });
  });

  it('merges a patch onto every stored shape and always yields an object', async () => {
    const patch = '{"followUpSuggestions": ["Next?"]}';
    expect(await merged(null, patch)).toEqual({ followUpSuggestions: ['Next?'] });
    expect(await merged('null', patch)).toEqual({ followUpSuggestions: ['Next?'] });
    expect(await merged('7', patch)).toEqual({ followUpSuggestions: ['Next?'] });
    expect(await merged('[null, {"finishReason": "stop"}]', patch)).toEqual({
      finishReason: 'stop',
      followUpSuggestions: ['Next?'],
    });
    expect(await merged('{"finishReason": "stop"}', patch)).toEqual({
      finishReason: 'stop',
      followUpSuggestions: ['Next?'],
    });
  });
});
