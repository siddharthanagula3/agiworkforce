-- Reinstates the pre-0273 trigger, which also blocks organization cascades.
-- Use only as part of an explicitly reviewed rollback.
begin;

create or replace function public.ediscovery_exports_are_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'ediscovery_exports is append-only: % is refused. Correct the record by appending, never by rewriting.',
    tg_op;
end;
$$;

delete from public.schema_migrations
 where filename = '0273_ediscovery_cascade_delete.sql';

commit;
