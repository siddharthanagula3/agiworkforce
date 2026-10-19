import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Packer } from 'docx';
import { markdownToDocumentBlocks } from '@agiworkforce/unified-chat/markdown-document';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { assertConnectorsReleased } from '@/lib/connectors/connector-capability';
import {
  connectorUnreachableMessage,
  resolveConnectorAccessToken,
} from '@/lib/connectors/oauth-access';
import { GOOGLE_DRIVE_CONNECTOR_ID } from '@/lib/connectors/google-drive-files';
import {
  GoogleDocsExportError,
  canCreateDriveFiles,
  createGoogleDocFromDocx,
} from '@/lib/connectors/google-docs-export';
import { buildDocxDocument } from '@/features/chat/services/export-docx';

export const runtime = 'nodejs';

const BodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(1_000_000),
});

function refusal(code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status: 409 });
}

async function handleExport(request: NextRequest): Promise<Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;
  const rateLimitResponse = await withRateLimit(request, 'share-create');
  if (rateLimitResponse) return rateLimitResponse;
  assertConnectorsReleased();

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Request body must be JSON');
  }
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) throw createError.validation('Invalid document');

  const { userId } = await getUserScopedDb(request);
  const access = await resolveConnectorAccessToken(userId, GOOGLE_DRIVE_CONNECTOR_ID);
  if (access.status === 'unreachable') {
    throw createError.serviceUnavailable(connectorUnreachableMessage('Google Drive')).asUserSafe();
  }
  if (access.status !== 'ready') {
    return refusal(
      access.status === 'reauthorization-required'
        ? 'google_drive_reconnect_required'
        : 'google_drive_not_connected',
      access.status === 'reauthorization-required'
        ? 'Reconnect Google Drive to save documents to it.'
        : 'Connect Google Drive to save documents to it.',
    );
  }
  if (!canCreateDriveFiles(access.grantedScopes)) {
    return refusal(
      'google_drive_write_not_granted',
      'Google Drive is connected for reading only. Reconnect it and allow it to create files.',
    );
  }

  const document = buildDocxDocument(markdownToDocumentBlocks(parsed.data.content), {
    title: parsed.data.title,
    date: new Date().toLocaleDateString('en-US'),
  });
  const docx = new Uint8Array(await Packer.toBuffer(document));
  try {
    const created = await createGoogleDocFromDocx(access.accessToken, parsed.data.title, docx);
    return NextResponse.json({ url: created.webViewLink }, { status: 201 });
  } catch (error) {
    if (error instanceof GoogleDocsExportError) {
      throw createError.conflict(error.message);
    }
    throw error;
  }
}

export const POST = withErrorHandler(handleExport);
