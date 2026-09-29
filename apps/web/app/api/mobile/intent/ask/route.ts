import { NextRequest, NextResponse } from 'next/server';
import { MobileIntentAskRequestSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import {
  MOBILE_INTENT_SIGN_IN_MESSAGE,
  MobileIntentRefusal,
  answerMobileIntentAsk,
} from '@/lib/server/mobile-intent';
import { resolveMobileIntentToken } from '@/lib/server/mobile-intent-tokens';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const ASK_TIMEOUT_MS = 50_000;

function refusal(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });
}

async function handleAsk(request: NextRequest) {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? '';
  const owner = bearer ? await resolveMobileIntentToken(bearer) : null;
  if (!owner) return refusal(401, 'intent_token_invalid', MOBILE_INTENT_SIGN_IN_MESSAGE);

  const limited = await withRateLimit(request, 'mobile-intent-ask', `intent:${owner.tokenId}`);
  if (limited) return limited;

  const parsed = MobileIntentAskRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return refusal(400, 'invalid_request', 'Say or type a shorter question and try again.');
  }

  try {
    const answer = await answerMobileIntentAsk({
      request,
      owner,
      prompt: parsed.data.prompt,
      signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
    });
    return NextResponse.json(answer, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof MobileIntentRefusal) {
      return refusal(error.status, error.code, error.message);
    }
    if (isAppError(error) && error.statusCode < 500 && error.userSafe) {
      return refusal(error.statusCode, String(error.code), error.message);
    }
    logger.error({ error, tokenId: owner.tokenId }, '[mobile-intent] the answer failed');
    return refusal(
      503,
      'answer_unavailable',
      'AGI Workforce could not answer right now. Try again in the app.',
    );
  }
}

export const POST = withErrorHandler(handleAsk);
