-- Reversal of 0190 : drop the device-step pause boundary.
--
-- WHAT THIS COSTS: any run paused on a device step can no longer be resumed
-- after this runs, because the column naming the device it was issued to is
-- gone. Approval and input checkpoints are untouched. A run paused on a device
-- step would have to be re-driven from the user's last message.

begin;

alter table public.cloud_agent_approval_checkpoints
  drop constraint if exists cloud_agent_checkpoint_device_payload_chk;

delete from public.cloud_agent_approval_checkpoints
 where checkpoint_kind = 'device';

alter table public.cloud_agent_approval_checkpoints
  drop column if exists device_step;

alter table public.cloud_agent_approval_checkpoints
  drop constraint if exists cloud_agent_approval_checkpoints_checkpoint_kind_check;

alter table public.cloud_agent_approval_checkpoints
  add constraint cloud_agent_approval_checkpoints_checkpoint_kind_check
    check (checkpoint_kind in ('approval', 'input'));

delete from public.schema_migrations
 where filename = '0190_device_step_checkpoint.sql';

commit;
