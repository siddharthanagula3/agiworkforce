import { basename } from 'node:path';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { AppError, ErrorCode, createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  getManagedSkillDirectoryForPlugins,
  readManagedSkillFile,
  readManagedSkillFileBytes,
} from '@/lib/services/skill-catalog-service';
import { listEnabledPluginIds } from '@/lib/services/plugin-installation-service';

export const runtime = 'nodejs';

const SKILL_NAME_MAX_LENGTH = 200;
const UNSUPPORTED_MEDIA_TYPE_STATUS = 415;
const DOWNLOAD_PARAM = 'download';
const DOWNLOAD_PARAM_VALUE = '1';
const DOWNLOAD_CONTENT_TYPE = 'application/octet-stream';
const FALLBACK_DOWNLOAD_FILENAME = 'skill-file';
const NON_ASCII_FILENAME_CHARACTERS = /[^\w.-]+/g;

function requireSkillName(name: string | undefined): string {
  if (!name || name.length > SKILL_NAME_MAX_LENGTH) {
    throw createError.validation(`skill name is required (1–${SKILL_NAME_MAX_LENGTH} chars)`);
  }
  return name;
}

function contentDisposition(path: string): string {
  const name = basename(path);
  const ascii = name.replace(NON_ASCII_FILENAME_CHARACTERS, '_') || FALLBACK_DOWNLOAD_FILENAME;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function handleReadFile(
  request: NextRequest,
  context: { params: Promise<{ name: string; path: string[] }> },
) {
  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;
  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });
  const { name: rawName, path: segments } = await context.params;
  const name = requireSkillName(rawName);
  if (!Array.isArray(segments) || segments.length === 0) {
    throw createError.validation('A file path is required');
  }

  const enabledPluginIds = await listEnabledPluginIds(db, userId);
  const directory = await getManagedSkillDirectoryForPlugins(enabledPluginIds);
  const skill = directory.find((candidate) => candidate.name === name);
  if (!skill) {
    throw createError.notFound(`Skill "${name}" not found`);
  }

  const requestedPath = segments.join('/');
  const wantsDownload =
    new URL(request.url).searchParams.get(DOWNLOAD_PARAM) === DOWNLOAD_PARAM_VALUE;

  if (wantsDownload) {
    const downloaded = await readManagedSkillFileBytes(skill, requestedPath);
    if (!downloaded.ok) {
      if (downloaded.reason === 'too_large') {
        throw createError.payloadTooLarge('This file is too large to download.');
      }
      throw createError.notFound('File not found');
    }
    return new NextResponse(new Uint8Array(downloaded.file.bytes), {
      status: 200,
      headers: {
        'Content-Type': DOWNLOAD_CONTENT_TYPE,
        'Content-Disposition': contentDisposition(downloaded.file.path),
        'Cache-Control': 'private, no-store',
        ETag: `"${downloaded.file.contentHash}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const result = await readManagedSkillFile(skill, requestedPath);
  if (!result.ok) {
    if (result.reason === 'binary') {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'This file is not text and cannot be previewed.',
        UNSUPPORTED_MEDIA_TYPE_STATUS,
      );
    }
    if (result.reason === 'too_large') {
      throw createError.payloadTooLarge('This file is too large to preview.');
    }
    throw createError.notFound('File not found');
  }

  return NextResponse.json({ file: result.file });
}

export const GET = withCorsRoute(withErrorHandler(handleReadFile));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
