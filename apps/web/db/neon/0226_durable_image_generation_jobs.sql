-- 0226 : durable, tenant-owned image generation jobs.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Video has been a durable job since 0105: an opaque AGI job id, one billing
-- reservation, an attempt schedule, a reconciliation lease and a terminal row
-- that outlives the HTTP request. Image generation ran inside one 60 second
-- request instead, so closing the tab abandoned paid work, nothing counted the
-- attempts, and "retry" meant resubmitting the prompt and paying twice.
--
-- This table gives image the same shape, with two differences that follow from
-- how image providers actually behave:
--
--   * There is no provider task id to poll. An attempt is one synchronous
--     provider call, so the job records attempts rather than a remote handle,
--     and a claim that lapses is what lets the next attempt start.
--   * One job can deliver up to four candidates, so the assets hang off a child
--     table rather than a single asset_id column.
--
-- A retryable failure is deliberately NOT terminal: the row keeps its single
-- managed_usage_requests reservation while `retryable` is true, which is what
-- makes "try again" free. Only exhausting the attempts, cancelling, or letting
-- the lease run out settles the reservation, and settlement is what writes
-- terminal_at.
--
-- Billing stays in the managed_usage_requests lifecycle. Nothing here is a
-- second credit ledger; the foreign key makes the reservation a precondition
-- of the job rather than a parallel record of it.

begin;

create table if not exists public.image_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  -- Web chat binds the job to the conversation it was asked from. Deleting the
  -- conversation detaches the projection without abandoning paid work, which
  -- stays owned by user_id and the durable job id.
  conversation_id uuid references public.web_conversations(id) on delete set null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  billing_lease_token text not null check (length(billing_lease_token) between 1 and 128),
  provider text not null check (provider = any (array['openai', 'google'])),
  model text not null check (length(btrim(model)) between 1 and 200),
  operation text not null check (
    operation = any (array['generate', 'edit', 'inpaint', 'outpaint', 'variation'])
  ),
  prompt text not null check (length(prompt) between 1 and 4000),
  -- The resolved provider plan, not the raw request: aspect ratio, quality,
  -- style, negative prompt and the shape of any edit refs. Client image bytes
  -- never land here; an edit records only the digest below, so a retry has to
  -- resupply the same image rather than substitute another one.
  plan jsonb not null default '{}'::jsonb
    check (jsonb_typeof(plan) = 'object' and pg_column_size(plan) <= 16384),
  source_image_sha256 text check (source_image_sha256 is null or source_image_sha256 ~ '^[a-f0-9]{64}$'),
  mask_image_sha256 text check (mask_image_sha256 is null or mask_image_sha256 ~ '^[a-f0-9]{64}$'),
  image_count integer not null check (image_count between 1 and 4),
  source_surface text not null check (
    source_surface = any (array['web', 'mobile', 'desktop', 'cli'])
  ),
  estimated_cost_microusd bigint not null check (estimated_cost_microusd >= 0),
  actual_cost_microusd bigint check (actual_cost_microusd is null or actual_cost_microusd >= 0),
  status text not null default 'queued'
    check (status = any (array['queued', 'processing', 'completed', 'failed', 'canceled'])),
  attempts integer not null default 0 check (attempts between 0 and 10),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  attempt_started_at timestamptz,
  retryable boolean not null default false,
  public_error text check (public_error is null or length(public_error) <= 500),
  cancel_requested_at timestamptz,
  billing_outcome text check (
    billing_outcome is null or billing_outcome = any (array['completed', 'released'])
  ),
  billing_settlement_status text check (
    billing_settlement_status is null
    or billing_settlement_status = any (array['succeeded', 'pending', 'terminal'])
  ),
  next_attempt_at timestamptz not null default now(),
  claim_token text check (claim_token is null or length(claim_token) between 8 and 128),
  claim_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  terminal_at timestamptz,
  unique (user_id, idempotency_key),
  -- 0105 made the equivalent video key RESTRICT and gave account erasure an
  -- explicit step for it. This one cascades instead: erasure is owned elsewhere
  -- and has no step for image jobs, so RESTRICT here would turn a new table into
  -- a permanent block on deleting an account. The reservation remains the
  -- financial record; the job row is the delivery of it.
  constraint image_generation_jobs_managed_usage_fk
    foreign key (user_id, idempotency_key)
    references public.managed_usage_requests(user_id, idempotency_key)
    on delete cascade,
  constraint image_generation_jobs_edit_shape check (
    operation = 'generate'
    or source_image_sha256 is not null
  ),
  constraint image_generation_jobs_terminal_shape check (
    (status = 'completed' and actual_cost_microusd is not null and terminal_at is not null)
    or (status = 'failed' and public_error is not null and retryable and terminal_at is null)
    or (status = 'failed' and public_error is not null and not retryable and terminal_at is not null)
    or (status = 'canceled' and terminal_at is not null)
    or (status in ('queued', 'processing') and terminal_at is null)
  ),
  constraint image_generation_jobs_claim_shape check (
    (claim_token is null and claim_expires_at is null)
    or (claim_token is not null and claim_expires_at is not null)
  )
);

-- One row per delivered candidate. The unique asset_id keeps a media asset from
-- being claimed by two jobs, and the cascade from media_assets means a deleted
-- image cannot leave a job pointing at nothing.
create table if not exists public.image_generation_job_assets (
  job_id uuid not null references public.image_generation_jobs(id) on delete cascade,
  candidate_index integer not null check (candidate_index between 0 and 3),
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  user_id text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (job_id, candidate_index),
  unique (asset_id)
);

create index if not exists idx_image_generation_jobs_due
  on public.image_generation_jobs(next_attempt_at, created_at)
  where status in ('queued', 'processing');

create index if not exists idx_image_generation_jobs_user_created
  on public.image_generation_jobs(user_id, created_at desc);

create index if not exists idx_image_generation_jobs_conversation_created
  on public.image_generation_jobs(conversation_id, created_at desc)
  where conversation_id is not null;

create index if not exists idx_image_generation_job_assets_job
  on public.image_generation_job_assets(job_id, candidate_index);

alter table public.image_generation_jobs enable row level security;
alter table public.image_generation_jobs force row level security;
alter table public.image_generation_job_assets enable row level security;
alter table public.image_generation_job_assets force row level security;

drop policy if exists image_generation_jobs_tenant_isolation on public.image_generation_jobs;
create policy image_generation_jobs_tenant_isolation
  on public.image_generation_jobs for all
  using (public.app_row_is_visible(user_id, organization_id))
  with check (public.app_row_is_writable(user_id, organization_id));

drop policy if exists image_generation_job_assets_tenant_isolation
  on public.image_generation_job_assets;
create policy image_generation_job_assets_tenant_isolation
  on public.image_generation_job_assets for all
  using (public.app_row_is_visible(user_id, organization_id))
  with check (public.app_row_is_writable(user_id, organization_id));

-- Every writer of these rows is a request running under a bound subject. Do not
-- add a NULL-subject policy: forgetting to bind one must fail closed rather than
-- expose every account's prompts.
revoke all on public.image_generation_jobs from public;
revoke all on public.image_generation_job_assets from public;
grant select, insert, update on public.image_generation_jobs to app_rls;
grant select, insert, delete on public.image_generation_job_assets to app_rls;

-- Deliberately no profile-delete guard. 0105 added one for video because the
-- erasure path was extended in the same change to answer for video work; there
-- is no such owner for image jobs yet, and a guard without one is a table that
-- makes account deletion fail forever. The cascade above is what keeps erasure
-- whole until account-erasure.ts names this table in its inventory.

commit;
