/**
 * @file WebSocket and Connection Rate Limiting
 * @description Provides per-IP rate limiting for WebSocket connections and messages
 * to prevent abuse and DDoS attacks.
 *
 * @security
 * - Per-IP connection rate limiting prevents connection flood attacks
 * - Per-IP message rate limiting prevents message flood attacks
 * - Automatic blacklisting of repeated offenders
 * - Configurable via environment variables
 */

import type { IncomingMessage } from 'http';
import { logger } from '../logger.js';

// =============================================================================
// Configuration (from environment variables with defaults)
// =============================================================================

/** Maximum connections per IP per window */
export const WS_CONNECTION_LIMIT = Number(process.env['WS_CONNECTION_LIMIT'] ?? 10);

/** Maximum messages per IP per window */
export const WS_MESSAGE_LIMIT = Number(process.env['WS_MESSAGE_LIMIT'] ?? 100);

/** Rate limit window duration in milliseconds */
export const WS_RATE_LIMIT_WINDOW_MS = Number(process.env['WS_RATE_LIMIT_WINDOW_MS'] ?? 60_000);

/** Blacklist duration in milliseconds (default: 5 minutes) */
export const WS_BLACKLIST_DURATION_MS = Number(process.env['WS_BLACKLIST_DURATION_MS'] ?? 300_000);

/** Number of violations before blacklisting */
export const WS_BLACKLIST_THRESHOLD = Number(process.env['WS_BLACKLIST_THRESHOLD'] ?? 5);

/** Cleanup interval for expired entries (default: 60 seconds) */
const CLEANUP_INTERVAL_MS = 60_000;

// =============================================================================
// Types
// =============================================================================

interface RateLimitEntry {
  /** Number of requests/connections in current window */
  count: number;
  /** Window start timestamp */
  windowStart: number;
  /** Number of rate limit violations */
  violations: number;
  /** Last violation timestamp */
  lastViolation: number;
}

interface BlacklistEntry {
  /** Blacklist expiration timestamp */
  expiresAt: number;
  /** Reason for blacklisting */
  reason: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
  reason?: string;
}

// =============================================================================
// Rate Limiter Class
// =============================================================================

export class WebSocketRateLimiter {
  /** Per-IP connection tracking */
  private connectionLimits = new Map<string, RateLimitEntry>();

  /** Per-IP message tracking */
  private messageLimits = new Map<string, RateLimitEntry>();

  /** Blacklisted IPs */
  private blacklist = new Map<string, BlacklistEntry>();

  /** Cleanup interval handle */
  private cleanupHandle: ReturnType<typeof setInterval>;

  constructor() {
    // Start periodic cleanup
    this.cleanupHandle = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  /**
   * Extract client IP from request, handling proxies
   */
  getClientIp(req: IncomingMessage): string {
    // Check X-Forwarded-For header (from reverse proxy)
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0];
      const ip = ips?.trim();
      if (ip) return ip;
    }

    // Check X-Real-IP header (from nginx)
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? (realIp[0] ?? 'unknown') : realIp;
    }

    // Fall back to socket address
    return req.socket.remoteAddress ?? 'unknown';
  }

  /**
   * Check if IP is blacklisted
   */
  isBlacklisted(ip: string): { blacklisted: boolean; reason?: string; retryAfter?: number } {
    const entry = this.blacklist.get(ip);
    if (!entry) {
      return { blacklisted: false };
    }

    const now = Date.now();
    if (entry.expiresAt <= now) {
      this.blacklist.delete(ip);
      return { blacklisted: false };
    }

    return {
      blacklisted: true,
      reason: entry.reason,
      retryAfter: Math.ceil((entry.expiresAt - now) / 1000),
    };
  }

  /**
   * Manually blacklist an IP
   */
  blacklistIp(ip: string, reason: string, durationMs: number = WS_BLACKLIST_DURATION_MS): void {
    this.blacklist.set(ip, {
      expiresAt: Date.now() + durationMs,
      reason,
    });
    logger.warn({ ip, reason }, 'IP blacklisted');
  }

  /**
   * Check and record a connection attempt
   */
  checkConnection(ip: string): RateLimitResult {
    // Check blacklist first
    const blacklistStatus = this.isBlacklisted(ip);
    if (blacklistStatus.blacklisted) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: blacklistStatus.retryAfter,
        reason: `IP blacklisted: ${blacklistStatus.reason}`,
      };
    }

    return this.checkLimit(ip, this.connectionLimits, WS_CONNECTION_LIMIT, 'connection_flood');
  }

  /**
   * Check and record a message
   */
  checkMessage(ip: string): RateLimitResult {
    // Check blacklist first
    const blacklistStatus = this.isBlacklisted(ip);
    if (blacklistStatus.blacklisted) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: blacklistStatus.retryAfter,
        reason: `IP blacklisted: ${blacklistStatus.reason}`,
      };
    }

    return this.checkLimit(ip, this.messageLimits, WS_MESSAGE_LIMIT, 'message_flood');
  }

  /**
   * Generic rate limit check
   */
  private checkLimit(
    ip: string,
    limitMap: Map<string, RateLimitEntry>,
    maxLimit: number,
    violationType: string,
  ): RateLimitResult {
    const now = Date.now();
    let entry = limitMap.get(ip);

    // Initialize or reset window if expired
    if (!entry || now - entry.windowStart >= WS_RATE_LIMIT_WINDOW_MS) {
      entry = {
        count: 0,
        windowStart: now,
        violations: entry?.violations ?? 0,
        lastViolation: entry?.lastViolation ?? 0,
      };
      limitMap.set(ip, entry);
    }

    // Increment count
    entry.count++;

    // Check if over limit
    if (entry.count > maxLimit) {
      entry.violations++;
      entry.lastViolation = now;

      // Check if should be blacklisted
      if (entry.violations >= WS_BLACKLIST_THRESHOLD) {
        this.blacklistIp(ip, violationType, WS_BLACKLIST_DURATION_MS);
      }

      const retryAfter = Math.ceil((entry.windowStart + WS_RATE_LIMIT_WINDOW_MS - now) / 1000);

      logger.warn({ ip, violationType, violations: entry.violations }, 'Rate limit exceeded');

      return {
        allowed: false,
        remaining: 0,
        retryAfter,
        reason: `Rate limit exceeded: ${violationType}`,
      };
    }

    return {
      allowed: true,
      remaining: maxLimit - entry.count,
    };
  }

  /**
   * Cleanup expired entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - WS_RATE_LIMIT_WINDOW_MS * 2;

    // Cleanup old rate limit entries
    for (const [ip, entry] of this.connectionLimits.entries()) {
      if (entry.windowStart < cutoff && entry.violations === 0) {
        this.connectionLimits.delete(ip);
      }
    }

    for (const [ip, entry] of this.messageLimits.entries()) {
      if (entry.windowStart < cutoff && entry.violations === 0) {
        this.messageLimits.delete(ip);
      }
    }

    // Cleanup expired blacklist entries
    for (const [ip, entry] of this.blacklist.entries()) {
      if (entry.expiresAt <= now) {
        this.blacklist.delete(ip);
      }
    }
  }

  /**
   * Get current stats for monitoring
   */
  getStats(): {
    activeConnections: number;
    activeMessages: number;
    blacklistedIps: number;
    topOffenders: Array<{ ip: string; violations: number }>;
  } {
    const topOffenders: Array<{ ip: string; violations: number }> = [];

    for (const [ip, entry] of this.connectionLimits.entries()) {
      if (entry.violations > 0) {
        topOffenders.push({ ip, violations: entry.violations });
      }
    }

    for (const [ip, entry] of this.messageLimits.entries()) {
      const existing = topOffenders.find((o) => o.ip === ip);
      if (existing) {
        existing.violations += entry.violations;
      } else if (entry.violations > 0) {
        topOffenders.push({ ip, violations: entry.violations });
      }
    }

    topOffenders.sort((a, b) => b.violations - a.violations);

    return {
      activeConnections: this.connectionLimits.size,
      activeMessages: this.messageLimits.size,
      blacklistedIps: this.blacklist.size,
      topOffenders: topOffenders.slice(0, 10),
    };
  }

  /**
   * Stop the cleanup interval
   */
  shutdown(): void {
    clearInterval(this.cleanupHandle);
  }
}

// Export singleton instance
export const wsRateLimiter = new WebSocketRateLimiter();
