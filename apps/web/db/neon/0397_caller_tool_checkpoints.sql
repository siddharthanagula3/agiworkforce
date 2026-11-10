begin;

alter table public.cloud_agent_approval_checkpoints
  drop constraint cloud_agent_approval_checkpoints_checkpoint_kind_check;

alter table public.cloud_agent_approval_checkpoints
  add constraint cloud_agent_approval_checkpoints_checkpoint_kind_check
    check (checkpoint_kind in ('approval', 'input', 'device', 'pause', 'caller'));

commit;
