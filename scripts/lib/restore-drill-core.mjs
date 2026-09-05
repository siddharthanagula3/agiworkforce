import { MIGRATION_LEDGER_TABLE } from './neon-migrations.mjs';

export const CORE_TABLES = [
  'public.profiles',
  'public.organizations',
  'public.web_conversations',
  'public.connector_oauth_grants',
  'public.token_credits',
];

export { MIGRATION_LEDGER_TABLE };

export async function countTableRows(query, table) {
  const rows = await query(`select count(*)::int as count from ${table}`);
  return rows[0]?.count ?? null;
}

export async function tableExists(query, table) {
  const rows = await query('select to_regclass($1) as relation', [table]);
  return rows[0]?.relation != null;
}

export async function checkTablesPresent(query, tables) {
  const presence = {};
  const missing = [];
  for (const table of tables) {
    const present = await tableExists(query, table);
    presence[table] = present;
    if (!present) missing.push(table);
  }
  return { presence, missing };
}

export function compareCounts(sourceCounts, targetCounts, tables) {
  const comparisons = {};
  const mismatched = [];
  for (const table of tables) {
    const source = sourceCounts[table] ?? null;
    const target = targetCounts[table] ?? null;
    const match = source !== null && target !== null && source === target;
    comparisons[table] = { source, target, match };
    if (!match) mismatched.push(table);
  }
  return { comparisons, mismatched, pass: mismatched.length === 0 };
}

export function redactConnectionSummary(connectionString) {
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: url.port || null,
    database: url.pathname.replace(/^\//, ''),
  };
}
