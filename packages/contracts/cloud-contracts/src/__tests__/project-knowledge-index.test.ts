import { describe, expect, it } from 'vitest';
import {
  isKnowledgeIndexInProgress,
  KNOWLEDGE_INDEX_IN_PROGRESS_STATUSES,
  managedCloudProjectKnowledgeFilePath,
  managedCloudProjectKnowledgeReindexPath,
  managedCloudProjectKnowledgeTextPath,
  ManagedCloudProjectKnowledgeIndexStateSchema,
} from '../index';

describe('project knowledge indexing', () => {
  it('treats pending, indexing and stale as in progress', () => {
    expect([...KNOWLEDGE_INDEX_IN_PROGRESS_STATUSES]).toEqual(['pending', 'indexing', 'stale']);
    for (const status of KNOWLEDGE_INDEX_IN_PROGRESS_STATUSES) {
      expect(isKnowledgeIndexInProgress({ status })).toBe(true);
    }
  });

  it('treats indexed, failed and a file with no index state as settled', () => {
    expect(isKnowledgeIndexInProgress({ status: 'indexed' })).toBe(false);
    expect(isKnowledgeIndexInProgress({ status: 'failed' })).toBe(false);
    expect(isKnowledgeIndexInProgress(null)).toBe(false);
    expect(isKnowledgeIndexInProgress(undefined)).toBe(false);
  });

  it('names only statuses the index state schema accepts', () => {
    for (const status of KNOWLEDGE_INDEX_IN_PROGRESS_STATUSES) {
      expect(
        ManagedCloudProjectKnowledgeIndexStateSchema.shape.status.safeParse(status).success,
      ).toBe(true);
    }
  });
});

describe('project knowledge file paths', () => {
  it('builds the reindex and extracted text paths under the file path', () => {
    const file = managedCloudProjectKnowledgeFilePath('project 1', 'file/2');
    expect(file).toBe('/api/projects/project%201/knowledge-files/file%2F2');
    expect(managedCloudProjectKnowledgeReindexPath('project 1', 'file/2')).toBe(`${file}/reindex`);
    expect(managedCloudProjectKnowledgeTextPath('project 1', 'file/2')).toBe(`${file}/text`);
  });
});
