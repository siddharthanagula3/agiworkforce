-- =============================================================================
-- 0105 — durable, tenant-owned asynchronous video generation jobs
--
-- A provider task id is neither an ownership record nor a durable AGI result.
-- This table makes the opaque AGI job id the public handle and keeps the
-- provider handle, Workflow owner, billing reservation, retry schedule,
-- reconciliation lease, final media asset, and tenant scope together. Status
-- requests and the durable Workflow claim the same row, so closing a client
-- cannot abandon paid work.
--
-- Billing stays in the existing managed_usage_requests lifecycle. The functions
-- below mark provider egress, renew the reservation while a claimed job is
-- active, and settle it under one stable finalization identity. They do not
-- introduce a second credit ledger.
-- =============================================================================

-- Data-only GDPR erasure must serialize with generation without scheduling the
-- user's authentication account for deletion. These expiring profile fields are
-- a separate fence from deletion_requested_at/deletion_scheduled_for; the
-- account-purge path continues to own those durable deletion flags.
alter table public.profiles
  add column if not exists video_generation_erasure_fence_token text
    check (
      video_generation_erasure_fence_token is null
      or length(video_generation_erasure_fence_token) between 8 and 128
    );
alter table public.profiles
  add column if not exists video_generation_erasure_fence_expires_at timestamptz;
alter table public.profiles
  add column if not exists video_generation_admission_token text
    check (
      video_generation_admission_token is null
      or length(video_generation_admission_token) between 8 and 128
    );
alter table public.profiles
  add column if not exists video_generation_admission_expires_at timestamptz;

-- A terminal reservation release can exist before the video job INSERT (for
-- example when the profile erasure fence wins). Keep an alert outbox on the
-- canonical settlement row so that boundary has an unattended owner too.
alter table public.credit_settlement_jobs
  add column if not exists video_incident_alert_status text
    check (
      video_incident_alert_status is null
      or video_incident_alert_status = any (array['pending', 'delivered', 'exhausted'])
    );
alter table public.credit_settlement_jobs
  add column if not exists video_incident_alert_attempts integer not null default 0
    check (video_incident_alert_attempts between 0 and 100);
alter table public.credit_settlement_jobs
  add column if not exists video_incident_alert_last_error text
    check (
      video_incident_alert_last_error is null
      or length(video_incident_alert_last_error) <= 500
    );
alter table public.credit_settlement_jobs
  add column if not exists video_incident_alert_claim_token text;
alter table public.credit_settlement_jobs
  add column if not exists video_incident_alert_claim_expires_at timestamptz;

alter table public.credit_settlement_jobs
  add constraint credit_settlement_jobs_video_incident_alert_claim_shape check (
    (
      video_incident_alert_claim_token is null
      and video_incident_alert_claim_expires_at is null
    )
    or (
      video_incident_alert_claim_token is not null
      and video_incident_alert_claim_expires_at is not null
      and video_incident_alert_status = 'pending'
    )
  );

create table if not exists public.video_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  -- Web chat binds the paid job to a placeholder row before provider egress.
  -- Mobile/Desktop jobs deliberately leave these null. Deleting chat history
  -- detaches the projection without deleting or abandoning provider/billing
  -- work, which remains owned by user_id and the durable job id.
  conversation_id uuid references public.web_conversations(id) on delete set null,
  assistant_message_id uuid references public.web_messages(id) on delete set null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  billing_lease_token text not null check (length(billing_lease_token) between 1 and 128),
  provider text not null check (provider = any (array['google', 'runway', 'openrouter'])),
  model text not null check (length(btrim(model)) between 1 and 200),
  workflow_run_id text check (workflow_run_id is null or length(workflow_run_id) between 1 and 255),
  provider_task_id text check (provider_task_id is null or length(provider_task_id) between 1 and 512),
  provider_failure_code text check (
    provider_failure_code is null
    or provider_failure_code ~ '^[A-Z0-9_.-]{1,128}$'
  ),
  prompt text not null check (length(prompt) between 1 and 2000),
  duration_secs integer not null check (duration_secs between 2 and 30),
  resolution text not null check (resolution = any (array['480p', '720p', '1080p', '4k'])),
  aspect_ratio text not null check (
    aspect_ratio = any (array['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'])
  ),
  generate_audio boolean not null,
  source_surface text not null check (source_surface = any (array['web', 'mobile', 'desktop'])),
  estimated_cost_cents integer not null check (estimated_cost_cents >= 0),
  actual_cost_cents integer check (actual_cost_cents is null or actual_cost_cents >= 0),
  estimated_duration_secs integer not null check (estimated_duration_secs > 0),
  status text not null default 'submitting'
    check (status = any (array[
      'submitting', 'queued', 'processing', 'completed', 'failed', 'outcome_unknown'
    ])),
  provider_started_at timestamptz,
  cancel_requested_at timestamptz,
  provider_cancel_attempted_at timestamptz,
  provider_cancel_acknowledged_at timestamptz,
  last_provider_event_key text check (
    last_provider_event_key is null or length(last_provider_event_key) between 3 and 640
  ),
  last_provider_event_at timestamptz,
  cancel_attempts integer not null default 0 check (cancel_attempts between 0 and 5),
  cancel_last_error text check (cancel_last_error is null or length(cancel_last_error) <= 500),
  progress integer check (progress is null or progress between 0 and 100),
  asset_id uuid references public.media_assets(id) on delete cascade,
  public_error text check (public_error is null or length(public_error) <= 500),
  billing_outcome text
    check (billing_outcome is null or billing_outcome = any (
      array['completed', 'released', 'outcome_unknown']
    )),
  billing_settlement_status text
    check (billing_settlement_status is null or billing_settlement_status = any (
      array['succeeded', 'pending', 'terminal']
    )),
  incident_alert_status text
    check (incident_alert_status is null or incident_alert_status = any (
      array['pending', 'delivered', 'exhausted']
    )),
  incident_alert_attempts integer not null default 0
    check (incident_alert_attempts between 0 and 100),
  incident_alert_last_error text
    check (incident_alert_last_error is null or length(incident_alert_last_error) <= 500),
  incident_alert_claim_token text,
  incident_alert_claim_expires_at timestamptz,
  reconcile_failures integer not null default 0 check (reconcile_failures between 0 and 20),
  -- The request owns the pre-egress handoff. Status/Workflow reconciliation
  -- cannot claim a fresh row between INSERT, Workflow attachment, and provider
  -- submission; cancellation explicitly advances this timestamp to now().
  next_attempt_at timestamptz not null default (now() + interval '2 minutes'),
  reconcile_claim_token text,
  reconcile_claim_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  terminal_at timestamptz,
  unique (user_id, idempotency_key),
  unique (workflow_run_id),
  unique (provider, provider_task_id),
  unique (asset_id),
  unique (assistant_message_id),
  constraint video_generation_jobs_managed_usage_fk
    foreign key (user_id, idempotency_key)
    references public.managed_usage_requests(user_id, idempotency_key)
    on delete restrict,
  constraint video_generation_jobs_terminal_shape check (
    (
      status = 'completed'
      and asset_id is not null
      and actual_cost_cents is not null
      and terminal_at is not null
    )
    or (status = 'failed' and public_error is not null and terminal_at is not null)
    or (status = 'outcome_unknown' and public_error is not null and terminal_at is not null)
    or (status in ('submitting', 'queued', 'processing') and terminal_at is null)
  ),
  constraint video_generation_jobs_claim_shape check (
    (reconcile_claim_token is null and reconcile_claim_expires_at is null)
    or (reconcile_claim_token is not null and reconcile_claim_expires_at is not null)
  ),
  constraint video_generation_jobs_incident_alert_claim_shape check (
    (incident_alert_claim_token is null and incident_alert_claim_expires_at is null)
    or (
      incident_alert_claim_token is not null
      and incident_alert_claim_expires_at is not null
      and incident_alert_status = 'pending'
    )
  )
);

create index if not exists idx_video_generation_jobs_reconcile
  on public.video_generation_jobs(next_attempt_at, created_at)
  where status in ('submitting', 'queued', 'processing');

create index if not exists idx_video_generation_jobs_user_created
  on public.video_generation_jobs(user_id, created_at desc);

create index if not exists idx_video_generation_jobs_conversation_created
  on public.video_generation_jobs(conversation_id, created_at desc)
  where conversation_id is not null;

create index if not exists idx_video_generation_jobs_incident_alert
  on public.video_generation_jobs(terminal_at, id)
  where incident_alert_status in ('pending', 'exhausted');

create index if not exists idx_credit_settlement_jobs_video_incident_alert
  on public.credit_settlement_jobs(completed_at, id)
  where status = 'terminal'
    and (
      video_incident_alert_status is null
      or video_incident_alert_status in ('pending', 'exhausted')
    );

alter table public.video_generation_jobs enable row level security;
alter table public.video_generation_jobs force row level security;

drop policy if exists video_generation_jobs_tenant_isolation
  on public.video_generation_jobs;
create policy video_generation_jobs_tenant_isolation
  on public.video_generation_jobs for all
  using (public.app_row_is_visible(user_id, organization_id))
  with check (public.app_row_is_writable(user_id, organization_id));

-- Workflow reconciliation uses the canonical unscoped Neon owner adapter, whose BYPASSRLS
-- behavior is documented in 0037. Do not add a NULL-subject app_rls policy:
-- forgetting to bind a request subject must fail closed, not expose every job.

revoke all on public.video_generation_jobs from public;
grant select, insert, update on public.video_generation_jobs to app_rls;

-- Atomically record that AGI is crossing the non-transactional provider
-- boundary and hold the job claim while the HTTP request is in flight. Neither
-- current provider documents a provider-side idempotency key, so a worker that
-- disappears after this commit must never replay generation.
create or replace function public.begin_video_generation_provider_submission(
  p_job_id uuid,
  p_user_id text,
  p_claim_token text,
  p_claim_seconds integer default 120
)
returns setof public.video_generation_jobs
language plpgsql
as $$
declare
  v_job public.video_generation_jobs%rowtype;
  v_transition record;
  v_claim_seconds integer;
begin
  if p_job_id is null
    or p_user_id is null
    or p_user_id is distinct from public.current_app_user_id()
    or p_claim_token is null
    or length(p_claim_token) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid video provider submission claim';
  end if;

  v_claim_seconds := greatest(60, least(coalesce(p_claim_seconds, 120), 600));
  select job.* into v_job
  from public.video_generation_jobs job
  where job.id = p_job_id and job.user_id = p_user_id
  for update;

  if not found then
    return;
  end if;
  if v_job.status <> 'submitting'
    or v_job.workflow_run_id is null
    or v_job.cancel_requested_at is not null
    or v_job.provider_task_id is not null
    or (v_job.reconcile_claim_expires_at is not null
        and v_job.reconcile_claim_expires_at > now()) then
    raise exception using errcode = '40001', message = 'video provider submission already claimed';
  end if;

  select transition.* into v_transition
  from public.mark_managed_usage_provider_started(
    v_job.user_id,
    v_job.idempotency_key,
    v_job.request_hash,
    v_job.billing_lease_token
  ) transition;

  if not found or v_transition.operation_result not in ('updated', 'already_updated') then
    raise exception using errcode = '40001', message = 'managed video provider start conflict';
  end if;

  update public.video_generation_jobs job
  set provider_started_at = coalesce(job.provider_started_at, now()),
      reconcile_claim_token = p_claim_token,
      reconcile_claim_expires_at = now() + make_interval(secs => v_claim_seconds),
      updated_at = now()
  where job.id = v_job.id;

  return query
    select job.* from public.video_generation_jobs job where job.id = v_job.id;
end;
$$;

revoke all on function public.begin_video_generation_provider_submission(
  uuid, text, text, integer
) from public;
grant execute on function public.begin_video_generation_provider_submission(
  uuid, text, text, integer
) to app_rls;

-- Claim one active job and extend its canonical managed-usage lease in the
-- same transaction. An already-held claim returns no row. A terminal billing
-- reservation fails the job rather than polling a provider for work we can no
-- longer settle consistently.
create or replace function public.claim_video_generation_job(
  p_job_id uuid,
  p_claim_token text,
  p_claim_seconds integer default 180
)
returns setof public.video_generation_jobs
language plpgsql
as $$
declare
  v_job public.video_generation_jobs%rowtype;
  v_subject text;
  v_claim_seconds integer;
  v_managed_status text;
  v_managed_settlement_status text;
begin
  if p_job_id is null
    or p_claim_token is null
    or length(p_claim_token) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid video reconciliation claim';
  end if;

  v_claim_seconds := greatest(30, least(coalesce(p_claim_seconds, 180), 600));
  v_subject := public.current_app_user_id();

  select job.* into v_job
  from public.video_generation_jobs job
  where job.id = p_job_id
  for update;

  if not found then
    return;
  end if;
  if v_subject is not null and v_job.user_id is distinct from v_subject then
    raise exception using errcode = '42501', message = 'video job tenant mismatch';
  end if;
  if v_job.status not in ('submitting', 'queued', 'processing')
    or v_job.next_attempt_at > now()
    or (v_job.reconcile_claim_expires_at is not null
        and v_job.reconcile_claim_expires_at > now()) then
    return;
  end if;

  -- The existing managed-usage table is FORCE-RLS and owner-scoped. Bind the
  -- already-locked job owner for this renewal, then restore the caller before
  -- touching the job row again.
  perform set_config('request.jwt.claim.sub', v_job.user_id, true);
  update public.managed_usage_requests request_row
  set lease_expires_at = greatest(
        request_row.lease_expires_at,
        now() + make_interval(secs => v_claim_seconds + 120)
      ),
      updated_at = now()
  where request_row.user_id = v_job.user_id
    and request_row.idempotency_key = v_job.idempotency_key
    and request_row.request_hash = v_job.request_hash
    and request_row.lease_token = v_job.billing_lease_token
    and request_row.status in ('reserved', 'provider_started');

  if not found then
    select request_row.status, request_row.final_settlement_status
      into v_managed_status, v_managed_settlement_status
    from public.managed_usage_requests request_row
    where request_row.user_id = v_job.user_id
      and request_row.idempotency_key = v_job.idempotency_key;

    perform set_config('request.jwt.claim.sub', coalesce(v_subject, ''), true);
    update public.video_generation_jobs job
    set status = case
          when v_managed_status = 'outcome_unknown' then 'outcome_unknown'
          else 'failed'
        end,
        public_error = case
          when v_managed_status = 'outcome_unknown'
            then 'The provider outcome could not be verified. The incident was recorded; contact support if you need help with the charge.'
          else 'The billing reservation expired before the video could be delivered.'
        end,
        billing_outcome = case
          when v_managed_status in ('completed', 'released', 'outcome_unknown')
            then v_managed_status
          else null
        end,
        billing_settlement_status = v_managed_settlement_status,
        incident_alert_status = case
          when v_managed_status = 'outcome_unknown'
            or v_managed_settlement_status = 'terminal' then 'pending'
          else job.incident_alert_status
        end,
        reconcile_claim_token = null,
        reconcile_claim_expires_at = null,
        terminal_at = now(),
        updated_at = now()
    where job.id = v_job.id;

    return query
      select job.* from public.video_generation_jobs job where job.id = v_job.id;
    return;
  end if;

  perform set_config('request.jwt.claim.sub', coalesce(v_subject, ''), true);
  update public.video_generation_jobs job
  set reconcile_claim_token = p_claim_token,
      reconcile_claim_expires_at = now() + make_interval(secs => v_claim_seconds),
      updated_at = now()
  where job.id = v_job.id;

  return query
    select job.* from public.video_generation_jobs job where job.id = v_job.id;
end;
$$;

revoke all on function public.claim_video_generation_job(uuid, text, integer) from public;
grant execute on function public.claim_video_generation_job(uuid, text, integer) to app_rls;

-- Close both the provider job and the existing managed-usage reservation while
-- holding the job row lock. The managed finalizer's stable settlement key makes
-- retries exactly-once; the job id doubles as the media asset id, so completion
-- cannot bill unless the authenticated, durable video row already exists.
create or replace function public.finalize_video_generation_job(
  p_job_id uuid,
  p_claim_token text,
  p_outcome text,
  p_asset_id uuid default null,
  p_public_error text default null,
  p_actual_cost_cents integer default null
)
returns setof public.video_generation_jobs
language plpgsql
as $$
declare
  v_job public.video_generation_jobs%rowtype;
  v_subject text;
  v_finalization record;
begin
  if p_job_id is null
    or p_claim_token is null
    or length(p_claim_token) not between 8 and 128
    or p_outcome not in ('completed', 'failed')
    or (p_outcome = 'completed' and (p_actual_cost_cents is null or p_actual_cost_cents < 0)) then
    raise exception using errcode = '22023', message = 'invalid video job finalization';
  end if;

  v_subject := public.current_app_user_id();
  select job.* into v_job
  from public.video_generation_jobs job
  where job.id = p_job_id
  for update;

  if not found then
    return;
  end if;
  if v_subject is not null and v_job.user_id is distinct from v_subject then
    raise exception using errcode = '42501', message = 'video job tenant mismatch';
  end if;
  if v_job.status in ('completed', 'failed', 'outcome_unknown') then
    return query
      select job.* from public.video_generation_jobs job where job.id = v_job.id;
    return;
  end if;
  if v_job.reconcile_claim_token is distinct from p_claim_token
    or v_job.reconcile_claim_expires_at is null
    or v_job.reconcile_claim_expires_at <= now() then
    raise exception using errcode = '40001', message = 'video reconciliation claim expired';
  end if;
  if p_outcome = 'completed'
    and v_job.provider = 'runway'
    and v_job.cancel_requested_at is not null then
    raise exception using errcode = '40001', message = 'video cancellation won finalization race';
  end if;

  -- Bind the already-locked job owner for the media_assets RLS check and the
  -- existing managed-usage finalizer. Workflow entered with no subject; status
  -- entered with this same verified subject.
  perform set_config('request.jwt.claim.sub', v_job.user_id, true);

  if p_outcome = 'completed' then
    if p_asset_id is distinct from v_job.id
      or not exists (
        select 1
        from public.media_assets asset
        where asset.id = p_asset_id
          and asset.user_id = v_job.user_id
          and asset.organization_id is not distinct from v_job.organization_id
          and asset.kind = 'video'
          and asset.deleted_at is null
      ) then
      raise exception using errcode = '23514', message = 'durable video asset is missing';
    end if;
  elsif p_public_error is null or length(btrim(p_public_error)) = 0 then
    raise exception using errcode = '22023', message = 'failed video job requires an error';
  end if;

  select finalized.* into v_finalization
  from public.finalize_managed_usage_request(
    v_job.user_id,
    v_job.idempotency_key,
    v_job.request_hash,
    v_job.billing_lease_token,
    p_outcome,
    case when p_outcome = 'completed' then p_actual_cost_cents else 0 end,
    jsonb_build_object(
      'operation', 'video',
      'sourceSurface', v_job.source_surface,
      'provider', v_job.provider,
      'model', v_job.model,
      'jobId', v_job.id,
      'durationSecs', v_job.duration_secs,
      'resolution', v_job.resolution,
      'aspectRatio', v_job.aspect_ratio,
      'generateAudio', v_job.generate_audio,
      'estimatedCostCents', v_job.estimated_cost_cents,
      'providerActualCostCents', case when p_outcome = 'completed' then p_actual_cost_cents else null end,
      'assetId', p_asset_id
    )
  ) finalized;

  if not found or v_finalization.operation_result not in ('finalized', 'already_finalized') then
    raise exception using errcode = '40001', message = 'managed video settlement conflict';
  end if;
  if (p_outcome = 'completed' and v_finalization.request_status <> 'completed')
    or (p_outcome = 'failed' and v_finalization.request_status <> 'released') then
    raise exception using
      errcode = '40001',
      message = 'managed video terminal outcome conflicts with job finalization';
  end if;

  -- Restore caller context before updating the FORCE-RLS job row. A user
  -- request restores its verified subject; the canonical Workflow owner uses its
  -- documented BYPASSRLS connection without adding a NULL-subject policy.
  perform set_config('request.jwt.claim.sub', coalesce(v_subject, ''), true);

  update public.video_generation_jobs job
  set status = p_outcome,
      progress = case when p_outcome = 'completed' then 100 else job.progress end,
      asset_id = case when p_outcome = 'completed' then p_asset_id else null end,
      public_error = case
        when p_outcome = 'failed' then left(btrim(p_public_error), 500)
        else null
      end,
      billing_outcome = v_finalization.request_status,
      billing_settlement_status = v_finalization.settlement_status,
      actual_cost_cents = case when p_outcome = 'completed' then p_actual_cost_cents else 0 end,
      incident_alert_status = case
        when v_finalization.settlement_status = 'terminal'
          or (p_outcome = 'completed' and p_actual_cost_cents > v_job.estimated_cost_cents)
          then coalesce(job.incident_alert_status, 'pending')
        else job.incident_alert_status
      end,
      reconcile_claim_token = null,
      reconcile_claim_expires_at = null,
      terminal_at = now(),
      updated_at = now()
  where job.id = v_job.id;

  return query
    select job.* from public.video_generation_jobs job where job.id = v_job.id;
end;
$$;

revoke all on function public.finalize_video_generation_job(uuid, text, text, uuid, text, integer)
  from public;
grant execute on function public.finalize_video_generation_job(uuid, text, text, uuid, text, integer)
  to app_rls;

-- A provider job can reach its terminal state while the durable credit delta
-- is still pending. The job Workflow calls this idempotent owner until the
-- generic credit queue resolves, then mirrors the authoritative managed row
-- and creates a durable incident marker if settlement became terminal.
create or replace function public.reconcile_video_generation_billing_settlement(
  p_job_id uuid
)
returns setof public.video_generation_jobs
language plpgsql
as $$
declare
  v_subject text := nullif(current_setting('request.jwt.claim.sub', true), '');
  v_job public.video_generation_jobs%rowtype;
  v_settlement_status text;
begin
  select job.* into v_job
    from public.video_generation_jobs job
   where job.id = p_job_id
   for update;

  if not found then
    return;
  end if;
  if v_subject is not null and v_job.user_id is distinct from v_subject then
    raise exception using errcode = '42501', message = 'video job tenant mismatch';
  end if;
  if v_job.status not in ('completed', 'failed', 'outcome_unknown')
    or v_job.billing_settlement_status is distinct from 'pending' then
    return query
      select job.* from public.video_generation_jobs job where job.id = v_job.id;
    return;
  end if;

  -- The queue is globally idempotent and SKIP LOCKED. A bounded batch makes
  -- this Workflow an unattended commercial-cadence owner without monopolizing
  -- a function invocation when unrelated settlements are ahead of this job.
  perform 1 from public.process_credit_settlement_queue(20);

  perform set_config('request.jwt.claim.sub', v_job.user_id, true);
  select request_row.final_settlement_status
    into v_settlement_status
    from public.managed_usage_requests request_row
   where request_row.user_id = v_job.user_id
     and request_row.idempotency_key = v_job.idempotency_key;
  perform set_config('request.jwt.claim.sub', coalesce(v_subject, ''), true);

  if v_settlement_status in ('succeeded', 'pending', 'terminal') then
    update public.video_generation_jobs job
       set billing_settlement_status = v_settlement_status,
           incident_alert_status = case
             when v_settlement_status = 'terminal'
               then coalesce(job.incident_alert_status, 'pending')
             else job.incident_alert_status
           end,
           updated_at = now()
     where job.id = v_job.id;
  end if;

  return query
    select job.* from public.video_generation_jobs job where job.id = v_job.id;
end;
$$;

revoke all on function public.reconcile_video_generation_billing_settlement(uuid) from public;
grant execute on function public.reconcile_video_generation_billing_settlement(uuid) to app_rls;

-- Close an unverifiable provider outcome without pretending the provider
-- failed. A zero-cost release is enqueued under the existing stable managed-
-- final settlement identity; it may still be pending or terminal, so user copy
-- must not claim credits have already returned. Both ledgers retain an explicit
-- outcome_unknown incident state. Recovery must never replay provider work.
create or replace function public.mark_video_generation_outcome_unknown(
  p_job_id uuid,
  p_claim_token text,
  p_public_error text,
  p_provider_task_id text default null,
  p_provider_failure_code text default null
)
returns setof public.video_generation_jobs
language plpgsql
as $$
declare
  v_job public.video_generation_jobs%rowtype;
  v_request public.managed_usage_requests%rowtype;
  v_subject text;
  v_settlement record;
  v_settlement_status text;
begin
  if p_job_id is null
    or p_claim_token is null
    or length(p_claim_token) not between 8 and 128
    or p_public_error is null
    or length(btrim(p_public_error)) = 0
    or (
      p_provider_failure_code is not null
      and p_provider_failure_code !~ '^[A-Z0-9_.-]{1,128}$'
    )
    or (p_provider_task_id is not null
        and length(p_provider_task_id) not between 1 and 512) then
    raise exception using errcode = '22023', message = 'invalid unknown video outcome';
  end if;

  v_subject := public.current_app_user_id();
  select job.* into v_job
  from public.video_generation_jobs job
  where job.id = p_job_id
  for update;

  if not found then
    return;
  end if;
  if v_subject is not null and v_job.user_id is distinct from v_subject then
    raise exception using errcode = '42501', message = 'video job tenant mismatch';
  end if;
  if v_job.status = 'outcome_unknown' then
    return query
      select job.* from public.video_generation_jobs job where job.id = v_job.id;
    return;
  end if;
  if v_job.status not in ('submitting', 'queued', 'processing')
    or v_job.asset_id is not null
    or v_job.reconcile_claim_token is distinct from p_claim_token
    or v_job.reconcile_claim_expires_at is null
    or v_job.reconcile_claim_expires_at <= now() then
    raise exception using errcode = '40001', message = 'video outcome-unknown claim expired';
  end if;

  perform set_config('request.jwt.claim.sub', v_job.user_id, true);
  select request_row.* into v_request
  from public.managed_usage_requests request_row
  where request_row.user_id = v_job.user_id
    and request_row.idempotency_key = v_job.idempotency_key
    and request_row.request_hash = v_job.request_hash
    and request_row.lease_token = v_job.billing_lease_token
  for update;

  if not found then
    raise exception using errcode = '40001', message = 'managed video reservation is missing';
  end if;

  if v_request.status in ('reserved', 'provider_started') then
    select settlement.* into v_settlement
    from public.enqueue_credit_settlement(
      v_job.user_id,
      -v_request.estimated_cost_cents,
      'Managed video outcome-unknown reservation release',
      jsonb_build_object(
        'type', 'managed_usage_outcome_unknown',
        'reason', 'video_provider_outcome_unverified',
        'managed_usage_request_id', v_request.id,
        'jobId', v_job.id,
        'provider', v_job.provider,
        'model', v_job.model,
        'providerTaskIdRecorded', p_provider_task_id is not null
      ),
      'managed-final:' || v_request.id::text
    ) settlement;

    if not found then
      raise exception using errcode = 'P0001', message = 'video outcome-unknown release returned no result';
    end if;
    v_settlement_status := v_settlement.settlement_status;

    update public.managed_usage_requests request_row
    set status = 'outcome_unknown',
        actual_cost_cents = 0,
        usage = jsonb_build_object(
          'operation', 'video',
          'jobId', v_job.id,
          'reason', 'video_provider_outcome_unverified'
        ),
        final_settlement_status = v_settlement.settlement_status,
        final_error_code = coalesce(v_settlement.error_code, 'VIDEO_PROVIDER_OUTCOME_UNKNOWN'),
        finalized_at = now(),
        updated_at = now()
    where request_row.id = v_request.id;
  elsif v_request.status = 'outcome_unknown' then
    v_settlement_status := v_request.final_settlement_status;
  else
    raise exception using errcode = '40001', message = 'managed video outcome is already terminal';
  end if;

  perform set_config('request.jwt.claim.sub', coalesce(v_subject, ''), true);
  update public.video_generation_jobs job
  set status = 'outcome_unknown',
      provider_task_id = coalesce(job.provider_task_id, p_provider_task_id),
      provider_failure_code = coalesce(job.provider_failure_code, p_provider_failure_code),
      public_error = left(btrim(p_public_error), 500),
      billing_outcome = 'outcome_unknown',
      billing_settlement_status = v_settlement_status,
      -- An unverifiable provider outcome is itself an operational incident,
      -- independent of whether the customer's release succeeded. A known
      -- provider task may still execute and cost AGI after the user was made
      -- whole, so every outcome_unknown row needs a durable human owner.
      incident_alert_status = 'pending',
      reconcile_claim_token = null,
      reconcile_claim_expires_at = null,
      terminal_at = now(),
      updated_at = now()
  where job.id = v_job.id;

  return query
    select job.* from public.video_generation_jobs job where job.id = v_job.id;
end;
$$;

revoke all on function public.mark_video_generation_outcome_unknown(
  uuid, text, text, text, text
) from public;
grant execute on function public.mark_video_generation_outcome_unknown(
  uuid, text, text, text, text
) to app_rls;

-- The legacy SECURITY DEFINER delete_user_data() predates durable video jobs.
-- Force it to roll back (and return success:false) whenever durable video owns
-- work or an undelivered billing incident. The route then uses
-- account-erasure.ts, which fences new admission, waits for active work,
-- removes private bytes, and deletes terminal rows in FK order. Checking only
-- video_generation_jobs is insufficient: admission and managed billing begin
-- before that row is inserted, and terminal pre-job settlement incidents must
-- remain discoverable until their alert is delivered.
create or replace function public.guard_profile_delete_with_video_jobs()
returns trigger
language plpgsql
as $$
begin
  if (
    (
      old.video_generation_admission_token is not null
      and old.video_generation_admission_expires_at > now()
    )
    or (
      old.video_generation_erasure_fence_token is not null
      and old.video_generation_erasure_fence_expires_at > now()
    )
    or exists (
      select 1
        from public.video_generation_jobs job
       where job.user_id = old.id
    )
    or exists (
      select 1
        from public.managed_usage_requests request_row
       where request_row.user_id = old.id
         and request_row.idempotency_key like 'agi.media.%.video.%'
         and (
           request_row.status in ('reserving', 'reserved', 'provider_started')
           or request_row.final_settlement_status = 'pending'
         )
    )
    or exists (
      select 1
        from public.credit_settlement_jobs settlement
       where settlement.user_id = old.id
         and settlement.status = 'pending'
         and settlement.metadata->>'type' = 'managed_usage_finalization'
         and settlement.metadata #>> '{usage,operation}' = 'video'
    )
    or exists (
      select 1
        from public.credit_settlement_jobs settlement
       where settlement.user_id = old.id
         and settlement.status = 'terminal'
         and settlement.metadata->>'type' = 'managed_usage_finalization'
         and settlement.metadata #>> '{usage,operation}' = 'video'
         and settlement.video_incident_alert_status is distinct from 'delivered'
         and (
           settlement.metadata #>> '{usage,jobId}' is null
           or not exists (
             select 1
               from public.video_generation_jobs alert_job
              where alert_job.id::text = settlement.metadata #>> '{usage,jobId}'
                and alert_job.incident_alert_status = 'delivered'
           )
         )
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'profile deletion requires durable video lifecycle erasure';
  end if;
  return old;
end;
$$;

revoke all on function public.guard_profile_delete_with_video_jobs() from public;

drop trigger if exists guard_profile_delete_with_video_jobs on public.profiles;
create trigger guard_profile_delete_with_video_jobs
  before delete on public.profiles
  for each row execute function public.guard_profile_delete_with_video_jobs();
