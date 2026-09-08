-- 0176 : the working branch, the pull request, the archive and the context a
-- Code session has used.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- WHY A WORKING BRANCH COLUMN: commitAndPushCloudCodeSession pushes whatever
-- branch the clone left checked out, which for a repository cloned at depth 1
-- is the branch the user picked, usually the default one. A coding session that
-- pushes straight onto main is not what a reviewer expects and not what the
-- leader does: it works on a branch of its own and opens a pull request from
-- it. The branch name has to be durable rather than derived at push time,
-- because the sandbox is paused and re-attached between turns and because the
-- Changes panel names the branch flow (base -> working branch) before any push
-- has happened. Null means a session that predates this column or has no
-- repository, and the push path keeps its old behaviour for those.
--
-- The check mirrors GIT_REF_RE in cloud-code-session-service.ts: a ref that
-- starts with a letter or digit cannot be read by git as an option. The
-- application validates first; this constraint is what stops a future writer
-- from bypassing it.
--
-- WHY THE PULL REQUEST IS TWO COLUMNS AND ONE CONSTRAINT: the URL is what the
-- surface links to and the number is what any later API call needs. Storing
-- one without the other produces a session that claims a pull request nobody
-- can act on, so the constraint makes them arrive and leave together. The URL
-- shape is pinned to github.com for the same reason 0159 pinned repository_url:
-- it is rendered as a link, and a link this product wrote must not be able to
-- point anywhere else.
--
-- WHY archived_at AND NOT A NEW state VALUE: closing a session kills its
-- sandbox and is final; archiving is reversible and keeps the session listed
-- under a filter. Folding archive into the state enum would force every
-- existing query that reads state to learn a value that means something
-- orthogonal, and would lose which state an unarchived session should return
-- to. A nullable timestamp answers both "is it archived" and "since when".
--
-- WHY THE TOKEN COUNTS ARE ON BOTH TABLES: the usage ring shows context used
-- against the model's window for the session, and the transcript attributes it
-- to the turn that spent it. The turn columns are the record; the session
-- columns are their running sum, kept because the ring is read on every poll
-- of a session and an aggregate over every turn and step of a long session is
-- not what that read should cost. bigint because a long session on a large
-- context window passes the integer ceiling.
--
-- NO NEW INDEX: the archived filter runs inside listCloudCodeSessions, which
-- already reads at most 100 rows for one user through
-- cloud_code_sessions_user_updated_idx and filters in the same statement. A
-- partial index on archived_at would be write cost on every session update for
-- a scan that never exceeds a hundred rows.

alter table public.cloud_code_sessions
  add column if not exists working_branch text,
  add column if not exists pull_request_url text,
  add column if not exists pull_request_number integer,
  add column if not exists archived_at timestamptz,
  add column if not exists context_input_tokens bigint not null default 0,
  add column if not exists context_output_tokens bigint not null default 0;

alter table public.cloud_code_sessions
  drop constraint if exists cloud_code_sessions_working_branch_ref;
alter table public.cloud_code_sessions
  add constraint cloud_code_sessions_working_branch_ref
  check (
    working_branch is null
    or working_branch ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$'
  );

alter table public.cloud_code_sessions
  drop constraint if exists cloud_code_sessions_pull_request_paired;
alter table public.cloud_code_sessions
  add constraint cloud_code_sessions_pull_request_paired
  check (
    (pull_request_url is null and pull_request_number is null)
    or (
      pull_request_number > 0
      and pull_request_url ~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[0-9]+$'
    )
  );

alter table public.cloud_code_sessions
  drop constraint if exists cloud_code_sessions_context_tokens_non_negative;
alter table public.cloud_code_sessions
  add constraint cloud_code_sessions_context_tokens_non_negative
  check (context_input_tokens >= 0 and context_output_tokens >= 0);

comment on column public.cloud_code_sessions.working_branch is
  'The branch this session works on and pushes, created from the cloned ref at setup. Null for sessions with no repository and for sessions created before this column.';

comment on column public.cloud_code_sessions.pull_request_url is
  'The pull request opened from working_branch, as a github.com link. Always set together with pull_request_number.';

comment on column public.cloud_code_sessions.archived_at is
  'When the account archived this session. Archived sessions stay listed and refuse turns and commands until they are unarchived; closing is separate and final.';

comment on column public.cloud_code_sessions.context_input_tokens is
  'Running sum of the input tokens every agent turn of this session reported, for the context reading the surface shows against the model window.';

alter table public.cloud_code_agent_turns
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists input_tokens bigint not null default 0,
  add column if not exists output_tokens bigint not null default 0;

alter table public.cloud_code_agent_turns
  drop constraint if exists cloud_code_agent_turns_tokens_non_negative;
alter table public.cloud_code_agent_turns
  add constraint cloud_code_agent_turns_tokens_non_negative
  check (input_tokens >= 0 and output_tokens >= 0);

comment on column public.cloud_code_agent_turns.cancel_requested_at is
  'When the account asked for this turn to stop. The turn runs in a different invocation from the request that stops it, so the stop has to be state the executor re-reads between steps and between tool calls rather than an in-process signal.';

comment on column public.cloud_code_agent_turns.input_tokens is
  'Input tokens this turn reported to the usage ledger, summed into cloud_code_sessions.context_input_tokens.';
