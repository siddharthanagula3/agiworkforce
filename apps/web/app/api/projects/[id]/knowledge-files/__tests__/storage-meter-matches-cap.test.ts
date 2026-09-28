import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = [
  'app/api/projects/[id]/knowledge-files/route.ts',
  'lib/server/project-knowledge-files.ts',
]
  .map((file) => readFileSync(join(process.cwd(), file), 'utf8'))
  .join('\n');

const WORKSPACE_PLAN_READ =
  /resolveEntitledPlanTier\(db, userId, \{\s*workspaceOrganizationId: organizationId,?\s*\}\)/g;

function usageQueries(): string[] {
  return source
    .split('select coalesce(sum(k.byte_count), 0) as total')
    .slice(1)
    .map((chunk) => chunk.slice(0, 400));
}

// The GET meter and the POST cap sum project_knowledge_files independently. If
// they scope differently the meter shows headroom the upload then refuses,
// which is worse than showing nothing.
describe('the storage meter is computed over the same set the cap enforces', () => {
  it('has both a meter query and a cap query', () => {
    expect(usageQueries()).toHaveLength(2);
  });

  it('scopes both by user, organization, and live rows only', () => {
    for (const query of usageQueries()) {
      expect(query).toContain('p.user_id = $1');
      expect(query).toContain('p.organization_id is not distinct from $2::uuid');
      expect(query).toContain('k.deleted_at is null');
      expect(query).toContain('k.superseded_at is null');
    }
  });

  it('sizes the meter and the cap from the same seat-aware plan of the active workspace', () => {
    expect(source.match(WORKSPACE_PLAN_READ)).toHaveLength(2);
    expect(source).not.toContain('SubscriptionService');
  });

  it('never lets a failed meter read take the file list down with it', () => {
    const getHandler = source.slice(
      source.indexOf('let limitBytes: number | null = null;'),
      source.indexOf('storage: { usedBytes, limitBytes }'),
    );
    expect(getHandler.match(WORKSPACE_PLAN_READ)).toHaveLength(1);
    expect(getHandler.match(/} catch \(error\) {/g)?.length).toBeGreaterThanOrEqual(2);
    expect(getHandler).not.toContain('throw error;');
  });
});
