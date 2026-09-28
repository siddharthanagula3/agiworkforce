import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8');
}

const route = read('app/api/projects/[id]/knowledge-files/route.ts');
const knowledge = read('lib/server/project-knowledge-files.ts');
const storage = read('lib/server/file-storage.ts');

function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  return source.slice(start, source.indexOf('\n}\n', start));
}

describe('the storage meter is computed over the same set the cap enforces', () => {
  it('reads the meter and enforces the cap through the one file storage module', () => {
    expect(route).toContain('readFileStorageMeter({ db, userId, organizationId })');
    expect(knowledge).toContain('assertFileStorageAvailable(');
    expect(`${route}\n${knowledge}`).not.toContain('coalesce(sum(');
  });

  it('sums Library files and project sources over live rows of the active workspace only', () => {
    const query = functionBody(storage, 'export async function sumFileStorageBytes');
    expect(query).toContain('from public.media_assets m');
    expect(query).toContain('m.organization_id is not distinct from $2::uuid');
    expect(query).toContain('not m.temporary_chat');
    expect(query).toContain('m.deleted_at is null');
    expect(query).toContain('from public.project_knowledge_files k');
    expect(query).toContain('p.organization_id is not distinct from $2::uuid');
    expect(query).toContain('k.deleted_at is null');
    expect(query).toContain('k.superseded_at is null');
  });

  it('sizes the meter and the cap from the same seat-aware plan of the active workspace', () => {
    expect(
      storage.match(
        /resolveEntitledPlanTier\(scope\.db, scope\.userId, \{\s*workspaceOrganizationId: scope\.organizationId,?\s*\}\)/g,
      ),
    ).toHaveLength(1);
    expect(functionBody(storage, 'export async function readFileStorageMeter')).toContain(
      'resolveFileStorageAllowance(scope)',
    );
    expect(functionBody(storage, 'export async function assertFileStorageAvailable')).toContain(
      'resolveFileStorageAllowance(scope)',
    );
    expect(storage).not.toContain('SubscriptionService');
  });

  it('never lets a failed meter read take the file list down with it', () => {
    const meter = functionBody(storage, 'export async function readFileStorageMeter');
    expect(meter.match(/} catch \(error\) {/g)?.length).toBeGreaterThanOrEqual(2);
    expect(meter).not.toContain('throw error;');
  });
});
