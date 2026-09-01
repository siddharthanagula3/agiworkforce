/**
 * The lane vocabulary as the chat client reads it off the wire.
 *
 * A copy of the server owner's constants rather than an import of them:
 * `@/lib/services/free-lane/plan` is where they are defined, and it pulls the
 * whole routing resolver in with it, which has no business in the chat bundle
 * for the sake of two strings. `__tests__/routeLane.test.ts` imports both and
 * asserts they agree, so the copy cannot drift in silence.
 */
export const ROUTE_LANE_HEADER = 'X-AGI-Route-Lane';

export const CHAT_ROUTE_LANES = {
  free: 'free',
  managed: 'managed',
} as const;

export type ChatRouteLane = (typeof CHAT_ROUTE_LANES)[keyof typeof CHAT_ROUTE_LANES];

const CHAT_ROUTE_LANE_VALUES = new Set<string>(Object.values(CHAT_ROUTE_LANES));

/**
 * The header is absent on every response that never consulted the lane, so an
 * unreadable or unknown value is the same answer as no header: say nothing.
 */
export function readRouteLane(value: string | null | undefined): ChatRouteLane | undefined {
  const lane = value?.trim();
  return lane && CHAT_ROUTE_LANE_VALUES.has(lane) ? (lane as ChatRouteLane) : undefined;
}

export function isFreeRouteLane(value: string | null | undefined): boolean {
  return readRouteLane(value) === CHAT_ROUTE_LANES.free;
}
