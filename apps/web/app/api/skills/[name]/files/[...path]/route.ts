import { basename } from 'node:path';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { AppError, ErrorCode, createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  findSelectableSkillWithFiles,
  readManagedSkillFileBytes,
} from '@/lib/services/skill-catalog-service';
import { listEnabledPluginIds } from '@/lib/services/plugin-installation-service';
import { workspaceAllowsPlugins } from '@/lib/services/workspace-plugin-access';
import { hashSkillContent } from '@agiworkforce/skills';

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

function downloadResponse(path: string, bytes: Uint8Array, contentHash: string): NextResponse {
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': DOWNLOAD_CONTENT_TYPE,
      'Content-Disposition': contentDisposition(path),
      'Cache-Control': 'private, no-store',
      ETag: `"${contentHash}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
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

  const pluginsAllowed = await workspaceAllowsPlugins(db, userId);

  const found = await findSelectableSkillWithFiles({
    db,
    userId,
    name,
    loadEnabledPluginIds: () =>
      pluginsAllowed ? listEnabledPluginIds(db, userId) : Promise.resolve(new Set<string>()),
    pluginsAllowed,
  });
  if (!found) {
    throw createError.notFound(`Skill "${name}" not found`);
  }

  const requestedPath = segments.join('/');
  const wantsDownload =
    new URL(request.url).searchParams.get(DOWNLOAD_PARAM) === DOWNLOAD_PARAM_VALUE;

  if (wantsDownload && found.managed) {
    const downloaded = await readManagedSkillFileBytes(found.skill, requestedPath);
    if (!downloaded.ok) {
      if (downloaded.reason === 'too_large') {
        throw createError.payloadTooLarge('This file is too large to download.');
      }
      throw createError.notFound('File not found');
    }
    return downloadResponse(
      downloaded.file.path,
      downloaded.file.bytes,
      downloaded.file.contentHash,
    );
  }

  const result = await found.access.readFile(found.skill, requestedPath);
  if (!result.ok) {
    if (result.reason === 'binary') {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'This file is not text and cannot be previewed.',
        UNSUPPORTED_MEDIA_TYPE_STATUS,
      );
    }
    if (result.reason === 'too_large') {
      throw createError.payloadTooLarge(
        wantsDownload
          ? 'This file is too large to download.'
          : 'This file is too large to preview.',
      );
    }
    throw createError.notFound('File not found');
  }

  if (wantsDownload) {
    const bytes = Buffer.from(result.content, 'utf8');
    return downloadResponse(result.path, bytes, hashSkillContent(bytes));
  }
  return NextResponse.json({
    file: {
      path: result.path,
      size: Buffer.byteLength(result.content, 'utf8'),
      content: result.content,
    },
  });
}

export const GET = withCorsRoute(withErrorHandler(handleReadFile));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
