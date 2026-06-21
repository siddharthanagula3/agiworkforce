import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getOptionalEnv } from '@/utils/env';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { withErrorHandler } from '@/lib/error-handler';
import { requireAdmin } from '@/lib/auth-guards';

/**
 * Debug endpoint to check LLM provider configuration
 * Only accessible in development or by authenticated admins
 *
 * GET /api/debug/llm-status
 */
async function handleGetLlmStatus(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;
  // Only allow in development or for canonical PLATFORM admins. The previous
  // check accepted any 'owner'/'admin' of any organization_members row, so a user
  // who created their own org (and is its owner) could read platform LLM provider
  // configuration. requireAdmin gates on the platform role (Clerk metadata).
  const isDev = process.env.NODE_ENV === 'development';
  if (!isDev) {
    await requireAdmin(request);
  }

  // Provider configuration check
  const providers = [
    { name: 'openai', envKey: 'OPENAI_API_KEY', baseUrlKey: 'OPENAI_BASE_URL' },
    { name: 'anthropic', envKey: 'ANTHROPIC_API_KEY', baseUrlKey: 'ANTHROPIC_BASE_URL' },
    { name: 'google', envKey: 'GOOGLE_API_KEY', baseUrlKey: 'GOOGLE_BASE_URL' },
    { name: 'xai', envKey: 'XAI_API_KEY', baseUrlKey: 'XAI_BASE_URL' },
    { name: 'qwen', envKey: 'QWEN_API_KEY', baseUrlKey: 'QWEN_BASE_URL' },
    { name: 'moonshot', envKey: 'MOONSHOT_API_KEY', baseUrlKey: 'MOONSHOT_BASE_URL' },
    { name: 'deepseek', envKey: 'DEEPSEEK_API_KEY', baseUrlKey: 'DEEPSEEK_BASE_URL' },
    { name: 'perplexity', envKey: 'PERPLEXITY_API_KEY', baseUrlKey: 'PERPLEXITY_BASE_URL' },
  ];

  const status: Record<
    string,
    {
      configured: boolean;
    }
  > = {};

  for (const provider of providers) {
    const apiKey = getOptionalEnv(provider.envKey);

    status[provider.name] = {
      configured: !!apiKey,
    };
  }

  // Environment info (safe subset only)
  const envInfo = {
    NODE_ENV: process.env['NODE_ENV'],
    VERCEL_ENV: process.env['VERCEL_ENV'] || null,
  };

  // Log detailed info server-side only
  logger.info({ providerStatus: status, envInfo }, 'LLM status check');

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    environment: envInfo,
    providers: status,
    summary: {
      configured: Object.entries(status)
        .filter(([, s]) => s.configured)
        .map(([name]) => name),
      notConfigured: Object.entries(status)
        .filter(([, s]) => !s.configured)
        .map(([name]) => name),
    },
  });
}

export const GET = withErrorHandler(handleGetLlmStatus);
