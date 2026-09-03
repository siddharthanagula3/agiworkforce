import 'server-only';

import { logger } from '@/lib/logger';
import { getHandoffConfig, type HandoffConfig } from './config';
import { listFreshOnlineAgents } from './store';
import type { HandoffAvailability, HandoffAvailabilityReason } from './types';

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

export async function resolveHumanAvailability(
  options: { skipCache?: boolean } = {},
): Promise<HandoffAvailability> {
  const config = getHandoffConfig();

  if (!config.liveHandoffEnabled) {
    return buildUnavailable('not_configured', config);
  }

  if (!options.skipCache && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }

  let availability: HandoffAvailability;
  try {
    const agents = await listFreshOnlineAgents(config.heartbeatTtlSeconds);
    if (agents.length === 0) {
      availability = buildUnavailable('no_agents_online', config);
    } else {
      const hasHeadroom = agents.some(
        (agent) => agent.active_sessions < agent.max_concurrent_sessions,
      );
      availability = hasHeadroom ? buildLive(config) : buildUnavailable('at_capacity', config);
    }
  } catch (error) {
    logger.error({ error }, 'Support presence lookup failed · defaulting to unavailable');
    availability = buildUnavailable('no_agents_online', config);
  }

  cache = { value: availability, at: Date.now() };
  return availability;
}
