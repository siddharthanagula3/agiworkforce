/**
 * @file Middleware exports
 * @description Central export point for all security middleware
 */

export {
  WebSocketRateLimiter,
  wsRateLimiter,
  WS_CONNECTION_LIMIT,
  WS_MESSAGE_LIMIT,
  WS_RATE_LIMIT_WINDOW_MS,
  WS_BLACKLIST_DURATION_MS,
  WS_BLACKLIST_THRESHOLD,
  type RateLimitResult,
} from './rateLimit.js';

export {
  securityHeadersMiddleware,
  disablePoweredBy,
  getSecurityHeaders,
} from './securityHeaders.js';

export {
  adminAuthMiddleware,
  isAdminEnabled,
  getAuthStats,
  cleanupAuthFailures,
} from './adminAuth.js';
