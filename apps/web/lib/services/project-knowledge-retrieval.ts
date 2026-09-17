import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { SearchHit } from '@agiworkforce/data-layer/search';

import { logger } from '@/lib/logger';
import type { KnowledgePassage, PassageSelection } from './project-knowledge-passages';
import { createPostgresSearchProvider } from './retrieval-search-service';

const MAX_RETRIEVED_PASSAGES = 24;
const MAX_PASSAGES_PER_FILE = 8;

export interface IndexedKnowledgeFile {
  fileId: string;
  extractedText: string;
}

function isDatabaseAdapter(db: Pick<DatabaseAdapter, 'query'>): db is DatabaseAdapter {
  const candidate = db as Partial<DatabaseAdapter>;
  return typeof candidate.transaction === 'function' && typeof candidate.execute === 'function';
}

/**
 * Hybrid-retrieved passages for the files whose text does not fit the prompt
 * whole. Returns an empty map when the database handle cannot run the index
 * (a bare query stub) or the index has nothing for these files yet, which
 * leaves those files to per-request passage selection.
 */
export async function retrieveIndexedKnowledgeHits(input: {
  db: Pick<DatabaseAdapter, 'query'>;
  userId: string;
  organizationId: string | null;
  query: string;
  files: readonly IndexedKnowledgeFile[];
}): Promise<Map<string, SearchHit[]>> {
  const byFile = new Map<string, SearchHit[]>();
  if (!input.query.trim() || input.files.length === 0 || !isDatabaseAdapter(input.db)) {
    return byFile;
  }
  try {
    const { hits } = await createPostgresSearchProvider({
      db: input.db,
      userId: input.userId,
      organizationId: input.organizationId,
      semantic: true,
    }).search({
      text: input.query,
      kinds: ['project_knowledge'],
      sourceIds: input.files.map((file) => file.fileId),
      limit: MAX_RETRIEVED_PASSAGES,
      maxPerSource: MAX_PASSAGES_PER_FILE,
      match: 'any_term',
    });
    for (const hit of hits) {
      byFile.set(hit.sourceId, [...(byFile.get(hit.sourceId) ?? []), hit]);
    }
  } catch (error) {
    logger.warn(
      { err: error, userId: input.userId },
      '[project-context] indexed knowledge retrieval failed; selecting passages per request',
    );
  }
  return byFile;
}

/**
 * Turns index hits into prompt passages for one file. A hit whose offsets no
 * longer match the stored text (the file changed after it was indexed) is
 * dropped, overlapping windows are merged so no text is sent twice, and hits
 * are taken in rank order until the file's budget is spent.
 */
export function passagesFromIndexedHits(input: {
  content: string;
  leadingTrimmed: number;
  hits: readonly SearchHit[];
  budgetChars: number;
}): PassageSelection | null {
  const chosen: KnowledgePassage[] = [];
  let spent = 0;
  for (const hit of input.hits) {
    if (hit.start === null || hit.end === null) continue;
    const start = hit.start - input.leadingTrimmed;
    const end = Math.min(input.content.length, hit.end - input.leadingTrimmed);
    if (start < 0 || end <= start) continue;
    const text = input.content.slice(start, end);
    if (text.trim() !== hit.text.trim()) continue;
    if (spent + text.length > input.budgetChars) continue;
    chosen.push({ start, end, text });
    spent += text.length;
  }
  if (chosen.length === 0) return null;

  chosen.sort((left, right) => left.start - right.start);
  const merged: KnowledgePassage[] = [];
  for (const passage of chosen) {
    const previous = merged.at(-1);
    if (previous && passage.start <= previous.end) {
      const end = Math.max(previous.end, passage.end);
      merged[merged.length - 1] = {
        start: previous.start,
        end,
        text: input.content.slice(previous.start, end),
      };
    } else {
      merged.push(passage);
    }
  }
  return { passages: merged, strategy: 'passages', totalChars: input.content.length };
}
