import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('cloud agent execution migration', () => {
  it('adds workflow identity and tenant-owned replay-safe operation receipts', async () => {
    const sql = await readFile(
      join(process.cwd(), 'db/neon/0063_cloud_agent_execution_operations.sql'),
      'utf8',
    );

    expect(sql).toMatch(/alter table public\.cloud_agent_runs[\s\S]*workflow_run_id/i);
    expect(sql).toMatch(/cloud_agent_approval_checkpoints[\s\S]*completed_steps/i);
    expect(sql).toMatch(/create table public\.cloud_agent_execution_operations/i);
    expect(sql).toMatch(/unique\s*\(run_id, operation_key\)/i);
    expect(sql).toMatch(/foreign key\s*\(run_id, user_id\)/i);
    expect(sql).toMatch(/retry_safety in \('safe', 'unsafe'\)/i);
    expect(sql).toMatch(/status in \('running', 'completed', 'failed', 'outcome_unknown'\)/i);
    expect(sql).toMatch(/cloud_agent_execution_operations[\s\S]*enable row level security/i);
    expect(sql).toMatch(/cloud_agent_execution_operations[\s\S]*force row level security/i);
    expect(sql).toMatch(/current_app_user_id\(\)/i);
    expect(sql).toMatch(/cloud_agent_execution_expired_lease_idx/i);
    expect(sql).toMatch(/revoke all[\s\S]*cloud_agent_execution_operations[\s\S]*from public/i);
  });
});
