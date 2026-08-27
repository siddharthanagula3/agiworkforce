-- 0148 — Generalize the server-owned checkpoint boundary to carry MCP
-- `input_required` (MRTR) pauses alongside tool approvals.
--
-- A model-driven connector call can pause mid-execution asking for additional,
-- bounded input (MCP 2026-07-28 `input_required`). That is the same durable
-- pause/resume boundary as a tool approval — a tenant-owned transcript, event
-- cursor, and pending call claimed once under a short execution lease — so it
-- reuses this table rather than a second execution system.
--
-- `checkpoint_kind` distinguishes the two. `input_requests` holds the remote
-- server's own, UNTRUSTED field definitions (already count/size bounded by the
-- host) keyed by tool call id; `request_state` holds the host-owned per-call
-- continuation metadata ({ requestState?, round }). Both stay tenant-owned on
-- the server; a client only supplies the collected responses on resume.

begin;

alter table public.cloud_agent_approval_checkpoints
  add column checkpoint_kind text not null default 'approval'
    check (checkpoint_kind in ('approval', 'input')),
  add column input_requests jsonb
    check (input_requests is null or jsonb_typeof(input_requests) = 'object'),
  add column request_state jsonb
    check (request_state is null or jsonb_typeof(request_state) = 'object');

alter table public.cloud_agent_approval_checkpoints
  add constraint cloud_agent_checkpoint_input_payload_chk check (
    checkpoint_kind <> 'input'
    or (input_requests is not null and request_state is not null)
  );

comment on column public.cloud_agent_approval_checkpoints.checkpoint_kind is
  'Which durable pause boundary this row records: an approval decision or an MCP input_required (MRTR) round.';
comment on column public.cloud_agent_approval_checkpoints.input_requests is
  'UNTRUSTED, host-bounded remote input-request field definitions keyed by tool call id; rendered as a form, never executed.';
comment on column public.cloud_agent_approval_checkpoints.request_state is
  'Host-owned per-call continuation metadata ({ requestState?, round }) keyed by tool call id.';

commit;
