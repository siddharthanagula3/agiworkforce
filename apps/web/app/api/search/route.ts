import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { markdownRenderedText } from '@agiworkforce/unified-chat/markdown-document';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { withoutStoredCitationMarkupRow } from '@/lib/server/stored-assistant-text';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { readJsonBody } from '@/lib/read-json-body';
import {
  DEFAULT_SEARCH_RETRIEVAL_STRATEGY,
  SearchResidencyError,
  SEARCH_SOURCE_KINDS,
  assertSearchResidency,
  isSearchSourceKind,
  parseSearchRetrievalStrategy,
  type SearchResidencyState,
  type SearchSourceKind,
} from '@agiworkforce/data-layer/search';
import {
  createPostgresSearchProvider,
  resolveRetrievalResidency,
} from '@/lib/services/retrieval-search-service';
import { toSearchDocumentResults } from '@/lib/services/retrieval-search-results';
import { buildWorkspaceAccessGateResponse } from '@/lib/managed-compute-gate';
import { scheduleFocusHref } from '@/features/schedules/lib/schedule-links';
import {
  GLOBAL_SEARCH_CATEGORIES,
  type GlobalSearchCategory,
} from '@features/chat/lib/global-search-categories';
import {
  buildNewChatHref,
  quoteForNewChatDraft,
  type NewChatSourceKind,
} from '@features/chat/lib/new-chat-entry';

const DEFAULT_RESULT_LIMIT = 50;
const MAX_RESULT_LIMIT = 100;
const DEFAULT_POPULAR_DAYS = 7;
const MAX_POPULAR_DAYS = 365;
const SearchRoleSchema = z.enum(['user', 'assistant', 'system']);
const CATEGORY_INDEX_KINDS = {
  artifacts: ['artifact'],
  sessions: ['conversation'],
  code: ['developer_session'],
  projects: ['project_knowledge'],
  scheduled: [],
} as const satisfies Record<Exclude<GlobalSearchCategory, 'all'>, readonly SearchSourceKind[]>;

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
type ScheduleSearchRow = {
  id: string;
  name: string;
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
const SNIPPET_WINDOW_CHARS = 2000;

type ScopedDb = Awaited<ReturnType<typeof getUserScopedDb>>['db'];

function boundedInteger(
  raw: string | null,
  fallback: number,
  maximum: number,
  name: string,
): number {
  const parsed = z.coerce
    .number()
    .int()
    .min(1)
    .max(maximum)
    .safeParse(raw ?? fallback);
  if (!parsed.success) throw createError.validation(`Invalid ${name} query param`);
  return parsed.data;
}

function optionalDate(raw: string | null, name: string): string | null {
  if (raw === null) return null;
  if (raw.trim().length === 0 || Number.isNaN(Date.parse(raw))) {
    throw createError.validation(`Invalid ${name} query param`);
  }
  return raw;
}

/** The refusal reaches the reader, so it names the region and nothing else. */
async function assertProductSearchRegion(
  db: ScopedDb,
  organizationId: string | null,
): Promise<SearchResidencyState> {
  const residency = await resolveRetrievalResidency({ db, organizationId });
  try {
    assertSearchResidency('product', residency);
  } catch (error) {
    if (!(error instanceof SearchResidencyError)) throw error;
    throw createError.capabilityUnavailable(
      error.origin
        ? `Search for this workspace is served only from its data region (${error.origin}), which this deployment does not answer from.`
        : 'Search is unavailable because this workspace’s data region could not be confirmed.',
    );
  }
  return residency;
}

function newChatHrefFor(
  kind: NewChatSourceKind,
  id: string,
  match: { matched: string; before: string; after: string },
): string {
  return buildNewChatHref({
    source: { kind, id },
    draft: quoteForNewChatDraft(`${match.before}${match.matched}${match.after}`),
  });
}

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

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function plainSnippetText(markdown: string): string {
  return collapseWhitespace(markdownRenderedText(markdown));
}

function snippetWindow(content: string, query: string): string {
  const at = Math.max(content.toLowerCase().indexOf(query.toLowerCase()), 0);
  const matchEnd = at + query.length;
  let start = Math.max(0, at - SNIPPET_WINDOW_CHARS);
  if (start > 0) {
    const lineStart = content.indexOf('\n', start);
    if (lineStart !== -1 && lineStart < at) start = lineStart + 1;
    else if (/[\uDC00-\uDFFF]/.test(content.charAt(start))) start += 1;
  }
  let end = Math.min(content.length, matchEnd + SNIPPET_WINDOW_CHARS);
  if (end < content.length) {
    const lineEnd = content.lastIndexOf('\n', end);
    if (lineEnd > matchEnd) end = lineEnd;
    else if (/[\uD800-\uDBFF]/.test(content.charAt(end - 1))) end -= 1;
  }
  return content.slice(start, end);
}

function messageMatch(
  content: string,
  query: string,
): { matched: string; before: string; after: string } {
  const window = snippetWindow(content, query);
  const plain = plainSnippetText(window);
  const lowerQuery = query.toLowerCase();
  if (!plain.toLowerCase().includes(lowerQuery) && window.toLowerCase().includes(lowerQuery)) {
    return extractMatch(collapseWhitespace(window), query);
  }
  return extractMatch(plain, query);
}

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId, surface } = await getUserScopedDb(request);
  const residency = await assertProductSearchRegion(db, organizationId);

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const q = url.searchParams.get('q') ?? '';
  const limit = boundedInteger(
    url.searchParams.get('limit'),
    DEFAULT_RESULT_LIMIT,
    MAX_RESULT_LIMIT,
    'limit',
  );

  if (type === 'recent') {
    const rows = await db.query<RecentSearchRow>('select * from get_recent_searches($1, $2, $3)', [
      userId,
      organizationId,
      limit,
    ]);
    return NextResponse.json({ searches: rows });
  }

  if (type === 'popular') {
    const days = boundedInteger(
      url.searchParams.get('days'),
      DEFAULT_POPULAR_DAYS,
      MAX_POPULAR_DAYS,
      'days',
    );
    const rows = await db.query<PopularSearchRow>(
      'select * from get_popular_searches($1, $2, $3, $4)',
      [userId, organizationId, limit, days],
    );
    return NextResponse.json({ searches: rows });
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

  const requestedCategory = url.searchParams.get('category') ?? 'all';
  const category = GLOBAL_SEARCH_CATEGORIES.find((option) => option.id === requestedCategory)?.id;
  if (!category) throw createError.validation('Invalid search category');
  const searchSessions = category === 'all' || category === 'sessions';
  const searchProjects = category === 'all' || category === 'projects';
  const searchSchedules = category === 'all' || category === 'scheduled';
  const scheduleAccess =
    category === 'scheduled'
      ? await buildWorkspaceAccessGateResponse(userId, request, surface ?? 'unknown')
      : null;
  if (scheduleAccess) return scheduleAccess;
  const includeArchived = url.searchParams.get('includeArchived') === 'true';
  const rawRole = url.searchParams.get('role');
  const parsedRole = rawRole === null ? null : SearchRoleSchema.safeParse(rawRole);
  if (parsedRole && !parsedRole.success) throw createError.validation('Invalid role query param');
  const role = parsedRole?.data ?? null;
  const startDate = optionalDate(url.searchParams.get('startDate'), 'startDate');
  const endDate = optionalDate(url.searchParams.get('endDate'), 'endDate');
  if (startDate && endDate && Date.parse(startDate) > Date.parse(endDate)) {
    throw createError.validation('startDate must not be after endDate');
  }

  const sessionParams: unknown[] = [userId, `%${q}%`, organizationId];
  const sessionClauses: string[] = [
    'user_id = $1',
    'title ilike $2',
    'organization_id is not distinct from $3::uuid',
    'deleted_at is null',
    'coalesce(is_temporary, false) = false',
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
    'not temporary_chat',
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
    'coalesce(c.is_temporary, false) = false',
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

  const requestedKinds =
    category === 'all'
      ? url.searchParams.getAll('kind').filter(isSearchSourceKind)
      : CATEGORY_INDEX_KINDS[category];
  const strategy =
    parseSearchRetrievalStrategy(url.searchParams.get('mode')) ?? DEFAULT_SEARCH_RETRIEVAL_STRATEGY;
  const rowFiltersApply = Boolean(role || startDate || endDate);
  const indexSearch =
    rowFiltersApply || category === 'scheduled'
      ? Promise.resolve({ hits: [], semantic: 'unavailable' as const })
      : createPostgresSearchProvider({
          db,
          userId,
          organizationId,
          semantic: true,
          residency,
          includeHealthSpaces: true,
          googleUserData: 'include',
        }).search({
          text: q,
          kinds: requestedKinds.length > 0 ? requestedKinds : SEARCH_SOURCE_KINDS,
          limit,
          maxPerSource: 3,
          match: 'all_terms',
          mode: 'private_knowledge',
          strategy,
        });

  const [sessionRows, projectRows, fileRows, messageRows, indexed, scheduleRows] =
    await Promise.all([
      searchSessions
        ? db.query<SessionRow>(
            `select id, title, created_at, updated_at
       from web_conversations
       where ${sessionClauses.join(' and ')}
       order by updated_at desc
       limit $${sessionParams.length + 1}`,
            [...sessionParams, limit],
          )
        : [],
      searchProjects
        ? db.query<ProjectRow>(
            `select id, name, description, created_at, updated_at
       from user_projects
       where ${projectClauses.join(' and ')}
       order by updated_at desc
       limit $${projectParams.length + 1}`,
            [...projectParams, limit],
          )
        : [],
      category === 'all'
        ? db.query<FileRow>(
            `select id, kind, prompt, metadata, created_at
       from media_assets
       where ${fileClauses.join(' and ')}
       order by created_at desc
       limit $${fileParams.length + 1}`,
            [...fileParams, limit],
          )
        : [],
      searchSessions
        ? db.query<MessageRow>(
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
          )
        : [],
      indexSearch,
      searchSchedules
        ? db.query<ScheduleSearchRow>(
            `select id, name, created_at, updated_at
           from scheduled_tasks
           where user_id = $1 and organization_id is not distinct from $2::uuid
             and name ilike $3
             and ($4::timestamptz is null or created_at >= $4::timestamptz)
             and ($5::timestamptz is null or created_at <= $5::timestamptz)
           order by updated_at desc, id
           limit $6`,
            [userId, organizationId, `%${q}%`, startDate, endDate, limit],
          )
        : [],
    ]);
  const scheduleListingDenied =
    category === 'all' &&
    scheduleRows.length > 0 &&
    (await buildWorkspaceAccessGateResponse(userId, request, surface ?? 'unknown'));
  const schedules = (scheduleListingDenied ? [] : scheduleRows).map((schedule) => {
    const match = extractMatch(schedule.name, q);
    return {
      id: schedule.id,
      name: schedule.name,
      href: scheduleFocusHref(schedule.id),
      createdAt: schedule.created_at,
      updatedAt: schedule.updated_at,
      matchedText: match.matched,
      contextBefore: match.before,
      contextAfter: match.after,
    };
  });
  const documents = toSearchDocumentResults(indexed.hits).map((doc) => ({
    ...doc,
    newChatHref: buildNewChatHref({
      source: { kind: 'document', id: doc.sourceId },
      draft: quoteForNewChatDraft(doc.snippet),
    }),
  }));

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
      newChatHref: newChatHrefFor('conversation', s.id, match),
    };
  });

  const messageResult = (stored: MessageRow) => {
    const m = withoutStoredCitationMarkupRow(stored);
    const match = messageMatch(m.content, q);
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
      newChatHref: newChatHrefFor('message', m.id, match),
    };
  };

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
      newChatHref: newChatHrefFor('project', p.id, match),
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
      newChatHref: newChatHrefFor('file', f.id, match),
    };
  });

  const allResults = [
    ...sessionResults.map((result) => ({ updatedAt: result.updatedAt, build: () => result })),
    ...messageRows.map((row) => ({ updatedAt: row.updated_at, build: () => messageResult(row) })),
  ]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit)
    .map((hit) => hit.build());

  const matchedConversationIds = new Set<string>([
    ...sessionResults.map((s) => s.sessionId),
    ...messageRows.map((m) => m.conversation_id),
  ]);

  const stats = {
    totalResults: sessionResults.length + messageRows.length,
    sessionMatches: matchedConversationIds.size,
    messageMatches: messageRows.length,
    projectMatches: projectResults.length,
    fileMatches: fileResults.length,
    documentMatches: documents.length,
  };

  const crossSiteNavigation = request.headers.get('sec-fetch-site') === 'cross-site';
  if (q.trim() && !crossSiteNavigation && url.searchParams.get('track') !== 'false') {
    db.query('select track_search($1, $2, $3, $4)', [
      userId,
      organizationId,
      q,
      stats.totalResults +
        stats.projectMatches +
        stats.fileMatches +
        stats.documentMatches +
        schedules.length,
    ]).catch((error: unknown) => {
      logger.warn({ error, userId }, 'search history write failed');
    });
  }

  return NextResponse.json({
    results: allResults,
    projects: projectResults,
    files: fileResults,
    schedules,
    documents,
    semantic: indexed.semantic,
    strategy,
    modes: { rows: 'product', documents: 'private_knowledge' },
    stats,
  });
}

async function handlePost(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  await assertProductSearchRegion(db, organizationId);

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

  await assertProductSearchRegion(db, organizationId);

  const [result] = await db.query<{ clear_search_history: number }>(
    'select clear_search_history($1, $2)',
    [userId, organizationId],
  );

  return NextResponse.json({ cleared: result?.clear_search_history ?? 0 });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
export const DELETE = withErrorHandler(handleDelete);
