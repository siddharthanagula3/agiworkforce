-- Reversal of 0261 : removes custodians and the resource-type scope from legal
-- holds.
--
-- WHAT THIS COSTS: every custodian list is destroyed, so a matter that named
-- five people preserves nobody once the rows are gone. Resource narrowing is
-- dropped too, so a hold that named two stores goes back to preserving all of
-- them, which over-preserves and is therefore safe.
--
-- This refuses to run while any custodian-scoped hold exists. Rewriting one to
-- another scope here would either preserve nothing (release it) or collide with
-- 0138's one-active-organization-hold index (widen it), and a reversal that
-- quietly stops preserving evidence is the failure this table exists to
-- prevent. Release or restate those matters first, then run this.

begin;

do $$
declare
  held integer;
begin
  select count(*) into held from public.legal_holds where scope = 'custodian';
  if held > 0 then
    raise exception 'Cannot reverse 0261: % custodian-scoped legal hold(s) exist. Release or restate them as organization or member holds first.', held;
  end if;
end $$;

drop table if exists public.legal_hold_custodians;

alter table public.legal_holds
  drop constraint if exists legal_holds_resource_types_known;
alter table public.legal_holds
  drop column if exists resource_types;

alter table public.legal_holds
  drop constraint if exists legal_holds_subject_matches_scope;
alter table public.legal_holds
  add constraint legal_holds_subject_matches_scope check (
    (scope = 'member' and subject_user_id is not null)
    or (scope = 'organization' and subject_user_id is null)
  );

alter table public.legal_holds
  drop constraint if exists legal_holds_scope_check;
alter table public.legal_holds
  add constraint legal_holds_scope_check check (scope in ('organization', 'member'));

delete from public.schema_migrations
 where filename = '0261_legal_hold_custodians_and_resource_scope.sql';

commit;
