import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAccountActive } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ARTIFACT_STORAGE_KEY_PATTERN,
  ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES,
  ARTIFACT_STORAGE_VALUE_LIMIT_BYTES,
  deleteArtifactStorageValue,
  listArtifactStorageKeys,
  readArtifactStorageValue,
  readRunnableArtifact,
  writeArtifactStorageValue,
} from '@/lib/services/artifact-runtime-service';
import { PUBLISHED_TOKEN_REGEX } from '@/lib/services/published-artifact-service';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

const StorageKey = z.string().regex(ARTIFACT_STORAGE_KEY_PATTERN);

const StorageRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('get'), key: StorageKey, shared: z.boolean().default(false) }),
  z.object({
    op: z.literal('set'),
    key: StorageKey,
    value: z.string(),
    shared: z.boolean().default(false),
  }),
  z.object({ op: z.literal('delete'), key: StorageKey, shared: z.boolean().default(false) }),
  z.object({
    op: z.literal('list'),
    prefix: z.string().max(200).nullable().default(null),
    shared: z.boolean().default(false),
  }),
]);

type RouteContext = { params: Promise<{ token: string }> };

function refusal(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });
}

function megabytes(bytes: number): string {
  return `${bytes / (1024 * 1024)} MB`;
}

async function handlePost(request: NextRequest, context: RouteContext): Promise<Response> {
  const { token } = await context.params;
  if (!PUBLISHED_TOKEN_REGEX.test(token)) {
    return refusal(404, 'artifact_not_found', 'This app is no longer available.');
  }

  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf;
  const scoped = await getUserScopedDb(request);
  await assertAccountActive(scoped.userId, request);
  const limited = await withRateLimit(request, 'artifact-storage', `user:${scoped.userId}`);
  if (limited) return limited;

  const parsed = StorageRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return refusal(
      400,
      'invalid_storage_request',
      'Keys are 1 to 200 characters with no spaces, slashes or quotes, and values are text.',
    );
  }

  const artifact = await readRunnableArtifact(scoped.db, token);
  if (!artifact) return refusal(404, 'artifact_not_found', 'This app is no longer available.');

  const body = parsed.data;
  const target = {
    artifact,
    userId: scoped.userId,
    scope: body.shared ? ('shared' as const) : ('personal' as const),
  };

  switch (body.op) {
    case 'get': {
      const value = await readArtifactStorageValue(scoped.db, { ...target, key: body.key });
      return NextResponse.json(
        value === null ? null : { key: body.key, value, shared: body.shared },
        { headers: NO_STORE },
      );
    }
    case 'set': {
      if (Buffer.byteLength(body.value, 'utf8') > ARTIFACT_STORAGE_VALUE_LIMIT_BYTES) {
        return refusal(
          413,
          'storage_value_too_large',
          `A saved value can be up to ${megabytes(ARTIFACT_STORAGE_VALUE_LIMIT_BYTES)}.`,
        );
      }
      const outcome = await writeArtifactStorageValue(scoped.db, {
        ...target,
        key: body.key,
        value: body.value,
      });
      if (outcome === 'over_limit') {
        return refusal(
          413,
          'storage_limit_reached',
          body.shared
            ? `This app's shared data is at its ${megabytes(ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES)} limit.`
            : `Your data in this app is at its ${megabytes(ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES)} limit.`,
        );
      }
      return NextResponse.json(
        { key: body.key, value: body.value, shared: body.shared },
        { headers: NO_STORE },
      );
    }
    case 'delete': {
      const deleted = await deleteArtifactStorageValue(scoped.db, { ...target, key: body.key });
      return NextResponse.json(
        { key: body.key, deleted, shared: body.shared },
        { headers: NO_STORE },
      );
    }
    case 'list': {
      const keys = await listArtifactStorageKeys(scoped.db, { ...target, prefix: body.prefix });
      return NextResponse.json(
        { keys, prefix: body.prefix, shared: body.shared },
        { headers: NO_STORE },
      );
    }
  }
}

export const POST = withErrorHandler(handlePost);
