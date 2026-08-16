import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CloudAgentOriginSurfaceSchema } from '@agiworkforce/cloud-contracts';
import { describe, expect, it } from 'vitest';

describe('cloud agent runs migration', () => {
  it('adds durable tenant-owned runs and ordered canonical event replay', async () => {
    const sql = await readFile(join(process.cwd(), 'db/neon/0061_cloud_agent_runs.sql'), 'utf8');

    expect(sql).toMatch(/create table public\.cloud_agent_runs/i);
    expect(sql).toMatch(/unique\s*\(user_id, request_id\)/i);
    expect(sql).toMatch(/create table public\.cloud_agent_events/i);
    expect(sql).toMatch(/unique\s*\(run_id, sequence\)/i);
    expect(sql).toMatch(/foreign key\s*\(run_id, user_id\)/i);
    expect(sql).toMatch(/cloud_agent_runs[\s\S]*enable row level security/i);
    expect(sql).toMatch(/cloud_agent_events[\s\S]*enable row level security/i);
    expect(sql.match(/current_app_user_id\(\)/gi)).toHaveLength(4);
    expect(sql).toMatch(/cloud_agent_runs_active_user_updated_idx/i);
    expect(sql).toMatch(/cloud_agent_events_run_sequence_idx/i);
  });

  it('admits every origin surface the contract accepts', async () => {
    const migrations = await Promise.all(
      ['0061_cloud_agent_runs.sql', '0099_origin_surface_cli.sql'].map((file) =>
        readFile(join(process.cwd(), 'db/neon', file), 'utf8'),
      ),
    );
    const effective = migrations
      .flatMap((sql) => sql.split(/\bcheck\s*\(/i).slice(1))
      .filter((clause) => clause.includes('origin_surface'))
      .at(-1);

    expect(effective).toBeDefined();
    for (const surface of CloudAgentOriginSurfaceSchema.options) {
      expect(effective).toContain(`'${surface}'`);
    }
  });
});
