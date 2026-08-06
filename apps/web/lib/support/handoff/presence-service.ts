/**
 * @file presence-service.ts
 *
 * Decides whether a human is actually there. This is the module that stops the
 * widget from lying.
 *
 * # FOUR INDEPENDENT GATES. ALL MUST PASS. DEFAULT IS UNAVAILABLE.
 *
 *   1. DEPLOYMENT SWITCH — `AGI_SUPPORT_LIVE_HANDOFF_ENABLED` must be explicitly
 *      truthy. A deployment that never configured support cannot claim a human,
 *      even if presence rows somehow exist. Absent ⇒ unavailable.
 *   2. EXPLICIT ROSTER — at least one `support_agent_presence` row with
 *      `status = 'online'`. Rows only exist for humans an admin deliberately
 *      onboarded. Empty table ⇒ unavailable.
 *   3. LIVENESS, NOT A STALE BOOLEAN — `last_heartbeat_at` must be inside the
 *      TTL. This is the gate that matters most in practice: a status column
 *      alone ALWAYS eventually lies, because an agent who closes the tab, loses
 *      wifi, or sleeps their laptop never writes `offline`. With the TTL they
 *      decay to unavailable within ~90s with no action from anyone.
 *   4. CAPACITY — at least one fresh agent below `max_concurrent_sessions`.
 *      Otherwise the user would join a queue no one can serve.
 *
 * ANY failure — including a thrown database error — resolves to unavailable.
 * There is no code path from an exception to "a human is available".
 *
 * The headline/detail strings are authored HERE, server-side, and rendered
 * verbatim by the UI. That is deliberate: a client cannot compose "connecting
 * you to an agent" because the server never hands it that sentence unless a
 * claimable session with a deadline exists.
 */

import 'server-only';

import { logger } from '@/lib/logger';
import { getHandoffConfig, type HandoffConfig } from './config';
import { listFreshOnlineAgents } from './store';
import type { HandoffAvailability, HandoffAvailabilityReason } from './types';

/** Short cache so a widget mount storm does not fan out to the database. */
const CACHE_TTL_MS = 5_000;

interface CacheEntry {
  value: HandoffAvailability;
  at: number;
}
let cache: CacheEntry | null = null;

/** Test seam and safety valve; also called whenever presence is mutated. */
export function clearAvailabilityCache(): void {
  cache = null;
}

function fallbackBlock(config: HandoffConfig) {
  return {
    channel: 'email' as const,
    address: config.fallbackEmail,
    expectedReply: config.expectedReplyCopy,
    configured: config.emailConfigured,
  };
}

/**
 * Copy for every unavailable reason. Note what is NOT here: no "shortly", no
 * "connecting", no estimate that is not backed by a real deadline.
 */
function unavailableCopy(
  reason: Exclude<HandoffAvailabilityReason, 'live'>,
  config: HandoffConfig,
): { headline: string; detail: string } {
  const emailSentence = config.emailConfigured
    ? `Send this conversation to the support team and they'll reply by email ${config.expectedReplyCopy}.`
    : `Live chat and email escalation are both unconfigured on this deployment, so nothing will be sent automatically. Email ${config.fallbackEmail} directly.`;

  switch (reason) {
    case 'not_configured':
      return {
        headline: 'No one is available right now',
        detail: `Live chat isn't set up on this deployment. ${emailSentence}`,
      };
    case 'disabled':
      return {
        headline: 'No one is available right now',
        detail: `Live chat is turned off. ${emailSentence}`,
      };
    case 'no_agents_online':
      return {
        headline: 'No one is available right now',
        detail: `Nobody from the support team is online. ${emailSentence}`,
      };
    case 'at_capacity':
      return {
        headline: 'No one is available right now',
        detail: `Everyone on the support team is already in another conversation. ${emailSentence}`,
      };
  }
}

function buildUnavailable(
  reason: Exclude<HandoffAvailabilityReason, 'live'>,
  config: HandoffConfig,
): HandoffAvailability {
  const copy = unavailableCopy(reason, config);
  return {
    live: false,
    reason,
    headline: copy.headline,
    detail: copy.detail,
    fallback: fallbackBlock(config),
    waitTimeoutSeconds: config.waitTimeoutSeconds,
    pollIntervalMs: config.pollIntervalMs,
    checkedAt: new Date().toISOString(),
  };
}

function buildLive(config: HandoffConfig): HandoffAvailability {
  return {
    live: true,
    reason: 'live',
    headline: 'Someone is available now',
    detail:
      `You'll be connected to a person, and they'll see this conversation so you don't have to ` +
      `repeat yourself. If nobody picks up within ${config.waitTimeoutSeconds} seconds we'll email ` +
      `the whole thing to the support team instead.`,
    fallback: fallbackBlock(config),
    waitTimeoutSeconds: config.waitTimeoutSeconds,
    pollIntervalMs: config.pollIntervalMs,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * @param options.skipCache pass true inside `createHandoff` — the decision that
 *   actually commits a user to a waiting state must be made against live data,
 *   not a 5-second-old read.
 */
export async function resolveHumanAvailability(
  options: { skipCache?: boolean } = {},
): Promise<HandoffAvailability> {
  const config = getHandoffConfig();

  // GATE 1 — deployment switch. Checked before any I/O so an unconfigured
  // deployment cannot even be made to query for agents.
  if (!config.liveHandoffEnabled) {
    return buildUnavailable('not_configured', config);
  }

  if (!options.skipCache && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }

  let availability: HandoffAvailability;
  try {
    // GATES 2 + 3 — an explicitly-online roster, filtered by heartbeat freshness
    // in the SQL predicate itself.
    const agents = await listFreshOnlineAgents(config.heartbeatTtlSeconds);
    if (agents.length === 0) {
      availability = buildUnavailable('no_agents_online', config);
    } else {
      // GATE 4 — capacity.
      const hasHeadroom = agents.some(
        (agent) => agent.active_sessions < agent.max_concurrent_sessions,
      );
      availability = hasHeadroom ? buildLive(config) : buildUnavailable('at_capacity', config);
    }
  } catch (error) {
    // Fail closed. A database error must never resolve to "a human is there".
    logger.error({ error }, 'Support presence lookup failed · defaulting to unavailable');
    availability = buildUnavailable('no_agents_online', config);
  }

  cache = { value: availability, at: Date.now() };
  return availability;
}
