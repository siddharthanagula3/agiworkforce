import 'server-only';

import { NextResponse } from 'next/server';
import { acquireManagedTurnSlot, type ManagedTurnSlotResult } from '@/lib/rate-limit';
import { getSecurityHeaders } from '@/lib/cors';
import { logger } from '@/lib/logger';

/**
 * GOV-3: the plan's concurrent-turn ceiling is already occupied.
 *
 * Actionable rather than generic: the user's own other turns are the cause and
 * stopping one is the immediate fix, so say that and name the ceiling.
 */
export function managedTurnSlotExhaustedResponse(slot: ManagedTurnSlotResult): NextResponse {
  const limit = slot.limit ?? 0;
  const headers: Record<string, string> = { ...getSecurityHeaders() };
  if (slot.limit !== null) headers['X-AGI-Concurrent-Turn-Limit'] = String(slot.limit);
  headers['X-AGI-Concurrent-Turns-Active'] = String(slot.active);

  if (slot.denial === 'limiter-unavailable') {
    return NextResponse.json(
      {
        error: {
          message:
            'We cannot verify your concurrent-response limit right now. Please retry in a moment.',
          type: 'server_error',
          code: 'concurrency_limiter_unavailable',
        },
      },
      { status: 503, headers: { ...headers, 'Retry-After': '30' } },
    );
  }

  return NextResponse.json(
    {
      error: {
        message:
          limit > 0
            ? `Your plan allows ${limit} response${limit === 1 ? '' : 's'} at a time and ${limit === 1 ? 'one is' : 'all of them are'} already running. Stop a running response or wait for it to finish, then send this message again. Upgrading raises this limit.`
            : 'Your plan does not include concurrent managed responses. Upgrade to send this message.',
        type: 'rate_limit_error',
        code: 'concurrent_turn_limit_reached',
        concurrent_turn_limit: slot.limit,
        active_turns: slot.active,
      },
    },
    { status: 429, headers },
  );
}

function isEventStreamResponse(response: NextResponse | Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('text/event-stream');
}

/**
 * GOV-3: hand slot ownership to a streaming response.
 *
 * A streaming turn OUTLIVES its handler: the route returns as soon as the SSE
 * body exists, while the provider keeps producing for minutes afterwards.
 * Releasing in the handler's `finally` would therefore free the slot while the
 * turn is still running and make the ceiling meaningless. Instead the body is
 * passed through an identity `TransformStream` whose completion, error, and
 * cancel all land in the same `finally`, which is exactly when the underlying
 * stream's own terminal/`cancel()` hooks settle billing, because cancelling the
 * branch propagates upstream and triggers them.
 *
 * Release is idempotent, and unreleased slots additionally age out of the Redis
 * set, so the worst case of a missed edge is a bounded, self-healing over-count.
 */
function attachTurnSlotToStream(
  response: NextResponse | Response,
  release: () => Promise<void>,
): Response {
  const body = response.body;
  if (!body) {
    void release();
    return response;
  }
  const passthrough = new TransformStream<Uint8Array, Uint8Array>();
  void body
    .pipeTo(passthrough.writable)
    .catch(() => {
      // Client aborts and upstream failures are already reported by the
      // stream's own settlement hooks; this pipe only owns the slot.
    })
    .finally(() => {
      void release();
    });
  return new Response(passthrough.readable, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * The one way to start a managed turn.
 *
 * Every entry point that dispatches an agent turn has to take a slot, and the
 * approve and resume-input routes did not: a paused run could be resumed past
 * the plan's ceiling as many times as it had checkpoints. Wrapping the dispatch
 * here rather than repeating the acquire-and-attach pair means the next entry
 * point inherits the ceiling instead of having to remember it.
 */
export async function withManagedTurnSlot(
  caller: { userId: string; planTier: string },
  dispatch: () => Promise<NextResponse | Response>,
): Promise<NextResponse | Response> {
  const turnSlot = await acquireManagedTurnSlot({
    userId: caller.userId,
    planTier: caller.planTier,
    turnId: crypto.randomUUID(),
  });

  if (!turnSlot.admitted) {
    logger.info(
      {
        userId: caller.userId,
        planTier: caller.planTier,
        limit: turnSlot.limit,
        active: turnSlot.active,
      },
      'GOV-3: concurrent-turn ceiling reached; rejecting turn',
    );
    return managedTurnSlotExhaustedResponse(turnSlot);
  }

  const slot = turnSlot.slot;
  const release = async (): Promise<void> => {
    await slot?.release();
  };

  let streamOwnsSlot = false;
  try {
    const response = await dispatch();
    if (isEventStreamResponse(response)) {
      // Flag set only AFTER the pipe is installed, so a throw while wrapping
      // still falls through to the `finally` release below.
      const owned = attachTurnSlotToStream(response, release);
      streamOwnsSlot = true;
      return owned;
    }
    return response;
  } finally {
    if (!streamOwnsSlot) await release();
  }
}
