import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  cascadingColumns,
  liveFunctionBodies,
  singleSourceMapping,
  stringArrayConst,
} from './lib/search-index-coverage.mjs';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-search-index-coverage.mjs',
);

const CONTRACT = `
export const SEARCH_SOURCE_KINDS = [
  'conversation',
  'artifact',
] as const;
`;

const LOADER = `
export async function loadRetrievalSourceText(db, document) {
  switch (document.source_kind) {
    case 'conversation': {
      const [row] = await db.query(
        'select title from web_conversations where id = $1 and deleted_at is null',
        [document.source_id],
      );
      return row ? { title: row.title, segments: [] } : null;
    }
    case 'artifact': {
      const [row] = await db.query(
        'select title from web_artifacts where id = $1 and deleted_at is null',
        [document.source_id],
      );
      return row ? { title: row.title, segments: [] } : null;
    }
  }
}
`;

const MIGRATION = `
create table if not exists public.retrieval_documents (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (
    source_kind in (
      'conversation', 'artifact'
    )
  ),
  conversation_id uuid references public.web_conversations(id) on delete cascade,
  artifact_id uuid references public.web_artifacts(id) on delete cascade,
  constraint retrieval_documents_single_source check (
    num_nonnulls(conversation_id, artifact_id) = 1
    and (source_kind = 'conversation') = (conversation_id is not null)
    and (source_kind = 'artifact') = (artifact_id is not null)
  )
);

create or replace function public.retrieval_enqueue_document(
  p_user_id text, p_organization_id uuid, p_source_kind text, p_source_id uuid, p_title text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.retrieval_documents (user_id, source_kind, conversation_id, artifact_id)
  values (
    p_user_id, p_source_kind,
    case when p_source_kind = 'conversation' then p_source_id end,
    case when p_source_kind = 'artifact' then p_source_id end
  );
end;
$$;

create or replace function public.retrieval_track_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null then
    delete from public.retrieval_documents where conversation_id = new.id;
    return new;
  end if;
  perform public.retrieval_enqueue_document(new.user_id, null, 'conversation', new.id, new.title);
  perform public.retrieval_mark_stale('conversation', new.id);
  return new;
end;
$$;

create or replace function public.retrieval_track_artifact()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null then
    perform public.retrieval_forget_document('artifact', new.id);
    return new;
  end if;
  perform public.retrieval_enqueue_document(new.user_id, null, 'artifact', new.id, new.title);
  perform public.retrieval_mark_stale('artifact', new.id);
  return new;
end;
$$;
`;

function buildRoot(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'search-index-coverage-'));
  const write = (relative, body) => {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  };
  write('packages/platform/data-layer/src/search/types.ts', overrides.contract ?? CONTRACT);
  write('apps/web/lib/services/retrieval-index-service.ts', overrides.loader ?? LOADER);
  write('apps/web/db/neon/0001_retrieval_index.sql', overrides.migration ?? MIGRATION);
  return root;
}

function run(root) {
  try {
    const stdout = execFileSync(process.execPath, [script, '--root', root], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out: stdout };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

test('passes when every declared kind is stored, enqueued, withdrawn and loadable', () => {
  const result = run(buildRoot());
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /2 source kind\(s\)/);
});

test('fails a kind the storage check constraint does not accept', () => {
  const result = run(
    buildRoot({ migration: MIGRATION.replace("'conversation', 'artifact'\n", "'conversation'\n") }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /check constraint is missing source kind: artifact/);
});

test('fails a kind the source loader cannot read back', () => {
  const result = run(
    buildRoot({ loader: LOADER.replace(/\n    case 'artifact':[\s\S]*?\n    \}/, '') }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /source loader is missing source kind: artifact/);
});

test('fails a loader arm that reads a withdrawn row back for embedding', () => {
  const result = run(
    buildRoot({
      loader: LOADER.replace(
        "'select title from web_artifacts where id = $1 and deleted_at is null'",
        "'select title from web_artifacts where id = $1'",
      ),
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /reads a 'artifact' without a lifecycle predicate/);
});

test('fails a kind no trigger ever enqueues', () => {
  const result = run(
    buildRoot({
      migration: MIGRATION.replace(
        "perform public.retrieval_enqueue_document(new.user_id, null, 'artifact', new.id, new.title);",
        '',
      ),
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /no trigger enqueues a 'artifact'/);
});

test('fails a kind no trigger marks stale when its text changes', () => {
  const result = run(
    buildRoot({
      migration: MIGRATION.replace("perform public.retrieval_mark_stale('artifact', new.id);", ''),
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /no trigger marks a 'artifact' stale/);
});

test('fails a kind no trigger withdraws from the index', () => {
  const result = run(
    buildRoot({
      migration: MIGRATION.replace(
        "perform public.retrieval_forget_document('artifact', new.id);",
        '',
      ),
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /no trigger withdraws a 'artifact'/);
});

test('fails a source column that does not take its chunks with it', () => {
  const result = run(
    buildRoot({
      migration: MIGRATION.replace(
        'artifact_id uuid references public.web_artifacts(id) on delete cascade',
        'artifact_id uuid references public.web_artifacts(id)',
      ),
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /artifact_id does not cascade on delete/);
});

test('fails a kind the enqueue function has no column for', () => {
  const result = run(
    buildRoot({
      migration: MIGRATION.replace(
        "case when p_source_kind = 'artifact' then p_source_id end",
        'null',
      ),
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /retrieval_enqueue_document is missing source kind: artifact/);
});

test('fails when the contract file has gone', () => {
  const root = buildRoot();
  fs.rmSync(path.join(root, 'packages/platform/data-layer/src/search/types.ts'));
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.out, /is missing/);
});

test('reads the last definition of a function a later migration replaced', () => {
  const bodies = liveFunctionBodies([
    { name: '0001.sql', sql: MIGRATION },
    {
      name: '0002.sql',
      sql: `create or replace function public.retrieval_track_artifact()\nreturns trigger as $$\nbegin\n  perform public.retrieval_forget_document('artifact', new.id);\nend;\n$$;`,
    },
  ]);
  assert.match(bodies.get('retrieval_track_artifact'), /retrieval_forget_document/);
  assert.doesNotMatch(bodies.get('retrieval_track_artifact'), /retrieval_enqueue_document/);
});

test('reads the declared kinds, the column mapping and the cascades', () => {
  assert.deepEqual(stringArrayConst(CONTRACT, 'SEARCH_SOURCE_KINDS'), ['conversation', 'artifact']);
  assert.deepEqual(singleSourceMapping(MIGRATION), {
    conversation: 'conversation_id',
    artifact: 'artifact_id',
  });
  assert.deepEqual(cascadingColumns(MIGRATION), ['conversation_id', 'artifact_id']);
});
