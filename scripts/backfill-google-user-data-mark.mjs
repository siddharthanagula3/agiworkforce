#!/usr/bin/env node
// Marks every conversation that already holds Google user data, so turns in
// chats that predate web_conversations.google_user_data_at (migration 0344) are
// routed only to providers that keep inputs out of training. Runs after the
// migration applies, in short autocommitted batches walked by conversation id:
// no statement holds a lock for long, a stopped run resumes with --after, and a
// second run changes nothing because a marked row no longer matches.
//
//   node scripts/backfill-google-user-data-mark.mjs            dry run
//   node scripts/backfill-google-user-data-mark.mjs --apply    write
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// The Google connector ids and their directory server ids ('dir-' plus the first
// 12 hex of sha256(id)). apps/web/db/neon/google-user-data-mark-migration.test.ts
// fails when this drifts from GOOGLE_USER_DATA_CONNECTOR_IDS.
export const GOOGLE_CONNECTOR_SERVER_IDS = Object.freeze([
  'gmail',
  'google-calendar',
  'google-drive',
  'google-contacts',
  'google-sheets',
  'google-analytics',
  'youtube',
  'bigquery',
  'gcp',
  'google-compute-engine',
  'dir-576ba7c2e4ab',
  'dir-a1c2783788b8',
  'dir-f4165d77e160',
  'dir-c0893fb395ee',
  'dir-8d6cb37f3e99',
  'dir-96c8d8fbe3ae',
  'dir-24e6654bfd1a',
  'dir-764a51ba6de8',
  'dir-3347d0bdd97e',
  'dir-7079c01aa6bc',
]);

export const DEFAULT_BATCH_SIZE = 1000;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Any JSON key naming a connector or a connector list whose value holds a
 * Google id: research source lists and citations, and any shape this file does
 * not name. Over-marking only narrows routing, so the broad match is the safe
 * side.
 */
export function connectorMentionPattern(ids = GOOGLE_CONNECTOR_SERVER_IDS) {
  return `"(connectorId|connector_id|connector|connectors)"\\s*:\\s*(\\[[^\\]]*)?"(${ids
    .map(escapeRegex)
    .join('|')})"`;
}

function arrayAt(path) {
  return `case when jsonb_typeof(${path}) = 'array' then ${path} else '[]'::jsonb end`;
}

const SERVER_OF = (expression) => `substring(${expression} from '^mcp__([^_][^_]*)__')`;

// A user's own MCP server whose URL host is a Google domain, reached as
// 'custom-<short_id>'.
const GOOGLE_HOSTED_CUSTOM = (serverId) => `exists (
  select 1
    from public.user_custom_connectors cc
   where cc.user_id = c.user_id
     and ${serverId} = 'custom-' || cc.short_id
     and lower(substring(cc.url from '^[a-z]+://(?:[^/@]*@)?([^/:?#]+)'))
         ~ '(^|\\.)(googleapis|google|youtube)\\.com\\.?$'
)`;

// $3 is the id array, $4 the mention pattern.
const EVIDENCE = `(
  exists (
    select 1
      from public.web_messages m
     where m.conversation_id = c.id
       and (
         exists (
           select 1 from jsonb_array_elements(${arrayAt("m.metadata -> 'tools'")}) as tool(entry)
            where tool.entry ->> 'connectorId' = any ($3::text[])
               or ${SERVER_OF("tool.entry ->> 'name'")} = any ($3::text[])
               or ${GOOGLE_HOSTED_CUSTOM(SERVER_OF("tool.entry ->> 'name'"))}
         )
         or (
           (m.metadata -> 'toolInvocations' ->> 'observed') = 'true'
           and exists (
             select 1
               from jsonb_array_elements_text(${arrayAt("m.metadata -> 'toolInvocations' -> 'offered'")}) as offered(name)
              where ${SERVER_OF('offered.name')} = any ($3::text[])
                 or ${GOOGLE_HOSTED_CUSTOM(SERVER_OF('offered.name'))}
           )
         )
         or m.metadata -> 'mcpContext' -> 'prompt' ->> 'connectorId' = any ($3::text[])
         or exists (
           select 1
             from jsonb_array_elements(${arrayAt("m.metadata -> 'mcpContext' -> 'resources'")}) as resource(entry)
            where resource.entry ->> 'connectorId' = any ($3::text[])
         )
         or m.metadata::text ~ $4
       )
  )
  or exists (
    select 1
      from public.project_knowledge_files f
      join public.external_resource_references r on r.id = f.external_reference_id
     where c.project_id is not null
       and f.project_id::text = c.project_id
       and r.connector_id = any ($3::text[])
  )
  or exists (
    select 1
      from public.research_reports report
     where report.conversation_id = c.id
       and (report.citations::text ~ $4 or report.steps::text ~ $4)
  )
)`;

const BATCH = `select c.id::text as id
                 from public.web_conversations c
                where c.google_user_data_at is null
                  and c.id > $1::uuid
                order by c.id
                limit $2`;

export const APPLY_SQL = `with batch as (${BATCH}),
  marked as (
    update public.web_conversations c
       set google_user_data_at = now()
      from batch
     where c.id = batch.id::uuid
       and c.google_user_data_at is null
       and ${EVIDENCE}
    returning c.id
  )
  select (select max(id) from batch) as last_id,
         (select count(*)::int from batch) as scanned,
         (select count(*)::int from marked) as marked`;

export const DRY_RUN_SQL = `with batch as (${BATCH})
  select (select max(id) from batch) as last_id,
         (select count(*)::int from batch) as scanned,
         (select count(*)::int
            from public.web_conversations c
            join batch on c.id = batch.id::uuid
           where ${EVIDENCE}) as marked`;

export async function runBackfill({
  client,
  apply = false,
  batchSize = DEFAULT_BATCH_SIZE,
  after = ZERO_UUID,
  maxBatches = Number.POSITIVE_INFINITY,
  log = () => {},
}) {
  const sql = apply ? APPLY_SQL : DRY_RUN_SQL;
  const params = [GOOGLE_CONNECTOR_SERVER_IDS, connectorMentionPattern()];
  let cursor = after;
  let scanned = 0;
  let marked = 0;
  let batches = 0;
  while (batches < maxBatches) {
    const [row] = await client.query(sql, [cursor, batchSize, ...params]);
    const batchScanned = Number(row?.scanned ?? 0);
    if (batchScanned === 0 || !row?.last_id) break;
    batches += 1;
    scanned += batchScanned;
    marked += Number(row.marked ?? 0);
    cursor = row.last_id;
    log(`batch ${batches}: scanned=${batchScanned} marked=${row.marked} after=${cursor}`);
    if (batchScanned < batchSize) break;
  }
  return { scanned, marked, batches, cursor };
}

export function parseArgs(argv) {
  const args = { apply: false, batchSize: DEFAULT_BATCH_SIZE, after: ZERO_UUID };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--apply') args.apply = true;
    else if (flag === '--batch-size') args.batchSize = Number(argv[++index]);
    else if (flag === '--after') args.after = String(argv[++index] ?? '');
    else throw new Error(`Unknown argument "${flag}"`);
  }
  if (!Number.isInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > 5000) {
    throw new Error('--batch-size must be an integer from 1 to 5000');
  }
  if (!UUID_SHAPE.test(args.after)) throw new Error('--after must be a conversation id');
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  const databaseUrl = process.env['NEON_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('NEON_DATABASE_URL (or DATABASE_URL) must be set');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(databaseUrl);
  const client = { query: (text, params) => sql.query(text, params) };
  const outcome = await runBackfill({ client, ...args, log: (line) => console.log(line) });
  console.log(
    `${args.apply ? 'marked' : 'would mark'} ${outcome.marked} of ${outcome.scanned} unmarked ` +
      `conversations in ${outcome.batches} batch(es); resume with --after ${outcome.cursor}`,
  );
  if (!args.apply) console.log('Dry run. Re-run with --apply to write.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
