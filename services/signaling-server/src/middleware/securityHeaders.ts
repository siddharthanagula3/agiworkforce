/**
 * @file Security Headers Middleware
 * @description Applies security headers to HTTP responses following OWASP recommendations.
 *
 * @security
 * - X-Content-Type-Options: Prevents MIME type sniffing
 * - X-Frame-Options: Prevents clickjacking
 * - X-XSS-Protection: Legacy XSS protection (deprecated but harmless)
 * - Strict-Transport-Security: Enforces HTTPS
 * - Content-Security-Policy: Restricts resource loading
 * - Referrer-Policy: Controls referrer information
 * - Permissions-Policy: Restricts browser features
 */

import type { Request, Response, NextFunction } from 'express';

// =============================================================================
// Configuration
// =============================================================================

/** Enable HSTS (only set to true in production with HTTPS) */
const ENABLE_HSTS = process.env['ENABLE_HSTS'] === 'true';

/** HSTS max-age in seconds (default: 1 year) */
const HSTS_MAX_AGE = Number(process.env['HSTS_MAX_AGE'] ?? 31536000);

/** Include subdomains in HSTS */
const HSTS_INCLUDE_SUBDOMAINS = process.env['HSTS_INCLUDE_SUBDOMAINS'] !== 'false';

/** Enable HSTS preload */
const HSTS_PRELOAD = process.env['HSTS_PRELOAD'] === 'true';

// =============================================================================
// Security Headers
// =============================================================================

/**
 * Security headers configuration following OWASP best practices
 */
const securityHeaders: Record<string, string | null> = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Prevent clickjacking - API server doesn't need to be framed
  'X-Frame-Options': 'DENY',

  // Legacy XSS protection (most modern browsers ignore this)
  'X-XSS-Protection': '1; mode=block',

  // Prevent information leakage via referrer
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Content Security Policy for API responses
  // Very restrictive since this is an API server, not serving HTML
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",

  // Restrict browser features and opt out of Google FLoC (API server doesn't need any)
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',

  // Prevent DNS prefetching to reduce information leakage
  'X-DNS-Prefetch-Control': 'off',

  // Cross-Origin policies for API security
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',

  // Remove server identification header
  'X-Powered-By': null, // Will be removed
};

/**
 * Express middleware to apply security headers
 */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  // Apply static security headers
  for (const [header, value] of Object.entries(securityHeaders)) {
    if (value === null) {
      res.removeHeader(header);
    } else {
      res.setHeader(header, value);
    }
  }

  // Apply HSTS if enabled (only in production with HTTPS)
  if (ENABLE_HSTS) {
    let hstsValue = `max-age=${HSTS_MAX_AGE}`;
    if (HSTS_INCLUDE_SUBDOMAINS) {
      hstsValue += '; includeSubDomains';
    }
    if (HSTS_PRELOAD) {
      hstsValue += '; preload';
    }
    res.setHeader('Strict-Transport-Security', hstsValue);
  }

  // Remove default Express headers that leak information
  res.removeHeader('X-Powered-By');

  next();
}

/**
 * Disable Express's default X-Powered-By header
 * Call this on the Express app: app.disable('x-powered-by')
 */
export function disablePoweredBy(app: { disable: (setting: string) => void }): void {
  app.disable('x-powered-by');
}

/**
 * Get security headers for manual application (e.g., WebSocket upgrade response)
 */
export function getSecurityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [header, value] of Object.entries(securityHeaders)) {
    if (value !== null) {
      headers[header] = value;
    }
  }

  if (ENABLE_HSTS) {
    let hstsValue = `max-age=${HSTS_MAX_AGE}`;
    if (HSTS_INCLUDE_SUBDOMAINS) {
      hstsValue += '; includeSubDomains';
    }
    if (HSTS_PRELOAD) {
      hstsValue += '; preload';
    }
    headers['Strict-Transport-Security'] = hstsValue;
  }

  return headers;
}
