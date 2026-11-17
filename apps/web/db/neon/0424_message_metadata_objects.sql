-- =============================================================================
-- Migration 0424: message and project metadata is always a JSON object
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : chat sync stored a pushed "metadata": null as the JSON value null,
--          which passes web_messages.metadata's NOT NULL, instead of an
--          object. Every later merge onto that row (metadata || patch) then
--          built an array, because 'null'::jsonb || '{"a":1}' is
--          [null, {"a": 1}]. The chat sync pull and the conversation page read
--          metadata as an object, so one such row failed every sync of its
--          account and every load of its conversation. Project sync stores a
--          project's missing metadata the same way, and starring that project
--          builds the same array in user_projects.
--
-- Shape  : no schema change. A row whose metadata is not an object is
--          rewritten. An array becomes the merge of its object elements in
--          order, later keys winning, which is what the merges that built it
--          would have stored; JSON null and any other scalar become {}. The
--          expression is jsonbObjectSql in
--          apps/web/lib/server/jsonb-object-merge.ts, which every writer now
--          applies, and the migration test holds the two equal. A project
--          whose metadata is SQL NULL is left as it is.
--
-- Cost   : one scan of each table; only the rows that are not objects are
--          written. Each rewritten row takes a new server_version from the
--          sync version trigger, so devices pull the repaired row.
--
-- Twice  : a second run finds no row that is not an object and writes nothing.
--
-- Depends: 0001 (web_messages), 0006 (user_projects), 0037 (forced row level
--          security on both), 0038 (server_version), 0041 (project sync)
-- =============================================================================
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
     where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception 'Metadata repair migration requires a privileged owner with BYPASSRLS';
  end if;
end;
$$;

update public.web_messages as message
   set metadata = (select case jsonb_typeof(candidate.value)
    when 'object' then candidate.value
    when 'array' then (
      select coalesce(jsonb_object_agg(field.key, field.value order by element.idx), '{}'::jsonb)
        from jsonb_array_elements(candidate.value) with ordinality as element(item, idx)
        cross join lateral jsonb_each(
          case when jsonb_typeof(element.item) = 'object' then element.item else '{}'::jsonb end
        ) as field
    )
    else '{}'::jsonb
  end
  from (select (message.metadata)::jsonb as value) as candidate)
 where jsonb_typeof(message.metadata) is distinct from 'object';

update public.user_projects as project
   set metadata = (select case jsonb_typeof(candidate.value)
    when 'object' then candidate.value
    when 'array' then (
      select coalesce(jsonb_object_agg(field.key, field.value order by element.idx), '{}'::jsonb)
        from jsonb_array_elements(candidate.value) with ordinality as element(item, idx)
        cross join lateral jsonb_each(
          case when jsonb_typeof(element.item) = 'object' then element.item else '{}'::jsonb end
        ) as field
    )
    else '{}'::jsonb
  end
  from (select (project.metadata)::jsonb as value) as candidate)
 where project.metadata is not null
   and jsonb_typeof(project.metadata) <> 'object';

commit;
