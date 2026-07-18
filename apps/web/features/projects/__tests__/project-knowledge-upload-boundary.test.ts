import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('project knowledge upload ownership', () => {
  it('routes both project source views through one upload transaction', () => {
    for (const path of [
      'features/projects/components/SourcesPanel.tsx',
      'features/projects/components/KnowledgeFilesPanel.tsx',
    ]) {
      const component = source(path);
      expect(component, path).toContain('uploadProjectKnowledgeFile');
      expect(component, path).not.toContain("fetch('/api/uploads/presign'");
      expect(component, path).not.toContain('crypto.subtle.digest');
    }
  });

  it('uses the shared attachment accept contract instead of a second MIME roster', () => {
    const sourcesPanel = source('features/projects/components/SourcesPanel.tsx');

    expect(sourcesPanel).toContain('ALLOWED_ATTACHMENT_ACCEPT');
    expect(sourcesPanel).not.toContain('ALLOWED_MIME_TYPES');
    expect(sourcesPanel).not.toContain('MAX_FILE_BYTES');
  });
});
