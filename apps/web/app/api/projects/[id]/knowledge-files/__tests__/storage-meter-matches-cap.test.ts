import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(process.cwd(), 'app/api/projects/[id]/knowledge-files/route.ts'),
  'utf8',
);

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

  it('never lets a failed meter read take the file list down with it', () => {
    // Both reads the meter needs — the plan and the usage sum — are wrapped.
    // An unwrapped one turns a context number into a 500 on the list itself.
    const getHandler = source.slice(
      source.indexOf('let limitBytes: number | null = null;'),
      source.indexOf('storage: { usedBytes, limitBytes }'),
    );
    expect(getHandler).toContain('SubscriptionService.getSubscription');
    expect(getHandler.match(/} catch \(error\) {/g)?.length).toBeGreaterThanOrEqual(2);
    expect(getHandler).not.toContain('throw error;');
  });
});
