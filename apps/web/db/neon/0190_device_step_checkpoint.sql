-- 0190 : carry a cloud turn's device step on the same durable pause boundary as
-- a tool approval and an MCP input_required round.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- A cloud turn runs in a data centre and can reach nothing on the user's disk.
-- When the page is hosted by the desktop shell, the model may ask for a step
-- that machine carries out: read or write a file in a folder the user granted,
-- or run a command there. That is the same pause the two existing kinds are, a
-- tenant-owned transcript, event cursor and pending call claimed once under a
-- short lease, so it reuses this table rather than a second execution system.
--
-- `device_step` records WHICH DEVICE the step was issued to. Without it any
-- machine signed into the same account could answer a step it never ran, and
-- the answer is the tool result the model reads next. The payload is
-- host-authored: the server planned the step from the model's arguments before
-- writing this row.
--
-- A device pause is short-lived by design. Its time to live is enforced in the
-- claim query rather than here, because it differs from the 24 hours an
-- approval gets: a person walking away from their desk should fail the turn
-- with a retryable notice, not hold a run open all day.

begin;

alter table public.cloud_agent_approval_checkpoints
  drop constraint if exists cloud_agent_approval_checkpoints_checkpoint_kind_check;

alter table public.cloud_agent_approval_checkpoints
  add constraint cloud_agent_approval_checkpoints_checkpoint_kind_check
    check (checkpoint_kind in ('approval', 'input', 'device'));

alter table public.cloud_agent_approval_checkpoints
  add column device_step jsonb
    check (device_step is null or jsonb_typeof(device_step) = 'object');

alter table public.cloud_agent_approval_checkpoints
  add constraint cloud_agent_checkpoint_device_payload_chk check (
    checkpoint_kind <> 'device' or device_step is not null
  );

comment on column public.cloud_agent_approval_checkpoints.device_step is
  'Host-authored device-step binding ({ deviceId, deviceName, steps }). Names the one device that may answer this pause.';

commit;
