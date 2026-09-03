export interface FailureMode {
  id: string;
  surface: string;
  injectedFault: string;
  expectedResponse: string;
}

export const FAILURE_MODES: readonly FailureMode[] = Object.freeze([
  {
    id: 'dependency-rate-limited-with-retry-after',
    surface: 'shared retry policy',
    injectedFault: 'dependency answers 429 carrying Retry-After',
    expectedResponse: 'waits exactly the advertised interval, then succeeds',
  },
  {
    id: 'dependency-advertises-an-abusive-retry-after',
    surface: 'shared retry policy',
    injectedFault: 'dependency answers 503 with Retry-After of one hour',
    expectedResponse: 'clamps the wait to the policy ceiling instead of parking the caller',
  },
  {
    id: 'dependency-overloaded',
    surface: 'shared retry policy',
    injectedFault: 'dependency answers 500 on every attempt',
    expectedResponse: 'retries on a jittered curve and gives up with a classified error',
  },
  {
    id: 'retry-storm-against-a-failing-dependency',
    surface: 'shared retry policy',
    injectedFault: 'many callers retry the same dead dependency',
    expectedResponse: 'the shared budget empties and later callers degrade to a single attempt',
  },
  {
    id: 'connection-lost-after-a-non-idempotent-write',
    surface: 'shared retry policy',
    injectedFault: 'socket reset with no response for a call the caller declared non-idempotent',
    expectedResponse: 'refuses to replay the write and surfaces the failure',
  },
  {
    id: 'caller-cancels-mid-retry',
    surface: 'shared retry policy',
    injectedFault: 'abort signal fires while a retry is waiting',
    expectedResponse: 'stops immediately and reports the abort rather than sleeping out the curve',
  },
  {
    id: 'oversized-request-payload',
    surface: 'web API route wrapper',
    injectedFault: 'client declares a body far above the route ceiling',
    expectedResponse: '413 before the route handler runs',
  },
  {
    id: 'context-window-overflow',
    surface: 'chat completions context assembly',
    injectedFault: 'conversation history exceeds the resolved model context window',
    expectedResponse: 'history is dropped and truncated down to a budget below the window',
  },
  {
    id: 'stripe-webhook-replayed-after-success',
    surface: 'stripe webhook idempotency',
    injectedFault: 'an event id that already settled is delivered a second time',
    expectedResponse: 'the replay is refused and reported as already succeeded, never re-applied',
  },
  {
    id: 'database-outage-during-webhook-idempotency',
    surface: 'stripe webhook idempotency',
    injectedFault: 'the database refuses the connection while the event is being claimed',
    expectedResponse: 'the event is left unprocessed and answered 500 so Stripe redelivers it',
  },
  {
    id: 'shared-rate-limiter-outage',
    surface: 'web rate limiter',
    injectedFault: 'the shared Redis limiter is unreachable under a fail-closed policy',
    expectedResponse:
      'security-sensitive keys are blocked with a rate-limiter-unavailable signal while business-critical keys stay open',
  },
  {
    id: 'provider-availability-failure-mid-request',
    surface: 'managed chat completions failover',
    injectedFault: 'the serving provider answers 503 before the first byte reaches the client',
    expectedResponse:
      'the request rotates onto another managed route, and refuses to rotate on a client error or an abort',
  },
  {
    id: 'abandoned-sandbox-outlives-its-ttl',
    surface: 'managed sandbox reclaim',
    injectedFault: 'a sandbox is still running long past the reclaim max age',
    expectedResponse: 'the stale sandbox is killed while a fresh one is retained',
  },
]);
