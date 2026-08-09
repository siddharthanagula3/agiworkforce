# Neon down migrations

Status: Current
Owner: Platform lead
Purpose: The reversal for every forward migration from 0097 on, and the
procedure for running one.
Last updated: 2026-08-09

## Why this directory exists

Every schema change in `apps/web/db/neon` was one-way. A deploy that shipped a
bad migration could be reverted in code, but the schema it left behind stayed,
so "roll back" meant hand-written SQL improvised under incident pressure
against a database nobody wanted to touch. These files are that SQL, written
while the migration is fresh and reviewed like any other change.

`scripts/check-neon-migrations.mjs` enforces the pairing: every migration whose
ordinal is at or above `FIRST_REVERSIBLE_MIGRATION` must have a file here, and
that file must name back every table, column, index, policy, constraint,
function, type, trigger, view, sequence and RLS toggle its migration creates,
drops or changes. Columns, constraints and RLS toggles must be named in a
statement that also names their table, so a reversal cannot undo one table and
be credited with six. Older migrations predate the contract; undoing those is a
restore, not a script.

Two things are outside the rule on purpose. `CREATE EXTENSION` is cluster-wide
and shared — 0101 installs `pg_trgm`, and a reversal that dropped it would take
every other migration's trigram index with it. `GRANT` is not an object; the
grants in this chain sit on functions and tables that are themselves checked, so
dropping the object retires the grant.

## Writing one

Name it `<up-basename>.down.sql` — `0103_erasure_tombstones.sql` is reversed by
`0103_erasure_tombstones.down.sql`. Then:

- Open with `begin;` and close with `commit;`. A reversal that stops half way
  leaves a schema no migration state describes. The single exception is a
  statement Postgres refuses inside a transaction block (`CREATE INDEX
CONCURRENTLY`, `VACUUM`, `REINDEX`, `ALTER TYPE ... ADD VALUE`, `ALTER SYSTEM`,
  `CREATE`/`DROP DATABASE`); mark the file `-- non-transactional: <reason>` and
  the check stops asking. It checks that the file really contains such a
  statement, so the comment cannot be used to waive atomicity for a reversal
  that never needed it.
- End with the ledger retraction:
  `delete from public.schema_migrations where filename = '<up-basename>.sql';`
  It runs in the same transaction as the DDL, so the schema and the ledger can
  never disagree. Without it `pnpm db:migrate apply` still believes the
  migration ran and will never put the schema back.
- Restore what the migration replaced, not just what it added. If the up
  dropped an index or redefined a function, the down recreates the previous
  definition — the check requires the name, only review requires it to be
  right. The coverage rule is a name-mention test: it catches the reversal that
  forgot an object, which is the failure that actually happens once a migration
  grows one after its down was written. It cannot tell correct SQL from wrong
  SQL, and it is not a substitute for reading the file.
- Say what the reversal costs at the top of the file, in the header comment. A
  down script that silently destroys acceptance records or credentials is a
  worse incident than the one being rolled back.

## Running one

Downs apply newest first, one at a time, and only as far back as the deploy
being reverted. Each file is self-contained, so plain `psql` is the runner:

```sh
psql "$AGI_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/web/db/neon/down/0103_erasure_tombstones.down.sql
```

Then confirm the runner and the database agree — the retracted migration comes
back as pending, and nothing shows as drift:

```sh
pnpm db:migrate -- status
```

Known gap: `pnpm db:migrate` has no `down` subcommand, so ordering, the
advisory lock and the `--target production` confirmation that guard a forward
apply are the operator's responsibility here. Wiring these files into the
runner is tracked separately.
