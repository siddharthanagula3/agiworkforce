import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'db/neon/0366_media_jobs_chrome_source_surface.sql');
const downMigrationPath = join(
  process.cwd(),
  'db/neon/down/0366_media_jobs_chrome_source_surface.down.sql',
);

describe('media jobs chrome source surface migration', () => {
  it('admits chrome on both media job tables and keeps every surface they held', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toMatch(
      /image_generation_jobs_source_surface_check\s+check \(source_surface = any \(array\['web', 'mobile', 'desktop', 'cli', 'chrome'\]\)\)/,
    );
    expect(sql).toMatch(
      /video_generation_jobs_source_surface_check\s+check \(source_surface = any \(array\['web', 'mobile', 'desktop', 'chrome'\]\)\)/,
    );
    expect(sql).not.toMatch(/not valid/i);
  });

  it('restores the earlier lists without rejecting rows chrome already wrote', async () => {
    const sql = await readFile(downMigrationPath, 'utf8');

    expect(sql).toMatch(/array\['web', 'mobile', 'desktop', 'cli'\]\)\)\s+not valid/);
    expect(sql).toMatch(/array\['web', 'mobile', 'desktop'\]\)\)\s+not valid/);
    expect(sql).toContain("filename = '0366_media_jobs_chrome_source_surface.sql'");
  });
});
