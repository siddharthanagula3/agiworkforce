import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'app/api/user/export/route.ts'), 'utf8');

function exportedSections(): string[] {
  return [...source.matchAll(/section: '([a-z_]+)'/g)].map((m) => m[1] as string);
}

// The export IS the self-serve access right. A category the product can erase
// on request but cannot show is half a right: media_assets was in the erasure
// inventory and missing here until 2026-08-21.
describe('the data export covers the personal data the product holds', () => {
  it('includes the files a user uploaded and the media generated for them', () => {
    expect(exportedSections()).toContain('media_assets');
  });

  it('exports metadata and a fetchable location, not inlined bytes', () => {
    // Bounded to the schema literal. An unbounded slice runs to end of file and
    // matches "data:" and "buffer" in unrelated code below.
    const start = source.indexOf('const mediaAssetExportSchema');
    const block = source.slice(start, source.indexOf('});', start));
    expect(block).toContain('storage_url');
    // Inlining media would make a JSON download unusable; a list with no way to
    // reach the files would not be an answer either.
    expect(block).not.toMatch(/base64|data:|buffer/i);
  });

  it('scopes every export query to the requesting user', () => {
    for (const query of source.matchAll(/sql: `([\s\S]*?)`/g)) {
      const sql = query[1] as string;
      if (!/\bfrom\b/i.test(sql)) continue;
      expect(sql, `unscoped export query: ${sql.slice(0, 80)}`).toMatch(/\$1/);
    }
  });

  it('still covers the categories it already did', () => {
    const sections = exportedSections();
    for (const required of [
      'profile',
      'conversations',
      'messages',
      'projects',
      'project_knowledge_files',
      'memories',
      'artifacts',
    ]) {
      expect(sections).toContain(required);
    }
  });
});
