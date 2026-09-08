import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { isMissingPluginMarketplaceSchema } from '@/lib/services/plugin-marketplace-service';
import { storeOwnedPluginSource } from '@/lib/services/plugin-owned-source-service';
import {
  PluginArchiveError,
  readPluginArchive,
  type UploadedPlugin,
} from '@/features/plugins/server/directory/archive';
import { installsDisabledResponse } from '@/features/plugins/server/directory/install-responses';
import {
  PLUGIN_UPLOAD_FILE_FIELD,
  PLUGIN_UPLOAD_NAME_FIELD,
  UPLOAD_NOT_AN_ARCHIVE_MESSAGE,
} from '@/features/plugins/server/directory/constants';
import { PayloadCeilingExceededError } from '@/lib/payload-ceiling';
import type { PluginSourceInstallResponse } from '@agiworkforce/cloud-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE_KIND_UPLOAD = 'upload';
const ARCHIVE_EXTENSION = /\.zip$/i;
const INVALID_UPLOAD_CODE = 'PLUGIN_UPLOAD_INVALID';
const REJECTED_UPLOAD_CODE = 'PLUGIN_UPLOAD_REJECTED';

function fallbackName(fileName: string | null, provided: string | null): string {
  const chosen = provided?.trim();
  if (chosen && chosen.length > 0) return chosen;
  const base = (fileName ?? '').replace(ARCHIVE_EXTENSION, '').trim();
  return base.length > 0 ? base : SOURCE_KIND_UPLOAD;
}

function invalidUpload(message: string, issues?: readonly string[]): NextResponse {
  return NextResponse.json(
    { error: { code: INVALID_UPLOAD_CODE, message, ...(issues ? { issues } : {}) } },
    { status: 400 },
  );
}

async function readArchiveField(
  request: NextRequest,
): Promise<{ bytes: Uint8Array; fileName: string | null; name: string | null } | NextResponse> {
  let form: FormData;
  try {
    form = (await request.formData()) as unknown as FormData;
  } catch (error) {
    if (error instanceof PayloadCeilingExceededError) throw error;
    return invalidUpload(UPLOAD_NOT_AN_ARCHIVE_MESSAGE);
  }
  const file = form.get(PLUGIN_UPLOAD_FILE_FIELD);
  if (!file || typeof file === 'string') return invalidUpload(UPLOAD_NOT_AN_ARCHIVE_MESSAGE);
  const buffer = await file.arrayBuffer();
  const fileName = 'name' in file && typeof file.name === 'string' ? file.name : '';
  const provided = form.get(PLUGIN_UPLOAD_NAME_FIELD);
  return {
    bytes: new Uint8Array(buffer),
    fileName: fileName.length > 0 ? fileName : null,
    name: typeof provided === 'string' ? provided : null,
  };
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;

  const { db, userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;

  const read = await readArchiveField(request);
  if (read instanceof NextResponse) return read;

  let archive: { sourceName: string; plugins: UploadedPlugin[] };
  try {
    archive = await readPluginArchive(read.bytes, fallbackName(read.fileName, read.name));
  } catch (error) {
    if (error instanceof PluginArchiveError) {
      return NextResponse.json(
        {
          error: { code: REJECTED_UPLOAD_CODE, message: error.message, issues: error.issues },
        },
        { status: 422 },
      );
    }
    throw error;
  }

  try {
    const plugins = await storeOwnedPluginSource(db, userId, {
      kind: SOURCE_KIND_UPLOAD,
      sourceName: read.name?.trim() || archive.sourceName,
      plugins: archive.plugins,
    });
    const body: PluginSourceInstallResponse = {
      sourceName: read.name?.trim() || archive.sourceName,
      kind: SOURCE_KIND_UPLOAD,
      plugins,
    };
    return NextResponse.json(body, { status: 201 });
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) return installsDisabledResponse();
    throw error;
  }
}

export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
