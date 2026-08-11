import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'db/neon/0105_durable_video_generation_jobs.sql');
const downMigrationPath = join(
  process.cwd(),
  'db/neon/down/0105_durable_video_generation_jobs.down.sql',
);

describe('durable video generation jobs migration', () => {
  it('owns async provider, tenant, billing, reconciliation, and durable asset identity', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toMatch(/create table if not exists public\.video_generation_jobs/i);
    expect(sql).toMatch(
      /organization_id uuid references public\.organizations\(id\) on delete set null/i,
    );
    expect(sql).toMatch(
      /conversation_id uuid references public\.web_conversations\(id\) on delete set null/i,
    );
    expect(sql).toMatch(
      /assistant_message_id uuid references public\.web_messages\(id\) on delete set null/i,
    );
    expect(sql).toMatch(/unique \(assistant_message_id\)/i);
    expect(sql).toMatch(/provider_task_id text/i);
    expect(sql).toMatch(/provider_failure_code text/i);
    expect(sql).toMatch(/provider = any \(array\['google', 'runway', 'openrouter'\]\)/i);
    expect(sql).toMatch(/duration_secs between 2 and 30/i);
    expect(sql).toMatch(/aspect_ratio text not null/i);
    expect(sql).toMatch(/generate_audio boolean not null/i);
    expect(sql).toMatch(/actual_cost_cents integer/i);
    expect(sql).toMatch(
      /status = 'completed'[\s\S]*asset_id is not null[\s\S]*actual_cost_cents is not null/i,
    );
    expect(sql).toMatch(/last_provider_event_key text/i);
    expect(sql).toMatch(/provider_started_at timestamptz/i);
    expect(sql).toMatch(/cancel_requested_at timestamptz/i);
    expect(sql).toMatch(/provider_cancel_attempted_at timestamptz/i);
    expect(sql).toMatch(/provider_cancel_acknowledged_at timestamptz/i);
    expect(sql).toMatch(/billing_lease_token text not null/i);
    expect(sql).toMatch(/foreign key \(user_id, idempotency_key\)[\s\S]*managed_usage_requests/i);
    expect(sql).toMatch(/asset_id uuid references public\.media_assets\(id\) on delete cascade/i);
    expect(sql).toMatch(/unique \(asset_id\)/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/app_row_is_visible\(user_id, organization_id\)/i);
    expect(sql).not.toMatch(/video_generation_jobs_service_context/i);
    expect(sql).not.toMatch(/current_app_user_id\(\) is null/i);
    expect(sql).toMatch(/canonical unscoped Neon owner adapter/i);
    expect(sql).toMatch(/incident_alert_claim_token text/i);
    expect(sql).toMatch(/incident_alert_claim_expires_at timestamptz/i);
    expect(sql).toMatch(/video_generation_jobs_incident_alert_claim_shape/i);
    expect(sql).toMatch(/video_generation_erasure_fence_token text/i);
    expect(sql).toMatch(/video_generation_erasure_fence_expires_at timestamptz/i);
    expect(sql).toMatch(/video_generation_admission_token text/i);
    expect(sql).toMatch(/video_generation_admission_expires_at timestamptz/i);
    expect(sql).toMatch(/video_incident_alert_status text/i);
    expect(sql).toMatch(/credit_settlement_jobs_video_incident_alert_claim_shape/i);
  });

  it('claims one reconciler while renewing the original managed usage lease', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toMatch(/function public\.claim_video_generation_job/i);
    expect(sql).toMatch(/for update/i);
    expect(sql).toMatch(/reconcile_claim_expires_at > now\(\)/i);
    expect(sql).toMatch(/update public\.managed_usage_requests[\s\S]*lease_expires_at/i);
    expect(sql).toMatch(/request_row\.lease_token = v_job\.billing_lease_token/i);
  });

  it('marks the pre-egress boundary atomically and retains ambiguous outcomes without replay', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toMatch(/function public\.begin_video_generation_provider_submission/i);
    expect(sql).toMatch(/public\.mark_managed_usage_provider_started/i);
    expect(sql).toMatch(/v_job\.workflow_run_id is null/i);
    expect(sql).toMatch(/v_job\.cancel_requested_at is not null/i);
    expect(sql).toMatch(/next_attempt_at[\s\S]*now\(\) \+ interval '2 minutes'/i);
    expect(sql).toMatch(/provider_started_at = coalesce/i);
    expect(sql).toMatch(/function public\.mark_video_generation_outcome_unknown/i);
    expect(sql).toMatch(/status = 'outcome_unknown'/i);
    expect(sql).toMatch(/'managed-final:' \|\| v_request\.id::text/i);
    expect(sql).toMatch(/'video_provider_outcome_unverified'/i);
    expect(sql).toMatch(/billing_settlement_status = v_settlement_status/i);
    expect(sql).toMatch(/incident_alert_status = 'pending'/i);
    expect(sql).toMatch(/provider_failure_code = coalesce/i);
    expect(sql).not.toMatch(/support was alerted|reservation was released/i);
  });

  it('cannot bill completion before the stable owner-scoped video asset exists', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toMatch(/function public\.finalize_video_generation_job/i);
    expect(sql).toMatch(/p_asset_id is distinct from v_job\.id/i);
    expect(sql).toMatch(/asset\.user_id = v_job\.user_id/i);
    expect(sql).toMatch(/asset\.kind = 'video'/i);
    expect(sql).toMatch(/set_config\('request\.jwt\.claim\.sub', v_job\.user_id, true\)/i);
    expect(sql).toMatch(
      /set_config\('request\.jwt\.claim\.sub', coalesce\(v_subject, ''\), true\)/i,
    );
    expect(sql).toMatch(/public\.finalize_managed_usage_request/i);
    expect(sql).toMatch(/p_outcome = 'completed' then p_actual_cost_cents else 0 end/i);
    expect(sql).toMatch(/actual_cost_cents = case when p_outcome = 'completed'/i);
    expect(sql).toMatch(
      /incident_alert_status = case[\s\S]*p_actual_cost_cents > v_job\.estimated_cost_cents/i,
    );
    expect(sql).toMatch(/operation_result not in \('finalized', 'already_finalized'\)/i);
    expect(sql).toMatch(
      /p_outcome = 'completed'[\s\S]*request_status <> 'completed'[\s\S]*p_outcome = 'failed'[\s\S]*request_status <> 'released'/i,
    );
  });

  it('gives pending terminal billing an unattended queue and alert owner', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toMatch(/function public\.reconcile_video_generation_billing_settlement/i);
    expect(sql).toMatch(/process_credit_settlement_queue\(20\)/i);
    expect(sql).toMatch(/final_settlement_status[\s\S]*v_settlement_status/i);
    expect(sql).toMatch(
      /when v_settlement_status = 'terminal'[\s\S]*coalesce\(job\.incident_alert_status, 'pending'\)/i,
    );
  });

  it('routes legacy profile erasure through the lifecycle-safe video owner', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toMatch(/function public\.guard_profile_delete_with_video_jobs/i);
    expect(sql).toMatch(/before delete on public\.profiles/i);
    expect(sql).toMatch(/select 1\s+from public\.video_generation_jobs/i);
    expect(sql).toMatch(
      /old\.video_generation_admission_token is not null[\s\S]*old\.video_generation_admission_expires_at > now\(\)/i,
    );
    expect(sql).toMatch(
      /managed_usage_requests[\s\S]*idempotency_key like 'agi\.media\.%\.video\.%'[\s\S]*status in \('reserving', 'reserved', 'provider_started'\)[\s\S]*final_settlement_status = 'pending'/i,
    );
    expect(sql).toMatch(
      /credit_settlement_jobs[\s\S]*settlement\.status = 'pending'[\s\S]*metadata #>> '\{usage,operation\}' = 'video'/i,
    );
    expect(sql).toMatch(
      /credit_settlement_jobs[\s\S]*video_incident_alert_status is distinct from 'delivered'[\s\S]*metadata #>> '\{usage,jobId\}' is null/i,
    );
  });

  it('keeps already-outcome-unknown settlement idempotency initialized', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toMatch(
      /elsif v_request\.status = 'outcome_unknown' then[\s\S]*v_settlement_status := v_request\.final_settlement_status/i,
    );
    expect(sql).toMatch(/billing_settlement_status = v_settlement_status/i);
    expect(sql).not.toMatch(/billing_settlement_status = v_settlement\.settlement_status/i);
  });

  it('refuses destructive rollback while any provider-owned job is active', async () => {
    const downSql = await readFile(downMigrationPath, 'utf8');
    const guardPosition = downSql.indexOf("where status in ('submitting', 'queued', 'processing')");
    const raisePosition = downSql.indexOf('refusing to roll back durable video jobs');
    const dropPosition = downSql.indexOf('drop table if exists public.video_generation_jobs');

    expect(guardPosition).toBeGreaterThan(0);
    expect(raisePosition).toBeGreaterThan(guardPosition);
    expect(dropPosition).toBeGreaterThan(raisePosition);
    expect(downSql).toMatch(/raise exception[\s\S]*errcode = '55000'/i);
    expect(downSql).toMatch(
      /incident_alert_status is not null[\s\S]*incident_alert_status is distinct from 'delivered'/i,
    );
    expect(downSql).toMatch(
      /managed_usage_requests[\s\S]*idempotency_key like 'agi\.media\.%\.video\.%'[\s\S]*final_settlement_status = 'pending'/i,
    );
    expect(downSql).toMatch(
      /credit_settlement_jobs[\s\S]*settlement\.status = 'pending'[\s\S]*\{usage,operation\}' = 'video'/i,
    );
    expect(downSql).toMatch(
      /credit_settlement_jobs[\s\S]*video_incident_alert_status is distinct from 'delivered'/i,
    );
    expect(downSql).toContain('Terminal job history is still deliberately deleted');
    expect(downSql).toMatch(/drop column if exists video_generation_erasure_fence_token/i);
  });
});
