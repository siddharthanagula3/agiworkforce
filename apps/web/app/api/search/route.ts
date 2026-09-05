import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { readJsonBody } from '@/lib/read-json-body';

const PG_UNDEFINED_FUNCTION = '42883';

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

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
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

type FileRow = {
  id: string;
  kind: string;
  prompt: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
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

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const q = url.searchParams.get('q') ?? '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);

  if (type === 'recent') {
    const rows = await db.query<RecentSearchRow>('select * from get_recent_searches($1, $2, $3)', [
      userId,
      organizationId,
      limit,
    ]);
    return NextResponse.json({ searches: rows });
  }

  if (type === 'popular') {
    const days = parseInt(url.searchParams.get('days') ?? '7', 10);
    try {
      const rows = await db.query<PopularSearchRow>(
        'select * from get_popular_searches($1, $2, $3, $4)',
        [userId, organizationId, limit, days],
      );
      return NextResponse.json({ searches: rows });
    } catch (error) {
      if ((error as { code?: string } | null)?.code === PG_UNDEFINED_FUNCTION) {
        logger.warn(
          '[search] workspace-scoped get_popular_searches unavailable (migration 0110 not applied?); returning empty list',
        );
        return NextResponse.json({ searches: [] });
      }
      throw error;
    }
  }

  if (type === 'suggestions') {
    if (q.trim().length < 2) return NextResponse.json({ suggestions: [] });
    const rows = await db.query<SuggestionRow>(
      'select * from get_search_suggestions($1, $2, $3, $4)',
      [userId, organizationId, q, limit],
    );
    return NextResponse.json({ suggestions: rows });
  }

  if (!q.trim()) throw createError.validation('q query param required for search');

  const includeArchived = url.searchParams.get('includeArchived') === 'true';
  const role = url.searchParams.get('role') as 'user' | 'assistant' | 'system' | null;
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  const sessionParams: unknown[] = [userId, `%${q}%`, organizationId];
  const sessionClauses: string[] = [
    'user_id = $1',
    'title ilike $2',
    'organization_id is not distinct from $3::uuid',
    'deleted_at is null',
  ];
  if (!includeArchived) sessionClauses.push('archived = false');
  if (startDate) {
    sessionClauses.push(`created_at >= $${sessionParams.length + 1}`);
    sessionParams.push(startDate);
  }
  if (endDate) {
    sessionClauses.push(`created_at <= $${sessionParams.length + 1}`);
    sessionParams.push(endDate);
  }

  const projectParams: unknown[] = [userId, `%${q}%`, organizationId];
  const projectClauses: string[] = [
    'user_id = $1',
    '(name ilike $2 or description ilike $2)',
    'organization_id is not distinct from $3::uuid',
    'deleted_at is null',
  ];
  if (!includeArchived) projectClauses.push('is_archived = false');
  if (startDate) {
    projectClauses.push(`created_at >= $${projectParams.length + 1}`);
    projectParams.push(startDate);
  }
  if (endDate) {
    projectClauses.push(`created_at <= $${projectParams.length + 1}`);
    projectParams.push(endDate);
  }

  const fileParams: unknown[] = [userId, `%${q}%`, organizationId];
  const fileClauses: string[] = [
    'user_id = $1',
    "(coalesce(metadata->>'filename','') ilike $2 or coalesce(prompt,'') ilike $2)",
    'organization_id is not distinct from $3::uuid',
    'deleted_at is null',
  ];
  if (startDate) {
    fileClauses.push(`created_at >= $${fileParams.length + 1}`);
    fileParams.push(startDate);
  }
  if (endDate) {
    fileClauses.push(`created_at <= $${fileParams.length + 1}`);
    fileParams.push(endDate);
  }
  const msgParams: unknown[] = [userId, `%${q}%`, organizationId];
  const msgClauses: string[] = [
    'c.user_id = $1',
    'm.content ilike $2',
    'c.organization_id is not distinct from $3::uuid',
    'c.deleted_at is null',
    'm.deleted_at is null',
  ];
  if (!includeArchived) msgClauses.push('c.archived = false');
  if (role) {
    msgClauses.push(`m.role = $${msgParams.length + 1}`);
    msgParams.push(role);
  }
  if (startDate) {
    msgClauses.push(`m.created_at >= $${msgParams.length + 1}`);
    msgParams.push(startDate);
  }
  if (endDate) {
    msgClauses.push(`m.created_at <= $${msgParams.length + 1}`);
    msgParams.push(endDate);
  }

  const [sessionRows, projectRows, fileRows, messageRows] = await Promise.all([
    db.query<SessionRow>(
      `select id, title, created_at, updated_at
       from web_conversations
       where ${sessionClauses.join(' and ')}
       order by updated_at desc
       limit $${sessionParams.length + 1}`,
      [...sessionParams, limit],
    ),
    db.query<ProjectRow>(
      `select id, name, description, created_at, updated_at
       from user_projects
       where ${projectClauses.join(' and ')}
       order by updated_at desc
       limit $${projectParams.length + 1}`,
      [...projectParams, limit],
    ),
    db.query<FileRow>(
      `select id, kind, prompt, metadata, created_at
       from media_assets
       where ${fileClauses.join(' and ')}
       order by created_at desc
       limit $${fileParams.length + 1}`,
      [...fileParams, limit],
    ),
    db.query<MessageRow>(
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
    ),
  ]);

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

  const projectResults = projectRows.map((p) => {
    const matchText = p.name + (p.description ? ` ${p.description}` : '');
    const match = extractMatch(matchText, q);
    return {
      type: 'project' as const,
      projectId: p.id,
      projectName: p.name,
      content: p.description ?? '',
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      matchedText: match.matched,
      contextBefore: match.before,
      contextAfter: match.after,
    };
  });

  const fileResults = fileRows.map((f) => {
    const rawName =
      f.metadata && typeof f.metadata['filename'] === 'string' ? f.metadata['filename'] : '';
    const fileName = rawName.trim() ? rawName : f.kind;
    const matchText = fileName + (f.prompt ? ` ${f.prompt}` : '');
    const match = extractMatch(matchText, q);
    return {
      type: 'file' as const,
      fileId: f.id,
      fileName,
      content: f.prompt ?? '',
      createdAt: f.created_at,
      updatedAt: f.created_at,
      matchedText: match.matched,
      contextBefore: match.before,
      contextAfter: match.after,
    };
  });

  const allResults = [...sessionResults, ...messageResults]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);

  const matchedConversationIds = new Set<string>([
    ...sessionResults.map((s) => s.sessionId),
    ...messageResults.map((m) => m.sessionId),
  ]);

  const stats = {
    totalResults: sessionResults.length + messageResults.length,
    sessionMatches: matchedConversationIds.size,
    messageMatches: messageResults.length,
    projectMatches: projectResults.length,
    fileMatches: fileResults.length,
  };

  const crossSiteNavigation = request.headers.get('sec-fetch-site') === 'cross-site';
  if (q.trim() && !crossSiteNavigation) {
    db.query('select track_search($1, $2, $3, $4)', [
      userId,
      organizationId,
      q,
      stats.totalResults,
    ]).catch(() => {
      // Non-critical - swallow errors silently
    });
  }

  return NextResponse.json({
    results: allResults,
    projects: projectResults,
    files: fileResults,
    stats,
  });
}

async function handlePost(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const body = await readJsonBody(request);
  const parsed = TrackSearchSchema.safeParse(body);
  if (!parsed.success) throw createError.validation('Invalid request body');

  const { query, resultCount } = parsed.data;

  await db.query('select track_search($1, $2, $3, $4)', [
    userId,
    organizationId,
    query,
    resultCount,
  ]);

  return NextResponse.json({ tracked: true });
}

async function handleDelete(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const [result] = await db.query<{ clear_search_history: number }>(
    'select clear_search_history($1, $2)',
    [userId, organizationId],
  );

  return NextResponse.json({ cleared: result?.clear_search_history ?? 0 });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
export const DELETE = withErrorHandler(handleDelete);
