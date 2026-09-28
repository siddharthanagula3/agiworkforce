import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { AUTH_LOGIN_PATH, AUTH_SIGNUP_PATH } from '@/features/auth/authRoutes';
import { getOrCreateAnonSession, requireCsrfToken } from '@/lib/csrf';
import { SSE_RESPONSE_HEADERS } from '@/app/api/llm/v1/chat/completions/lib/sse-heartbeat';
import { withErrorHandler } from '@/lib/error-handler';
import { GUEST_CHAT_CONFIG } from '@/lib/guest-chat/config';
import {
  GUEST_CHAT_ERROR_CODES,
  GUEST_CHAT_LIMIT_HEADER,
  GUEST_CHAT_REMAINING_HEADER,
  GUEST_CHAT_RESET_HEADER,
  guestChatRequestSchema,
  type GuestChatErrorBody,
  type GuestChatErrorCode,
  type GuestChatStatus,
} from '@/lib/guest-chat/contract';
import { isGuestChatAvailable } from '@/lib/guest-chat/guest-chat-access';
import {
  buildGuestChatRequest,
  guestChatModel,
  guestSpendToday,
  recordGuestSpend,
  streamGuestChat,
} from '@/lib/guest-chat/guest-chat-service';
import { logger } from '@/lib/logger';
import { moderateManagedPrompt } from '@/lib/moderation';
import {
  checkRateLimit,
  clientIpRateLimitIdentifier,
  resolveRedisOutagePolicy,
  type RateLimitInfo,
} from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { requireHumanCaller } from '@/lib/security/bot-challenge';
import { BOT_CHALLENGED_ENDPOINTS } from '@/lib/security/bot-challenge-routes';
import { getKeyValueStore } from '@/lib/server/key-value';

export const runtime = 'nodejs';
export const maxDuration = 300;

const NO_STORE = { 'cache-control': 'no-store' };

function refusal(
  status: number,
  code: GuestChatErrorCode,
  message: string,
  extra: Omit<GuestChatErrorBody['error'], 'code' | 'message'> = {},
  headers: Record<string, string> = {},
): NextResponse {
  const body: GuestChatErrorBody = { error: { code, message, ...extra } };
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

function limitHeaders(info: RateLimitInfo): Record<string, string> {
  return {
    [GUEST_CHAT_LIMIT_HEADER]: String(info.limit),
    [GUEST_CHAT_REMAINING_HEADER]: String(Math.max(0, info.remaining)),
    [GUEST_CHAT_RESET_HEADER]: new Date(info.reset).toISOString(),
  };
}

function limitReached(info: RateLimitInfo): NextResponse {
  return refusal(
    429,
    GUEST_CHAT_ERROR_CODES.limitReached,
    'You have reached today’s limit for chatting without an account. Sign in to keep going.',
    {
      dailyLimit: info.limit,
      resetAt: new Date(info.reset).toISOString(),
      signInPath: AUTH_LOGIN_PATH,
    },
    { ...info.headers, ...limitHeaders(info) },
  );
}

function withVisitorCookie(response: Response, cookie: string | undefined): Response {
  if (cookie) response.headers.append('set-cookie', cookie);
  return response;
}

async function handleStatus(request: NextRequest) {
  const visitor = await getOrCreateAnonSession(request);
  const status: GuestChatStatus = {
    available: await isGuestChatAvailable(request, visitor.id),
    dailyLimit: GUEST_CHAT_CONFIG.deviceMessagesPerDay,
    remaining: null,
    resetAt: null,
    signInPath: AUTH_LOGIN_PATH,
    signUpPath: AUTH_SIGNUP_PATH,
  };
  return withVisitorCookie(NextResponse.json(status, { headers: NO_STORE }), visitor.newCookie);
}

async function handleGuestTurn(request: NextRequest) {
  const visitor = await getOrCreateAnonSession(request);
  if (!(await isGuestChatAvailable(request, visitor.id))) {
    return refusal(403, GUEST_CHAT_ERROR_CODES.unavailable, 'Sign in to chat.', {
      signInPath: AUTH_LOGIN_PATH,
    });
  }

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  await requireHumanCaller(BOT_CHALLENGED_ENDPOINTS.guestChat);

  const parsed = guestChatRequestSchema(GUEST_CHAT_CONFIG).safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return refusal(
      400,
      GUEST_CHAT_ERROR_CODES.textOnly,
      `Chat without an account takes text only: up to ${GUEST_CHAT_CONFIG.maxMessages} messages of ${GUEST_CHAT_CONFIG.maxMessageChars} characters. Sign in to attach files or use tools.`,
      { signInPath: AUTH_LOGIN_PATH },
    );
  }

  const byNetwork = await checkRateLimit(
    request,
    'guest-chat-ip',
    clientIpRateLimitIdentifier(request),
  );
  if (!byNetwork.success) return limitReached(byNetwork);
  const byDevice = await checkRateLimit(request, 'guest-chat-device', `guest:${visitor.id}`);
  if (!byDevice.success) return limitReached(byDevice);

  const now = new Date();
  const store = getKeyValueStore();
  const capacityReached = () =>
    refusal(
      503,
      GUEST_CHAT_ERROR_CODES.capacityReached,
      'Chat without an account has reached today’s capacity. Sign in to keep going.',
      { signInPath: AUTH_LOGIN_PATH },
    );
  if (!store) {
    if (resolveRedisOutagePolicy() === 'fail-closed') return capacityReached();
  } else if ((await guestSpendToday(store, now)) >= GUEST_CHAT_CONFIG.globalSpendMicrousdPerDay) {
    return capacityReached();
  }

  const { messages } = parsed.data;
  const moderation = moderateManagedPrompt({
    userId: visitor.id,
    segments: messages
      .filter((message) => message.role === 'user')
      .map((message) => message.content),
  });
  if (!moderation.allowed) {
    return refusal(422, GUEST_CHAT_ERROR_CODES.contentPolicy, moderation.refusal);
  }

  const model = guestChatModel();
  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(GUEST_CHAT_CONFIG.turnTimeoutMs),
  ]);
  const body = streamGuestChat({
    model,
    chatRequest: buildGuestChatRequest(model, messages, GUEST_CHAT_CONFIG),
    signal,
    onSettled: async (usage) => {
      logger.info(
        {
          model: model.modelKey,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
        },
        '[guest-chat] turn settled',
      );
      if (store && usage) await recordGuestSpend(store, model, usage, now);
    },
  });

  return withVisitorCookie(
    new Response(body, {
      headers: { ...SSE_RESPONSE_HEADERS, ...limitHeaders(byDevice) },
    }),
    visitor.newCookie,
  );
}

export const GET = withErrorHandler(handleStatus);
export const POST = withErrorHandler(handleGuestTurn);
