import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';

/**
 * Fail-closed admission probe for the complete durable-video schema. Storage
 * and provider credentials alone are insufficient: admitting a generation
 * without its job table/functions would cross provider egress with no owner.
 */
export async function isVideoJobStoreReady(db: DatabaseAdapter): Promise<boolean> {
  try {
    const rows = await db.query<{ ready: boolean }>(
      `select (
         to_regclass('public.video_generation_jobs') is not null
         and to_regprocedure(
           'public.begin_video_generation_provider_submission(uuid,text,text,integer)'
         ) is not null
         and to_regprocedure(
           'public.claim_video_generation_job(uuid,text,integer)'
         ) is not null
         and to_regprocedure(
           'public.finalize_video_generation_job(uuid,text,text,uuid,text,integer)'
         ) is not null
         and to_regprocedure(
           'public.mark_video_generation_outcome_unknown(uuid,text,text,text,text)'
         ) is not null
         and to_regprocedure(
           'public.reconcile_video_generation_billing_settlement(uuid)'
         ) is not null
         and exists (
           select 1
             from information_schema.columns
            where table_schema = 'public'
              and table_name = 'video_generation_jobs'
              and column_name = 'workflow_run_id'
         )
         and exists (
           select 1
             from information_schema.columns
            where table_schema = 'public'
              and table_name = 'video_generation_jobs'
              and column_name = 'provider_failure_code'
         )
         and 7 = (
           select count(*)
             from information_schema.columns
            where table_schema = 'public'
              and table_name = 'video_generation_jobs'
              and column_name in (
                'conversation_id',
                'assistant_message_id',
                'aspect_ratio',
                'generate_audio',
                'actual_cost_cents',
                'last_provider_event_key',
                'last_provider_event_at'
              )
         )
         and 6 = (
           select count(*)
             from information_schema.columns
            where table_schema = 'public'
              and table_name = 'profiles'
              and column_name in (
                'deletion_requested_at',
                'deletion_scheduled_for',
                'video_generation_erasure_fence_token',
                'video_generation_erasure_fence_expires_at',
                'video_generation_admission_token',
                'video_generation_admission_expires_at'
              )
         )
         and 5 = (
           select count(*)
             from information_schema.columns
            where table_schema = 'public'
              and table_name = 'credit_settlement_jobs'
              and column_name in (
                'video_incident_alert_status',
                'video_incident_alert_attempts',
                'video_incident_alert_last_error',
                'video_incident_alert_claim_token',
                'video_incident_alert_claim_expires_at'
              )
         )
       ) as ready`,
    );
    return rows[0]?.ready === true;
  } catch (error) {
    logger.warn({ error }, 'Durable video job schema readiness check failed');
    return false;
  }
}
