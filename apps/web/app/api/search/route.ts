import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { readJsonBody } from '@/lib/read-json-body';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

// Postgres SQLSTATE for undefined_function — raised when a called function
// signature does not exist (e.g. a migration adding/altering it hasn't run).
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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const organizationId = await resolveActiveOrganizationId(db, userId);

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const q = url.searchParams.get('q') ?? '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);

  // Recent searches
  if (type === 'recent') {
    const rows = await db.query<RecentSearchRow>('select * from get_recent_searches($1, $2, $3)', [
      userId,
      organizationId,
      limit,
    ]);
    return NextResponse.json({ searches: rows });
  }

  // Popular searches — scoped to the authenticated user only (see 0045
  // migration; previously this leaked every user's raw search query text to
  // every other user).
  if (type === 'popular') {
    const days = parseInt(url.searchParams.get('days') ?? '7', 10);
    try {
      const rows = await db.query<PopularSearchRow>(
        'select * from get_popular_searches($1, $2, $3, $4)',
        [userId, organizationId, limit, days],
      );
      return NextResponse.json({ searches: rows });
    } catch (error) {
      // The workspace-scoped overload lands with migration 0110. On an
      // environment where it has not been applied, Postgres raises
      // undefined_function (42883). Popular searches is a
      // best-effort pre-fill for the search modal — degrade to an empty list
      // instead of 500-ing the whole modal open. Mirrors the
      // PG_UNDEFINED_COLUMN migration-lag fallback in /api/projects/[id] (PUT).
      // Any other DB error still propagates so real bugs are not masked.
      if ((error as { code?: string } | null)?.code === PG_UNDEFINED_FUNCTION) {
        logger.warn(
          '[search] workspace-scoped get_popular_searches unavailable (migration 0110 not applied?); returning empty list',
        );
        return NextResponse.json({ searches: [] });
      }
      throw error;
    }
  }

  // Search suggestions
  if (type === 'suggestions') {
    if (q.trim().length < 2) return NextResponse.json({ suggestions: [] });
    const rows = await db.query<SuggestionRow>(
      'select * from get_search_suggestions($1, $2, $3, $4)',
      [userId, organizationId, q, limit],
    );
    return NextResponse.json({ suggestions: rows });
  }

  // Full search (default)
  if (!q.trim()) throw createError.validation('q query param required for search');

  // This route uses the privileged adapter because the search RPCs predate the
  // RLS surface. The durable workspace resolved above is bound to every query;
  // a client-supplied org is never an authorization input here.

  const includeArchived = url.searchParams.get('includeArchived') === 'true';
  const role = url.searchParams.get('role') as 'user' | 'assistant' | 'system' | null;
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  // Search sessions by title
  const sessionParams: unknown[] = [userId, `%${q}%`, organizationId];
  const sessionClauses: string[] = [
    'user_id = $1',
    'title ilike $2',
    'organization_id is not distinct from $3::uuid',
  ];
  if (!includeArchived) sessionClauses.push('deleted_at is null');
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

  // Search projects by name/description, scoped to the authenticated user.
  // Soft-deleted projects (deleted_at, see 0041_projects_cloud_sync.sql) are
  // excluded unless includeArchived is set, mirroring the conversation
  // filter above. Kept in a separate `projects` response array (not merged
  // into `results`) because the existing search UI (GlobalSearchDialog,
  // global-search-service.ts) only knows how to render/navigate
  // 'session' | 'message' result types — it routes every click to
  // `/chat/${sessionId}`, which would 404 for a project id. Wiring a
  // dedicated project result card that navigates to `/chat/projects/${id}` is a
  // follow-up; this keeps the addition purely additive and non-breaking.
  const projectParams: unknown[] = [userId, `%${q}%`, organizationId];
  const projectClauses: string[] = [
    'user_id = $1',
    '(name ilike $2 or description ilike $2)',
    'organization_id is not distinct from $3::uuid',
  ];
  if (!includeArchived) projectClauses.push('deleted_at is null');
  if (startDate) {
    projectClauses.push(`created_at >= $${projectParams.length + 1}`);
    projectParams.push(startDate);
  }
  if (endDate) {
    projectClauses.push(`created_at <= $${projectParams.length + 1}`);
    projectParams.push(endDate);
  }

  const projectRows = await db.query<ProjectRow>(
    `select id, name, description, created_at, updated_at
     from user_projects
     where ${projectClauses.join(' and ')}
     order by updated_at desc
     limit $${projectParams.length + 1}`,
    [...projectParams, limit],
  );

  // Search the user's cataloged files (media_assets — the Library) by display
  // filename or generation prompt. Owner-scoped, soft-delete-aware. Kept in a
  // separate `files` array because file results navigate to /library, not /chat.
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
  const fileRows = await db.query<FileRow>(
    `select id, kind, prompt, metadata, created_at
     from media_assets
     where ${fileClauses.join(' and ')}
     order by created_at desc
     limit $${fileParams.length + 1}`,
    [...fileParams, limit],
  );

  // Message search. Ownership comes from the conversation join (web_messages
  // has no user_id), so the owner filter belongs on the joined table. This used
  // to select the caller's conversation ids in a separate unbounded query and
  // bind them all back as a uuid[] — ~180 KB of parameters at 5,000
  // conversations, for a restriction the join already applies.
  const msgParams: unknown[] = [userId, `%${q}%`, organizationId];
  // Every clause is table-qualified: web_messages and web_conversations both
  // have created_at, so an unqualified date filter is an ambiguous reference
  // and Postgres rejects the whole query.
  const msgClauses: string[] = [
    'c.user_id = $1',
    'm.content ilike $2',
    'c.organization_id is not distinct from $3::uuid',
  ];
  // Both tombstones are honoured, on the same includeArchived switch as the
  // session and project queries above: /api/chat/sync soft-deletes a message by
  // setting m.deleted_at while preserving its content, so filtering only on the
  // conversation would keep serving deleted message bodies through search.
  if (!includeArchived) {
    msgClauses.push('c.deleted_at is null');
    msgClauses.push('m.deleted_at is null');
  }
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

  const messageRows = await db.query<MessageRow>(
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

  // NOTE: projectMatches/projectResults are intentionally excluded from
  // stats.totalResults and `results` — see the comment above the project
  // query. Bumping totalResults here without rendering the extra rows in
  // `results` would make the UI's "Found N results" count not match the
  // number of rows actually shown, which is its own visible bug.
  const stats = {
    totalResults: sessionResults.length + messageResults.length,
    sessionMatches: sessionResults.length,
    messageMatches: messageResults.length,
    projectMatches: projectResults.length,
    fileMatches: fileResults.length,
  };

  // Fire-and-forget search tracking
  if (q.trim()) {
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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const organizationId = await resolveActiveOrganizationId(db, userId);

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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const organizationId = await resolveActiveOrganizationId(db, userId);

  const [result] = await db.query<{ clear_search_history: number }>(
    'select clear_search_history($1, $2)',
    [userId, organizationId],
  );

  return NextResponse.json({ cleared: result?.clear_search_history ?? 0 });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
export const DELETE = withErrorHandler(handleDelete);
