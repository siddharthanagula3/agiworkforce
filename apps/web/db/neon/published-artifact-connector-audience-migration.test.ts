import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0383_published_artifact_connector_audience.sql');
const down = read('down/0383_published_artifact_connector_audience.down.sql');

describe('0383 published artifact connector audience', () => {
  it('answers true only for a runnable publication whose audience is not public', () => {
    expect(up).toMatch(/app_published_artifact_allows_connectors[\s\S]*security definer/);
    expect(up).toContain("and a.visibility <> 'public'");
    expect(up).toContain('and public.app_can_run_published_artifact(a.id)');
    expect(up).toContain('returns boolean');
  });

  it('is callable by the app role only', () => {
    expect(up).toContain(
      'revoke all on function public.app_published_artifact_allows_connectors(uuid) from public;',
    );
    expect(up).toContain(
      'grant execute on function public.app_published_artifact_allows_connectors(uuid) to app_rls;',
    );
  });

  it('rolls back what it adds', () => {
    expect(down).toContain(
      'drop function if exists public.app_published_artifact_allows_connectors(uuid);',
    );
    expect(down).toContain("where filename = '0383_published_artifact_connector_audience.sql';");
  });
});
