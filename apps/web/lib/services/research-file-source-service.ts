import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { createPostgresSearchProvider } from '@/lib/services/retrieval-search-service';
import {
  MAX_RESEARCH_FILE_SOURCES,
  researchFileSourcesFromHits,
  type ResearchFileSource,
} from '@/app/api/llm/v1/chat/completions/lib/research-sources';

const CANDIDATE_LIMIT = MAX_RESEARCH_FILE_SOURCES * 3;
const MAX_PER_SOURCE = 2;

/**
 * The account's own indexed documents, searched for a research question (§24).
 *
 * Reads the retrieval index (migration 0202) rather than a second store, so a
 * document is searchable here exactly when it is searchable anywhere else, and
 * a file removed from the index disappears from research with it.
 *
 * A research run must not fail because the index is cold or the embedding
 * provider is down: an empty list means "nothing of yours matched", which is
 * the same thing a run with no saved files sees, and the run continues on the
 * web alone.
 */
export async function searchResearchFileSources(
  db: DatabaseAdapter,
  input: { userId: string; organizationId: string | null; query: string },
): Promise<ResearchFileSource[]> {
  const text = input.query.trim();
  if (!text) return [];
  try {
    const response = await createPostgresSearchProvider({
      db,
      userId: input.userId,
      organizationId: input.organizationId,
      semantic: true,
    }).search({ text, limit: CANDIDATE_LIMIT, maxPerSource: MAX_PER_SOURCE });
    return researchFileSourcesFromHits(response.hits);
  } catch (error) {
    logger.warn(
      { error, userId: input.userId },
      '[research] file sources unavailable; the run continues on the web alone',
    );
    return [];
  }
}
