import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';

const TrackSearchSchema = z.object({
  query: z.string().min(1).max(500),
  resultCount: z.number().int().min(0),
  filters: z
    .object({
      role: z.enum(['user', 'assistant', 'system']).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      includeArchived: z.boolean().optional(),
    })
    .optional(),
});

type SessionRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
  updated_at: string;
  session_title: string | null;
};

type RecentSearchRow = {
  query: string;
  result_count: number;
  created_at: string;
};

type PopularSearchRow = {
  query: string;
  search_count: number;
  avg_results: number;
};

type SuggestionRow = {
  suggestion: string;
  source: string;
  score: number;
};

const CONTEXT_LENGTH = 50;

function extractMatch(
  text: string,
  query: string,
): { matched: string; before: string; after: string } {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return { matched: text.substring(0, CONTEXT_LENGTH), before: '', after: '' };
  }

  const matchEnd = matchIndex + query.length;
  const beforeStart = Math.max(0, matchIndex - CONTEXT_LENGTH);
  const afterEnd = Math.min(text.length, matchEnd + CONTEXT_LENGTH);

  return {
    matched: text.substring(matchIndex, matchEnd),
    before: text.substring(beforeStart, matchIndex),
    after: text.substring(matchEnd, afterEnd),
  };
}

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const q = url.searchParams.get('q') ?? '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);

  // Recent searches
  if (type === 'recent') {
    const rows = await db.query<RecentSearchRow>('select * from get_recent_searches($1, $2)', [
      userId,
      limit,
    ]);
    return NextResponse.json({ searches: rows });
  }

  // Popular searches
  if (type === 'popular') {
    const days = parseInt(url.searchParams.get('days') ?? '7', 10);
    const rows = await db.query<PopularSearchRow>('select * from get_popular_searches($1, $2)', [
      limit,
      days,
    ]);
    return NextResponse.json({ searches: rows });
  }

  // Search suggestions
  if (type === 'suggestions') {
    if (q.trim().length < 2) return NextResponse.json({ suggestions: [] });
    const rows = await db.query<SuggestionRow>('select * from get_search_suggestions($1, $2, $3)', [
      userId,
      q,
      limit,
    ]);
    return NextResponse.json({ suggestions: rows });
  }

  // Full search (default)
  if (!q.trim()) throw createError.validation('q query param required for search');

  const includeArchived = url.searchParams.get('includeArchived') === 'true';
  const role = url.searchParams.get('role') as 'user' | 'assistant' | 'system' | null;
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  // Search sessions by title
  const sessionParams: unknown[] = [userId, `%${q}%`];
  const sessionClauses: string[] = ['user_id = $1', 'title ilike $2'];
  if (!includeArchived) sessionClauses.push('is_active = true');
  if (startDate) {
    sessionClauses.push(`created_at >= $${sessionParams.length + 1}`);
    sessionParams.push(startDate);
  }
  if (endDate) {
    sessionClauses.push(`created_at <= $${sessionParams.length + 1}`);
    sessionParams.push(endDate);
  }

  const sessionRows = await db.query<SessionRow>(
    `select id, title, created_at, updated_at
     from web_conversations
     where ${sessionClauses.join(' and ')}
     order by updated_at desc
     limit $${sessionParams.length + 1}`,
    [...sessionParams, limit],
  );

  // Get user's session IDs for message search
  let sessionIdQuery = 'select id from web_conversations where user_id = $1';
  const sidParams: unknown[] = [userId];
  if (!includeArchived) sessionIdQuery += ' and is_active = true';
  const sessionIdRows = await db.query<{ id: string }>(sessionIdQuery, sidParams);
  const sessionIds = sessionIdRows.map((r) => r.id);

  let messageRows: MessageRow[] = [];
  if (sessionIds.length > 0) {
    const msgParams: unknown[] = [sessionIds, `%${q}%`];
    const msgClauses: string[] = ['conversation_id = any($1::uuid[])', 'content ilike $2'];
    if (role) {
      msgClauses.push(`role = $${msgParams.length + 1}`);
      msgParams.push(role);
    }
    if (startDate) {
      msgClauses.push(`created_at >= $${msgParams.length + 1}`);
      msgParams.push(startDate);
    }
    if (endDate) {
      msgClauses.push(`created_at <= $${msgParams.length + 1}`);
      msgParams.push(endDate);
    }

    messageRows = await db.query<MessageRow>(
      `select
         m.id,
         m.conversation_id,
         m.role,
         m.content,
         m.created_at,
         m.updated_at,
         c.title as session_title
       from web_messages m
       join web_conversations c on c.id = m.conversation_id
       where ${msgClauses.join(' and ')}
       order by m.created_at desc
       limit 100`,
      msgParams,
    );
  }

  const sessionResults = sessionRows.map((s) => {
    const match = extractMatch(s.title ?? '', q);
    return {
      type: 'session' as const,
      sessionId: s.id,
      sessionTitle: s.title ?? 'Untitled Chat',
      content: s.title ?? '',
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      matchedText: match.matched,
      contextBefore: match.before,
      contextAfter: match.after,
    };
  });

  const messageResults = messageRows.map((m) => {
    const match = extractMatch(m.content, q);
    return {
      type: 'message' as const,
      sessionId: m.conversation_id,
      sessionTitle: m.session_title ?? 'Untitled Chat',
      messageId: m.id,
      content: m.content,
      role: m.role as 'user' | 'assistant' | 'system',
      createdAt: m.created_at,
      updatedAt: m.updated_at,
      matchedText: match.matched,
      contextBefore: match.before,
      contextAfter: match.after,
    };
  });

  const allResults = [...sessionResults, ...messageResults]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);

  const stats = {
    totalResults: sessionResults.length + messageResults.length,
    sessionMatches: sessionResults.length,
    messageMatches: messageResults.length,
  };

  // Fire-and-forget search tracking
  if (q.trim()) {
    db.query('select track_search($1, $2, $3, $4)', [
      userId,
      q,
      stats.totalResults,
      JSON.stringify({ role, startDate, endDate, includeArchived }),
    ]).catch(() => {
      // Non-critical - swallow errors silently
    });
  }

  return NextResponse.json({ results: allResults, stats });
}

async function handlePost(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const body = await request.json();
  const parsed = TrackSearchSchema.safeParse(body);
  if (!parsed.success) throw createError.validation('Invalid request body');

  const { query, resultCount, filters } = parsed.data;

  await db.query('select track_search($1, $2, $3, $4)', [
    userId,
    query,
    resultCount,
    JSON.stringify(filters ?? {}),
  ]);

  return NextResponse.json({ tracked: true });
}

async function handleDelete(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const [result] = await db.query<{ clear_search_history: number }>(
    'select clear_search_history($1)',
    [userId],
  );

  return NextResponse.json({ cleared: result?.clear_search_history ?? 0 });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
export const DELETE = withErrorHandler(handleDelete);
