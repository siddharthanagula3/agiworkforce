-- Reversal preserves caller state and refuses while caller checkpoints or events remain.
-- Finish or cancel those runs, then use the authorized retention/erasure owner before reverting.

begin;

do $$
begin
  if not exists (
    select 1 from pg_roles
    where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception 'Caller checkpoint reversal requires table-wide migration-owner visibility';
  end if;
  if exists (
    select 1 from public.cloud_agent_approval_checkpoints where checkpoint_kind = 'caller'
  ) or exists (
    select 1 from public.cloud_agent_events where event_type = 'caller-tools-requested'
  ) then
    raise exception 'Caller checkpoint reversal requires caller run data to be retired by its retention/erasure owner';
  end if;
end;
$$;

alter table public.cloud_agent_approval_checkpoints
  drop constraint cloud_agent_approval_checkpoints_checkpoint_kind_check;

alter table public.cloud_agent_approval_checkpoints
  add constraint cloud_agent_approval_checkpoints_checkpoint_kind_check
    check (checkpoint_kind in ('approval', 'input', 'device', 'pause'));

delete from public.schema_migrations where filename = '0397_caller_tool_checkpoints.sql';

commit;
