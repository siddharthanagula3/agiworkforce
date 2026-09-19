import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getSupportCorpus } from '@/lib/support/agent/corpus';
import { retrieveSupportChunks } from '@/lib/support/agent/retrieval/retrieve';
import { helpResultPath } from '@/lib/support/help-articles';
import { absoluteUrl } from '@/lib/seo/site';

export const runtime = 'nodejs';

/**
 * Help centre search.
 *
 * Deliberately not behind the support widget flag or the answer engine's flag.
 * Retrieval is deterministic BM25 over the support corpus, which is built from
 * pages this site already publishes, so there is no model call, no per-request
 * cost and nothing here a reader could not reach by browsing. Turning the
 * assistant off must not take the help centre's search with it.
 */

const QuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(12).optional(),
});

export interface HelpSearchResult {
  docId: string;
  title: string;
  url: string;
  path: string;
  category: string;
  snippet: string;
}

export interface HelpSearchResponse {
  query: string;
  results: HelpSearchResult[];
  corpus: 'available' | 'unavailable';
}

async function handleSearch(request: NextRequest) {
  const rateLimited = await withRateLimit(request, 'help-search');
  if (rateLimited) return rateLimited;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    q: url.searchParams.get('q') ?? '',
    ...(url.searchParams.get('limit') ? { limit: url.searchParams.get('limit') } : {}),
  });
  if (!parsed.success) {
    throw createError.validation('Search needs a query of at least two characters', parsed.error);
  }

  const corpus = getSupportCorpus();
  if (!corpus.available) {
    // Honest degradation: an empty result set would read as "nothing matched",
    // which is a different answer from "the index is not loaded".
    logger.error({ reason: corpus.reason }, '[help-search] corpus unavailable');
    const body: HelpSearchResponse = {
      query: parsed.data.q,
      results: [],
      corpus: 'unavailable',
    };
    return NextResponse.json(body, { status: 503, headers: { 'cache-control': 'no-store' } });
  }

  const retrieval = retrieveSupportChunks(parsed.data.q, {
    ...(parsed.data.limit ? { limit: parsed.data.limit } : {}),
  });

  const seen = new Set<string>();
  const results: HelpSearchResult[] = [];
  for (const hit of retrieval.chunks) {
    if (seen.has(hit.chunk.docId)) continue;
    seen.add(hit.chunk.docId);
    results.push({
      docId: hit.chunk.docId,
      title: hit.citation.title,
      url: absoluteUrl(helpResultPath(hit.chunk)),
      path: helpResultPath(hit.chunk),
      category: hit.chunk.category,
      snippet: hit.citation.snippet,
    });
  }

  logger.info(
    { query: parsed.data.q.length, results: results.length, passedFloor: retrieval.passedFloor },
    '[help-search] answered',
  );

  const body: HelpSearchResponse = { query: parsed.data.q, results, corpus: 'available' };
  return NextResponse.json(body, {
    headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=600' },
  });
}

export const GET = withErrorHandler(handleSearch);
