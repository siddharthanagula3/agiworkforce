-- Depends: 0262
begin;

create or replace function public.ediscovery_exports_are_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1
      from public.organizations
     where id = old.organization_id
  ) then
    return old;
  end if;

  raise exception
    'ediscovery_exports is append-only: % is refused. Correct the record by appending, never by rewriting.',
    tg_op;
end;
$$;

comment on function public.ediscovery_exports_are_append_only() is
  'Refuses direct UPDATE and DELETE for every role. A DELETE is admitted only from the organizations foreign-key cascade after its parent workspace has been removed.';

commit;
