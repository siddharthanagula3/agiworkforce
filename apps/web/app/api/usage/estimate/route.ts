import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  chargeCreditsForMicrousd,
  getModelMetadataById,
  resolveMaxOutputTokens,
} from '@agiworkforce/types';
import { estimateTokens } from '@agiworkforce/routing';
import { withErrorHandler } from '@/lib/error-handler';
import { isAuthGateRefusal } from '@/lib/api-auth-response';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { isApiKeyScopeError } from '@/lib/api-key-scope-error';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { creditsPerMillionTokens } from '@/lib/billing/credit-estimates';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';

export const runtime = 'nodejs';

const ContentPartSchema = z.object({ type: z.string(), text: z.string().optional() }).passthrough();

const EstimateRequestSchema = z
  .object({
    model: z.string().trim().min(1).max(200),
    messages: z
      .array(
        z
          .object({
            role: z.string().min(1),
            content: z.union([z.string(), z.array(ContentPartSchema)]),
          })
          .passthrough(),
      )
      .min(1),
    max_tokens: z.number().int().positive().optional(),
    tools: z.array(z.unknown()).optional(),
  })
  .passthrough();

export interface UsageEstimateResponse {
  object: 'usage.estimate';
  model: string;
  input_tokens: number;
  max_output_tokens: number;
  credits: { min: number; max: number };
}

function messageText(content: string | ReadonlyArray<{ type: string; text?: string }>): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text)
    .join('\n');
}

async function handler(request: NextRequest) {
  try {
    await getUserScopedDb(request, { apiKeyScope: 'usage:read' });
  } catch (error) {
    if (isApiKeyScopeError(error) || isAuthGateRefusal(error)) {
      throw error;
    }
    throw createError.unauthorized('Authentication required');
  }

  const body = await readValidatedJsonBody(
    request,
    EstimateRequestSchema,
    'An estimate takes a chat completions body: model, messages and optionally max_tokens and tools.',
  );
  const model = getModelMetadataById(body.model);
  if (!model) throw createError.validation(`Unknown model: ${body.model}`);
  if (!creditsPerMillionTokens(model.id)) {
    throw createError.validation(
      `${model.name} has no published per-token price, so its cost is known only after its route resolves.`,
    );
  }

  const texts = body.messages.map((message) => messageText(message.content));
  if (body.tools?.length) texts.push(JSON.stringify(body.tools));
  const inputTokens = texts.reduce((sum, text) => sum + estimateTokens(text, model.id), 0);
  const maxOutputTokens = body.max_tokens ?? resolveMaxOutputTokens(model.id);
  const floorMicrousd = LLMCostCalculator.estimateListCostMicrousd(model.id, inputTokens, 0);
  const ceilingMicrousd = LLMCostCalculator.estimateListCostMicrousd(
    model.id,
    inputTokens,
    maxOutputTokens,
  );
  if (floorMicrousd === null || ceilingMicrousd === null) {
    throw createError.validation(`${model.name} has no list price to estimate from.`);
  }

  const estimate: UsageEstimateResponse = {
    object: 'usage.estimate',
    model: model.id,
    input_tokens: inputTokens,
    max_output_tokens: maxOutputTokens,
    credits: {
      min: chargeCreditsForMicrousd(floorMicrousd),
      max: chargeCreditsForMicrousd(ceilingMicrousd),
    },
  };
  return NextResponse.json(estimate, { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = withCorsRoute(
  withErrorHandler(withRateLimitHandler(handler, 'credits-balance')),
);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
