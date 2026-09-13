-- 0189 : make a memory row's identity per-user, and stop deriving it from values another tenant knows.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- `user_memories.id` was a GLOBAL primary key that the client chose. Two holes
-- followed from that one fact.
--
-- The sync push inserts the id straight from the request body and authorises
-- the row only against the caller's own `user_id`, so the key was never
-- tenant-scoped. An attacker who occupied an id made every later insert of that
-- id by ANY other account fall into `on conflict do nothing`: the victim's write
-- was silently dropped, and whether the insert applied answered "does this id
-- already exist anywhere in the table" for a caller who is allowed to see none
-- of it.
--
-- The import path made those ids guessable. It derived the uuid from an UNKEYED
-- sha256 of `user_id`, the import source slug and the normalised memory text, so
-- anyone who knew a victim's user id could compute the id of a memory they
-- guessed the wording of, insert it first, and both suppress the victim's import
-- and learn whether the victim already held it.
--
-- Per-user uniqueness closes the first: the same id under two accounts is now
-- two rows, and one tenant's insert can neither collide with nor observe
-- another's. That also removes the reason the import derived an id at all, so
-- imported rows take a random uuid and dedupe on `import_key`, the normalised
-- text the derivation used to hash, unique per (user, source) rather than
-- globally. Nothing about the import's observable behaviour changes: a repeated
-- import of the same text under the same source is still skipped.
--
-- The backfill fills `import_key` for rows already imported so a re-import
-- after this migration still recognises them. It normalises in SQL the way the
-- parser normalises in TypeScript (trim, collapse runs of whitespace to one
-- space, lowercase) and keeps the earliest row when two legacy rows normalise
-- the same, because the unique index below cannot be created over a duplicate.

alter table public.user_memories
  add column if not exists import_key text;

comment on column public.user_memories.import_key is
  'Normalised memory text for a row created by the memory import, deduped per (user_id, source). NULL for every row the import did not create.';

update public.user_memories as target
   set import_key = candidate.normalized
  from (
    select id,
           user_id,
           lower(regexp_replace(btrim(content), '\s+', ' ', 'g')) as normalized,
           row_number() over (
             partition by user_id, source, lower(regexp_replace(btrim(content), '\s+', ' ', 'g'))
             order by created_at, id
           ) as ordinal
      from public.user_memories
     where source like 'imported:%'
  ) as candidate
 where target.id = candidate.id
   and target.user_id = candidate.user_id
   and candidate.ordinal = 1
   and target.import_key is null;

create unique index if not exists ux_user_memories_user_import_key
  on public.user_memories (user_id, source, import_key)
  where import_key is not null;

alter table public.user_memories
  drop constraint if exists user_memories_pkey;

alter table public.user_memories
  add constraint user_memories_pkey primary key (user_id, id);
