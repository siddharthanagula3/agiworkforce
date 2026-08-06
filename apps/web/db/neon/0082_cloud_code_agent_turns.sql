-- 0082: Persist Cloud Code agent turns and their pending approvals.
--
-- WHY
-- Cloud Code (0075) stores a terminal transcript: one row per command the USER
-- typed. An agent turn is a different shape — the user states a goal once, and
-- the model then produces a bounded sequence of tool calls whose results feed
-- back into it. Replaying that into `cloud_code_terminal_entries` would lose
-- the goal, the model's reasoning, which step belonged to which turn, and the
-- approval decisions, so the turn gets its own tables.
--
-- APPROVALS ARE STATE, NOT UI
-- `cloud_code_agent_approvals` exists because the approval boundary must
-- survive a page reload, a reconnect, and a serverless invocation ending. A
-- pending approval held only in a client's memory is not an approval gate — it
-- is a prompt that a refresh silently bypasses. A step that requires approval
-- is written here as 'pending' BEFORE the model is told anything, and the
-- command is executed only after a row transitions to 'approved'.
--
-- The classifier that assigns `risk` lives in
-- `apps/web/lib/services/cloud-code-agent-tools.ts` and fails closed: anything
-- not positively recognized as read-only becomes 'requires_approval'.

create table if not exists public.cloud_code_agent_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id text not null,
  organization_id uuid references public.organizations(id) on delete cascade,

  -- The user's goal, in prose. This is what distinguishes an agent turn from a
  -- terminal command and is shown as the turn's title.
  goal text not null check (length(goal) between 1 and 8000),

  -- Managed-usage correlation. Required, not nullable: an agent turn calls a
  -- paid provider, and a turn we cannot tie back to a reservation is a turn we
  -- cannot bill or refund. Same shape as the chat path's key.
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),

  model text,
  provider text,

  state text not null default 'running' check (
    state in ('running', 'awaiting_approval', 'completed', 'failed', 'cancelled')
  ),

  -- Populated on terminal states only.
  final_message text check (final_message is null or octet_length(final_message) <= 100000),
  error_message text check (error_message is null or length(error_message) <= 2000),

  -- Loop bounds, recorded so a turn that stopped early is distinguishable from
  -- one that finished. Without this, "the agent stopped" is unexplainable.
  steps_used integer not null default 0 check (steps_used >= 0),
  stop_reason text check (
    stop_reason is null
    or stop_reason in ('done', 'max_steps', 'timeout', 'cancelled', 'error', 'denied')
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (session_id, user_id)
    references public.cloud_code_sessions(id, user_id)
    on delete cascade,

  -- One turn per idempotency key per user: a retried request resumes the same
  -- turn instead of starting a second billable one.
  unique (user_id, idempotency_key)
);

create index if not exists idx_cloud_code_agent_turns_session
  on public.cloud_code_agent_turns(session_id, created_at desc);

-- Open turns, for resume-after-reconnect and for the reaper that fails turns
-- whose invocation died mid-flight.
create index if not exists idx_cloud_code_agent_turns_open
  on public.cloud_code_agent_turns(user_id, updated_at)
  where state in ('running', 'awaiting_approval');

-- One row per tool call the model made, in order.
create table if not exists public.cloud_code_agent_steps (
  id bigint generated always as identity primary key,
  turn_id uuid not null references public.cloud_code_agent_turns(id) on delete cascade,
  step_index integer not null check (step_index >= 0),

  tool_name text not null check (length(tool_name) between 1 and 64),
  -- Arguments as the model produced them, for auditability. Capped because a
  -- model can emit an arbitrarily large write_file payload.
  tool_args jsonb not null default '{}',

  output text not null default '' check (octet_length(output) <= 100000),
  is_error boolean not null default false,

  started_at timestamptz not null default now(),
  completed_at timestamptz,

  unique (turn_id, step_index)
);

create index if not exists idx_cloud_code_agent_steps_turn
  on public.cloud_code_agent_steps(turn_id, step_index);

-- Durable approval decisions. A step whose command is classified
-- 'requires_approval' gets a row here in 'pending' and the loop suspends.
create table if not exists public.cloud_code_agent_approvals (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid not null references public.cloud_code_agent_turns(id) on delete cascade,
  step_index integer not null check (step_index >= 0),

  -- The EXACT command shown to the user. Approval is granted for this string
  -- and no other; the executor re-reads it from here rather than trusting a
  -- client echo, so an approved prompt cannot be swapped for a different
  -- command between display and execution.
  command text not null check (length(command) between 1 and 2000),
  -- Verbatim classifier reason, so the prompt and the record cannot drift.
  reason text not null check (length(reason) between 1 and 500),

  state text not null default 'pending' check (
    state in ('pending', 'approved', 'rejected', 'expired')
  ),

  decided_at timestamptz,
  -- Approvals go stale: a decision made against a workspace that has since
  -- changed is not informed consent. The loop refuses an expired approval.
  expires_at timestamptz not null,

  created_at timestamptz not null default now(),

  unique (turn_id, step_index)
);

create index if not exists idx_cloud_code_agent_approvals_pending
  on public.cloud_code_agent_approvals(turn_id)
  where state = 'pending';
