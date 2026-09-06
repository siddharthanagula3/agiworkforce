import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { createError } from '@/lib/errors';
import {
  PluginMarketplaceFetchError,
  PluginMarketplaceValidationError,
  isMissingPluginMarketplaceSchema,
  listMarketplaceSources,
  registerMarketplaceSource,
} from '@/lib/services/plugin-marketplace-service';
import { isDirectoryMarketplaceRepository } from '@/features/plugins/server/directory/official-marketplace';
import type { PluginMarketplaceSourceListResponse } from '@agiworkforce/cloud-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RegisterMarketplaceBodySchema = z
  .object({
    repositoryUrl: z.string().trim().min(1).max(2_000),
    ref: z.string().trim().min(1).max(200).optional(),
    name: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;

  let sources;
  try {
    sources = await listMarketplaceSources(getNeonDb(), userId);
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) {
      throw createError.serviceUnavailable(
        'The plugin marketplace is not available yet. Please try again later.',
      );
    }
    throw error;
  }

  const body: PluginMarketplaceSourceListResponse = {
    sources: sources.filter((source) => !isDirectoryMarketplaceRepository(source.repositoryUrl)),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);
  const csrf = await requireCsrfToken(request, userId);
  if (csrf) return csrf as NextResponse;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;

  const parsed = RegisterMarketplaceBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_MARKETPLACE_SOURCE',
          message: 'Provide a public GitHub repository URL.',
        },
      },
      { status: 400 },
    );
  }

  try {
    const source = await registerMarketplaceSource(getNeonDb(), userId, {
      repositoryUrl: parsed.data.repositoryUrl,
      ref: parsed.data.ref ?? null,
      name: parsed.data.name ?? null,
    });
    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    if (error instanceof PluginMarketplaceValidationError) {
      return NextResponse.json(
        {
          error: {
            code: 'MARKETPLACE_MANIFEST_INVALID',
            message: error.message,
            issues: error.issues,
          },
        },
        { status: 422 },
      );
    }
    if (error instanceof PluginMarketplaceFetchError) {
      return NextResponse.json(
        { error: { code: 'MARKETPLACE_UNREACHABLE', message: error.message } },
        { status: 502 },
      );
    }
    if (isMissingPluginMarketplaceSchema(error)) {
      throw createError.serviceUnavailable(
        'The plugin marketplace is not available yet. Please try again later.',
      );
    }
    throw error;
  }
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
