-- Reversal of 0148 — drop the MRTR input-checkpoint generalization columns.
--
-- WHAT THIS COSTS: any in-flight `input` checkpoint rows can no longer be
-- resumed after this runs (their kind/payload columns are gone). Approval
-- checkpoints are untouched. Runs paused on input would need to be re-driven.

begin;

alter table public.cloud_agent_approval_checkpoints
  drop constraint if exists cloud_agent_checkpoint_input_payload_chk;

alter table public.cloud_agent_approval_checkpoints
  drop column if exists request_state,
  drop column if exists input_requests,
  drop column if exists checkpoint_kind;

delete from public.schema_migrations
 where filename = '0148_mrtr_input_checkpoint.sql';

commit;
