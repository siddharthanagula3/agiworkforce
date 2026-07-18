import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('project knowledge extraction migration', () => {
  it('adds bounded server-extracted text without weakening project ownership', async () => {
    const sql = await readFile(
      join(process.cwd(), 'db/neon/0064_project_knowledge_extraction.sql'),
      'utf8',
    );

    expect(sql).toMatch(/alter table(?: if exists)? public\.project_knowledge_files/i);
    expect(sql).toMatch(/add column if not exists extracted_text text/i);
    expect(sql).toMatch(/add column if not exists extracted_at timestamptz/i);
    expect(sql).toMatch(/check \(extracted_text is null or char_length\(extracted_text\)/i);
  });
});
