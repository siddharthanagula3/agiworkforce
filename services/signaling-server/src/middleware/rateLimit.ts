import type { IncomingMessage } from 'http';
import { resolveClientIp } from '../client-ip.js';
import { logger } from '../logger.js';

export const WS_CONNECTION_LIMIT = Number(process.env['WS_CONNECTION_LIMIT'] ?? 10);

export const WS_MESSAGE_LIMIT = Number(process.env['WS_MESSAGE_LIMIT'] ?? 100);

export const WS_RATE_LIMIT_WINDOW_MS = Number(process.env['WS_RATE_LIMIT_WINDOW_MS'] ?? 60_000);

export const WS_BLACKLIST_DURATION_MS = Number(process.env['WS_BLACKLIST_DURATION_MS'] ?? 300_000);

export const WS_BLACKLIST_THRESHOLD = Number(process.env['WS_BLACKLIST_THRESHOLD'] ?? 5);

const CLEANUP_INTERVAL_MS = 60_000;

interface RateLimitEntry {
  count: number;
  windowStart: number;
  violations: number;
  lastViolation: number;
}

interface BlacklistEntry {
  expiresAt: number;
  reason: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
  reason?: string;
}

export class WebSocketRateLimiter {
  private connectionLimits = new Map<string, RateLimitEntry>();

  private messageLimits = new Map<string, RateLimitEntry>();

  private blacklist = new Map<string, BlacklistEntry>();

  private cleanupHandle: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupHandle = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  getClientIp(req: IncomingMessage): string {
    return resolveClientIp(req);
  }

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

  blacklistIp(ip: string, reason: string, durationMs: number = WS_BLACKLIST_DURATION_MS): void {
    this.blacklist.set(ip, {
      expiresAt: Date.now() + durationMs,
      reason,
    });
    logger.warn({ ip, reason }, 'IP blacklisted');
  }

  checkConnection(ip: string): RateLimitResult {
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

  checkMessage(ip: string): RateLimitResult {
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

  private checkLimit(
    ip: string,
    limitMap: Map<string, RateLimitEntry>,
    maxLimit: number,
    violationType: string,
  ): RateLimitResult {
    const now = Date.now();
    let entry = limitMap.get(ip);

    if (!entry || now - entry.windowStart >= WS_RATE_LIMIT_WINDOW_MS) {
      entry = {
        count: 0,
        windowStart: now,
        violations: entry?.violations ?? 0,
        lastViolation: entry?.lastViolation ?? 0,
      };
      limitMap.set(ip, entry);
    }

    entry.count++;

    if (entry.count > maxLimit) {
      entry.violations++;
      entry.lastViolation = now;

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

  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - WS_RATE_LIMIT_WINDOW_MS * 2;

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

    for (const [ip, entry] of this.blacklist.entries()) {
      if (entry.expiresAt <= now) {
        this.blacklist.delete(ip);
      }
    }
  }

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

  shutdown(): void {
    clearInterval(this.cleanupHandle);
  }
}

export const wsRateLimiter = new WebSocketRateLimiter();
