-- NOT YET APPLIED: draft only, pending explicit approval before running.
-- Cancellation recorded before the finalizer's row lock rejects completion for
-- every provider. This guards settlement, not pre-finalization asset visibility.

begin;

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

commit;
