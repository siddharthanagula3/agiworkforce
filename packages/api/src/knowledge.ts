/**
 * Knowledge API — typed wrappers for knowledge_* and project_*_knowledge Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface KnowledgeQueryResult {
  results: KnowledgeSearchResult[];
  totalCount: number;
}

export interface KnowledgeSearchResult {
  id: string;
  content: string;
  source: string;
  score: number;
  metadata: Record<string, unknown>;
}

// ---- Commands ----

export async function knowledgeAdd(
  content: string,
  source: string,
  metadata: Record<string, unknown>,
): Promise<string> {
  return command<string>('knowledge_add', { content, source, metadata });
}

export async function knowledgeQuery(query: string, limit: number): Promise<KnowledgeQueryResult> {
  return command<KnowledgeQueryResult>('knowledge_query', { query, limit });
}

export async function projectSearchKnowledge(
  projectId: string,
  query: string,
  limit?: number,
): Promise<KnowledgeSearchResult[]> {
  return command<KnowledgeSearchResult[]>('project_search_knowledge', {
    projectId,
    query,
    limit,
  });
}

export async function projectAddKnowledgeFile(
  projectId: string,
  filePath: string,
): Promise<string> {
  return command<string>('project_add_knowledge_file', { projectId, filePath });
}
