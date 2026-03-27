/**
 * API Abuse Prevention Service
 *
 * CRITICAL: Prevents API abuse through multiple layers:
 * - Rate limiting per user
 * - Cost-based throttling (expensive models = stricter limits)
 * - Concurrent request limits
 * - Request size limits
 * - Pattern-based abuse detection
 */

import { checkRateLimit } from '@core/auth/rate-limiter';
import { getModelMetadataById, normalizeModelId } from '@agiworkforce/types';

export interface ApiUsageMetrics {
  requestsLastMinute: number;
  requestsLastHour: number;
  totalCostLastHour: number;
  concurrentRequests: number;
}

export interface AbusePrevention {
  allowed: boolean;
  reason?: string;
  retryAfter?: number; // Seconds
  currentMetrics?: ApiUsageMetrics;
}

const MODEL_COST_TIERS = {
  high: {
    maxPerMinute: 10,
    maxPerHour: 100,
    maxConcurrent: 2,
  },
  medium: {
    maxPerMinute: 20,
    maxPerHour: 300,
    maxConcurrent: 3,
  },
  low: {
    maxPerMinute: 30,
    maxPerHour: 500,
    maxConcurrent: 5,
  },
} as const;

/**
 * Request size limits
 */
export const REQUEST_LIMITS = {
  maxInputTokens: 100000, // ~75K words
  maxOutputTokens: 4096,
  maxMessageLength: 200000, // Characters
  maxMessagesInConversation: 100,
  maxTotalConversationLength: 500000, // Characters
};

/**
 * In-memory tracking (replace with Redis in production)
 */
const userMetrics = new Map<
  string,
  {
    requests: Array<{ timestamp: number; cost: number; model: string }>;
    concurrentRequests: number;
  }
>();

/**
 * Get cost tier for a model
 */
function getModelCostTier(model: string): keyof typeof MODEL_COST_TIERS {
  const canonicalModelId = normalizeModelId(model) ?? model;
  const metadata = getModelMetadataById(canonicalModelId);

  if (metadata) {
    const compositeCost = metadata.inputCost + metadata.outputCost;

    if (compositeCost >= 10 || metadata.qualityTier === 'best') {
      return 'high';
    }

    if (compositeCost >= 1 || metadata.qualityTier === 'balanced') {
      return 'medium';
    }

    return 'low';
  }

  const normalizedModel = canonicalModelId.toLowerCase();
  if (
    normalizedModel.includes('opus') ||
    normalizedModel.includes('gpt-5.4') ||
    normalizedModel.includes('sonar-pro')
  ) {
    return 'high';
  }
  if (
    normalizedModel.includes('mini') ||
    normalizedModel.includes('flash') ||
    normalizedModel.includes('lite')
  ) {
    return 'low';
  }
  return 'medium';
}

/**
 * Estimate request cost (simplified)
 */
function estimateRequestCost(model: string, inputTokens: number): number {
  const tier = getModelCostTier(model);
  const baseCost = tier === 'high' ? 0.03 : tier === 'medium' ? 0.01 : 0.001;
  return baseCost * (inputTokens / 1000);
}

/**
 * Check if user can make API request
 */
export async function checkApiAbuse(
  userId: string,
  model: string,
  inputLength: number,
): Promise<AbusePrevention> {
  // Get or initialize metrics
  let metrics = userMetrics.get(userId);
  if (!metrics) {
    metrics = { requests: [], concurrentRequests: 0 };
    userMetrics.set(userId, metrics);
  }

  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;

  // Clean old requests
  metrics.requests = metrics.requests.filter((r) => r.timestamp > oneHourAgo);

  // Calculate current usage
  const requestsLastMinute = metrics.requests.filter((r) => r.timestamp > oneMinuteAgo).length;

  const requestsLastHour = metrics.requests.length;

  const totalCostLastHour = metrics.requests
    .filter((r) => r.timestamp > oneHourAgo)
    .reduce((sum, r) => sum + r.cost, 0);

  // Get limits for this model
  const tier = getModelCostTier(model);
  const limits = MODEL_COST_TIERS[tier];

  // Check rate limit
  const rateLimitResult = await checkRateLimit('AI_REQUEST', userId);
  if (!rateLimitResult.allowed) {
    return {
      allowed: false,
      reason: 'Rate limit exceeded for AI requests',
      retryAfter: rateLimitResult.retryAfter,
    };
  }

  // Check per-minute limit
  if (requestsLastMinute >= limits.maxPerMinute) {
    return {
      allowed: false,
      reason: `Too many requests (${requestsLastMinute}/${limits.maxPerMinute} per minute for ${tier}-cost models)`,
      retryAfter: 60,
      currentMetrics: {
        requestsLastMinute,
        requestsLastHour,
        totalCostLastHour,
        concurrentRequests: metrics.concurrentRequests,
      },
    };
  }

  // Check per-hour limit
  if (requestsLastHour >= limits.maxPerHour) {
    return {
      allowed: false,
      reason: `Hourly limit exceeded (${requestsLastHour}/${limits.maxPerHour} for ${tier}-cost models)`,
      retryAfter: 3600,
      currentMetrics: {
        requestsLastMinute,
        requestsLastHour,
        totalCostLastHour,
        concurrentRequests: metrics.concurrentRequests,
      },
    };
  }

  // Check concurrent requests BEFORE incrementing to avoid counter leaks
  // on subsequent rejections (input size, token count)
  if (metrics.concurrentRequests >= limits.maxConcurrent) {
    return {
      allowed: false,
      reason: `Too many concurrent requests (${metrics.concurrentRequests}/${limits.maxConcurrent})`,
      retryAfter: 30,
      currentMetrics: {
        requestsLastMinute,
        requestsLastHour,
        totalCostLastHour,
        concurrentRequests: metrics.concurrentRequests,
      },
    };
  }

  // Check input size
  if (inputLength > REQUEST_LIMITS.maxMessageLength) {
    return {
      allowed: false,
      reason: `Input too long (${inputLength} chars, max ${REQUEST_LIMITS.maxMessageLength})`,
    };
  }

  // Estimate tokens (rough: 1 token ≈ 4 characters)
  const estimatedTokens = Math.ceil(inputLength / 4);
  if (estimatedTokens > REQUEST_LIMITS.maxInputTokens) {
    return {
      allowed: false,
      reason: `Input too large (estimated ${estimatedTokens} tokens, max ${REQUEST_LIMITS.maxInputTokens})`,
    };
  }

  // Increment concurrent counter only after all checks pass
  metrics.concurrentRequests++;

  return {
    allowed: true,
    currentMetrics: {
      requestsLastMinute,
      requestsLastHour,
      totalCostLastHour,
      concurrentRequests: metrics.concurrentRequests,
    },
  };
}

/**
 * Track API request start
 */
export function trackRequestStart(userId: string, model: string, inputTokens: number): void {
  const metrics = userMetrics.get(userId);
  if (!metrics) return;

  const cost = estimateRequestCost(model, inputTokens);

  metrics.requests.push({
    timestamp: Date.now(),
    cost,
    model,
  });

  // Updated: Jan 15th 2026 - Removed duplicate increment (now handled in checkRateLimit)
  // Concurrent requests are now incremented atomically in checkRateLimit before the check
  // metrics.concurrentRequests++; // Removed - increment happens in checkRateLimit
}

/**
 * Track API request completion
 */
export function trackRequestEnd(userId: string): void {
  const metrics = userMetrics.get(userId);
  if (!metrics) return;

  metrics.concurrentRequests = Math.max(0, metrics.concurrentRequests - 1);
}

/**
 * Detect unusual patterns (potential abuse)
 */
export function detectAbusePatterns(
  userId: string,
  _recentRequests: number,
): {
  isAbusive: boolean;
  patterns: string[];
} {
  const metrics = userMetrics.get(userId);
  if (!metrics) {
    return { isAbusive: false, patterns: [] };
  }

  const patterns: string[] = [];
  const now = Date.now();
  const last5Minutes = now - 5 * 60 * 1000;

  // Check for rapid-fire requests
  const recentRequestCount = metrics.requests.filter((r) => r.timestamp > last5Minutes).length;

  if (recentRequestCount > 50) {
    patterns.push('rapid_fire_requests');
  }

  // Check for same model spam
  const modelCounts = new Map<string, number>();
  metrics.requests
    .filter((r) => r.timestamp > last5Minutes)
    .forEach((r) => {
      modelCounts.set(r.model, (modelCounts.get(r.model) || 0) + 1);
    });

  for (const [model, count] of modelCounts.entries()) {
    if (count > 30) {
      patterns.push(`model_spam_${model}`);
    }
  }

  // Check for excessive concurrent requests
  if (metrics.concurrentRequests > 10) {
    patterns.push('excessive_concurrent_requests');
  }

  return {
    isAbusive: patterns.length > 0,
    patterns,
  };
}

/**
 * Cleanup old metrics (run periodically)
 */
export function cleanupOldMetrics(): void {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  for (const [userId, metrics] of userMetrics.entries()) {
    // Remove old requests
    metrics.requests = metrics.requests.filter((r) => r.timestamp > oneHourAgo);

    // Remove empty entries
    if (metrics.requests.length === 0 && metrics.concurrentRequests === 0) {
      userMetrics.delete(userId);
    }
  }
}

// Cleanup interval management
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Start the cleanup interval (call once on app init)
 */
export function startCleanupInterval(): void {
  if (cleanupIntervalId) return; // Already running
  cleanupIntervalId = setInterval(cleanupOldMetrics, 10 * 60 * 1000);
}

/**
 * Stop the cleanup interval (call on app shutdown)
 */
export function stopCleanupInterval(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

// Auto-start cleanup interval in browser environment
if (typeof window !== 'undefined') {
  startCleanupInterval();
}

/**
 * Get current usage for user (for display)
 */
export function getUserUsageStats(userId: string): ApiUsageMetrics {
  const metrics = userMetrics.get(userId);
  if (!metrics) {
    return {
      requestsLastMinute: 0,
      requestsLastHour: 0,
      totalCostLastHour: 0,
      concurrentRequests: 0,
    };
  }

  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;

  return {
    requestsLastMinute: metrics.requests.filter((r) => r.timestamp > oneMinuteAgo).length,
    requestsLastHour: metrics.requests.filter((r) => r.timestamp > oneHourAgo).length,
    totalCostLastHour: metrics.requests
      .filter((r) => r.timestamp > oneHourAgo)
      .reduce((sum, r) => sum + r.cost, 0),
    concurrentRequests: metrics.concurrentRequests,
  };
}
