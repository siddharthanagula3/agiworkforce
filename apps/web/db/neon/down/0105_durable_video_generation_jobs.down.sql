-- Reverses 0105_durable_video_generation_jobs.sql.
--
-- DESTRUCTIVE: dropping this table abandons every queued or processing provider
-- task and removes the only mapping from its opaque AGI job id to the billing
-- reservation and eventual media asset. Before running, stop new provider
-- submissions and the video Workflow. The guard below refuses to erase active
-- rows. Terminal job history is still deliberately deleted by an approved
-- rollback; existing media_assets rows survive.

begin;

do $$
begin
  if to_regclass('public.video_generation_jobs') is not null
    and (
      exists (
        select 1
          from public.video_generation_jobs
         where status in ('submitting', 'queued', 'processing')
            or (
              incident_alert_status is not null
              and incident_alert_status is distinct from 'delivered'
            )
      )
      or exists (
        select 1
          from public.managed_usage_requests request_row
         where request_row.idempotency_key like 'agi.media.%.video.%'
           and (
             request_row.status in ('reserving', 'reserved', 'provider_started')
             or request_row.final_settlement_status = 'pending'
           )
      )
      or exists (
        select 1
          from public.credit_settlement_jobs settlement
         where settlement.status = 'pending'
           and settlement.metadata->>'type' = 'managed_usage_finalization'
           and settlement.metadata #>> '{usage,operation}' = 'video'
      )
      or exists (
        select 1
          from public.credit_settlement_jobs settlement
         where settlement.status = 'terminal'
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
      or exists (
        select 1
          from public.profiles profile
         where (
           profile.video_generation_admission_token is not null
           and profile.video_generation_admission_expires_at > now()
         )
            or (
              profile.video_generation_erasure_fence_token is not null
              and profile.video_generation_erasure_fence_expires_at > now()
            )
      )
    ) then
    raise exception using
      errcode = '55000',
      message = 'refusing to roll back durable video jobs while work or incident alerts are active';
  end if;
end;
$$;

drop trigger if exists guard_profile_delete_with_video_jobs on public.profiles;
drop function if exists public.guard_profile_delete_with_video_jobs();

drop function if exists public.mark_video_generation_outcome_unknown(uuid, text, text, text, text);
drop function if exists public.reconcile_video_generation_billing_settlement(uuid);
drop function if exists public.finalize_video_generation_job(uuid, text, text, uuid, text, integer);
drop function if exists public.claim_video_generation_job(uuid, text, integer);
drop function if exists public.begin_video_generation_provider_submission(uuid, text, text, integer);
drop table if exists public.video_generation_jobs;
drop index if exists public.idx_credit_settlement_jobs_video_incident_alert;
alter table public.credit_settlement_jobs
  drop constraint if exists credit_settlement_jobs_video_incident_alert_claim_shape;
alter table public.credit_settlement_jobs
  drop column if exists video_incident_alert_claim_expires_at;
alter table public.credit_settlement_jobs
  drop column if exists video_incident_alert_claim_token;
alter table public.credit_settlement_jobs
  drop column if exists video_incident_alert_last_error;
alter table public.credit_settlement_jobs
  drop column if exists video_incident_alert_attempts;
alter table public.credit_settlement_jobs
  drop column if exists video_incident_alert_status;
alter table public.profiles drop column if exists video_generation_admission_expires_at;
alter table public.profiles drop column if exists video_generation_admission_token;
alter table public.profiles drop column if exists video_generation_erasure_fence_expires_at;
alter table public.profiles drop column if exists video_generation_erasure_fence_token;

delete from public.schema_migrations
where filename = '0105_durable_video_generation_jobs.sql';

commit;
