import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  ImportTextTooLargeError,
  MAX_IMPORT_ITEMS,
  buildImportPreview,
  importSourceValue,
  normalizeImportSourceName,
  normalizeMemoryKey,
  parseImportedMemoryText,
} from '@/lib/memory/import-parser';
import { persistImportedMemories, type ImportMemoryDb } from '@/lib/memory/import-store';

interface ImportRequestBody {
  mode?: string;
  text?: string;
  items?: unknown;
  sourceName?: string;
}

async function loadExistingNormalizedKeys(
  db: ImportMemoryDb,
  userId: string,
): Promise<Set<string>> {
  const rows = await db.query<{ content: string }>(
    `select content from user_memories where user_id = $1 and is_deleted = false`,
    [userId],
  );
  return new Set(rows.map((row) => normalizeMemoryKey(row.content)));
}

async function handleDryRun(request: NextRequest, body: ImportRequestBody) {
  if (typeof body.text !== 'string' || body.text.trim().length === 0) {
    throw createError.validation('Pasted or uploaded memory text is required');
  }
  const sourceName = normalizeImportSourceName(
    typeof body.sourceName === 'string' ? body.sourceName : '',
  );

  let parsed;
  try {
    parsed = parseImportedMemoryText(body.text);
  } catch (error) {
    if (error instanceof ImportTextTooLargeError) {
      throw createError.validation(error.message);
    }
    throw error;
  }

  const { db, userId } = await getUserScopedDb(request);
  const existingKeys = await loadExistingNormalizedKeys(db, userId);
  const items = buildImportPreview(parsed.items, existingKeys);

  return NextResponse.json({
    mode: 'dry-run',
    sourceName,
    sourceValue: importSourceValue(sourceName),
    format: parsed.format,
    items,
    totalCandidates: parsed.totalCandidates,
    itemsTruncated: parsed.itemsTruncated,
  });
}

function readCommitItems(body: ImportRequestBody): string[] {
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw createError.validation('At least one memory must be selected to import');
  }
  if (body.items.length > MAX_IMPORT_ITEMS) {
    throw createError.validation(
      `No more than ${MAX_IMPORT_ITEMS} memories can be imported at once`,
    );
  }
  const items: string[] = [];
  for (const entry of body.items) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw createError.validation('Each imported memory must be non-empty text');
    }
    items.push(entry);
  }
  return items;
}

async function handleCommit(request: NextRequest, body: ImportRequestBody) {
  const items = readCommitItems(body);
  const sourceName = normalizeImportSourceName(
    typeof body.sourceName === 'string' ? body.sourceName : '',
  );
  const sourceValue = importSourceValue(sourceName);

  const { db, userId } = await getUserScopedDb(request);

  let result;
  try {
    result = await persistImportedMemories(db, { userId, items, source: sourceValue });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to import memories');
    throw createError.internal('Failed to import memories');
  }

  return NextResponse.json(
    {
      mode: 'commit',
      sourceName,
      sourceValue,
      insertedCount: result.insertedCount,
      skippedDuplicateCount: result.skippedDuplicateCount,
      memories: result.memories.map((row) => ({
        id: row.id,
        content: row.content,
        category: row.category,
        source: row.source,
        pinned: row.pinned,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    },
    { status: 201 },
  );
}

async function handleImport(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  let body: ImportRequestBody;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (body.mode === 'commit') return handleCommit(request, body);
  if (body.mode === 'dry-run' || body.mode === undefined) return handleDryRun(request, body);
  throw createError.validation('mode must be "dry-run" or "commit"');
}

export const POST = withCorsRoute(withErrorHandler(handleImport));
export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 405 });
}
