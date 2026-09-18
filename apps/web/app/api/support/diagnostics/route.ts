import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { deployEnvironment, releaseSha } from '@/lib/server/hosting';
import { buildDiagnosticsExport } from '@/lib/support/diagnostics/export';
import { normalizeDiagnostics } from '@/lib/support/diagnostics/schema';

export const runtime = 'nodejs';

const ExportSchema = z.object({ diagnostics: z.unknown() });

async function handleExport(request: NextRequest) {
  const { userId } = await getClerkAuthUser(request);

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-tickets-write', `user:${userId}`);
  if (limited) return limited;

  const parsed = ExportSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid diagnostics bundle', parsed.error);
  }

  // The surface collected this; the server is the only redactor, so a bundle
  // that fails validation is refused rather than exported unredacted.
  const diagnostics = normalizeDiagnostics(parsed.data.diagnostics, {
    releaseSha: releaseSha() ?? null,
    deployEnv: deployEnvironment() ?? null,
  });
  if (!diagnostics) {
    throw createError.validation('Invalid diagnostics bundle');
  }

  return NextResponse.json(buildDiagnosticsExport(diagnostics), {
    headers: { 'cache-control': 'no-store' },
  });
}

export const POST = withErrorHandler(handleExport);
