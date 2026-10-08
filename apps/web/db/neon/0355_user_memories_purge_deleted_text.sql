begin;

create or replace function public.purge_deleted_memory_text()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.content := '';
  new.category := null;
  new.import_key := null;
  return new;
end;
$$;

drop trigger if exists purge_deleted_memory_text on public.user_memories;
create trigger purge_deleted_memory_text
  before insert or update on public.user_memories
  for each row
  when (new.is_deleted)
  execute function public.purge_deleted_memory_text();

update public.user_memories
   set content = '', category = null, import_key = null
 where is_deleted = true
   and (content <> '' or category is not null or import_key is not null);

commit;
