import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger';

/**
 * CORS configuration for API routes
 *
 * Allowed origins are configured via environment variable ALLOWED_ORIGINS
 * Format: comma-separated list of origins (e.g., "https://example.com,https://app.example.com")
 *
 * In development, localhost origins are automatically allowed.
 */

// Parse allowed origins from environment variable
function getAllowedOrigins(): string[] {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  const origins: string[] = [];

  // Always allow localhost in development
  if (process.env.NODE_ENV === 'development') {
    origins.push(
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:5175',
    );
  }

  // Add production origins from environment variable
  if (envOrigins) {
    const customOrigins = envOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
    origins.push(...customOrigins);
  }

  // Add default production origin if NEXT_PUBLIC_APP_URL is set
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl && !origins.includes(appUrl)) {
    origins.push(appUrl);
  }

  return origins;
}

/**
 * Check if the origin is allowed
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) {
    // Allow requests without origin (same-origin requests, server-to-server)
    return true;
  }

  const allowedOrigins = getAllowedOrigins();

  // Check for exact match
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Check for Tauri desktop app (tauri:// or tauri.localhost)
  // SECURITY: Using regex with boundary to prevent bypass via tauri.localhost.attacker.com
  if (origin.startsWith('tauri://')) {
    return true;
  }
  const tauriLocalhostPattern = /^https:\/\/tauri\.localhost(:\d+)?$/;
  if (tauriLocalhostPattern.test(origin)) {
    return true;
  }

  // In development, allow any localhost origin
  if (process.env.NODE_ENV === 'development') {
    const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
    if (localhostPattern.test(origin)) {
      return true;
    }
  }

  return false;
}

/**
 * Get CORS headers for a response
 */
export function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
    'Access-Control-Max-Age': '86400', // 24 hours
  };

  if (isOriginAllowed(origin)) {
    // Set the specific origin - never use wildcard for authenticated endpoints
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    // When origin is null (same-origin request), don't set CORS headers - they're not needed
  } else {
    logger.warn({ origin }, 'Blocked request from disallowed origin');
    // Don't set Access-Control-Allow-Origin for disallowed origins
  }

  return headers;
}

/**
 * Security headers to add to all API responses
 */
export function getSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-XSS-Protection': '1; mode=block',
  };
}

/**
 * Handle CORS preflight request
 */
export function handleCorsPreflightRequest(request: NextRequest): NextResponse | null {
  if (request.method !== 'OPTIONS') {
    return null;
  }

  const origin = request.headers.get('origin');

  if (!isOriginAllowed(origin)) {
    logger.warn({ origin }, 'CORS preflight blocked from disallowed origin');
    return new NextResponse(null, {
      status: 403,
      headers: getSecurityHeaders(),
    });
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
    },
  });
}

/**
 * Add CORS and security headers to a response
 */
export function withCorsAndSecurityHeaders(
  response: NextResponse,
  request: NextRequest,
): NextResponse {
  const corsHeaders = getCorsHeaders(request);
  const securityHeaders = getSecurityHeaders();

  // Add all headers to the response
  for (const [key, value] of Object.entries({ ...corsHeaders, ...securityHeaders })) {
    response.headers.set(key, value);
  }

  return response;
}

/**
 * Create a JSON response with CORS and security headers
 */
export function jsonResponseWithCors(
  request: NextRequest,
  data: unknown,
  options?: { status?: number; headers?: Record<string, string> },
): NextResponse {
  const response = NextResponse.json(data, {
    status: options?.status,
    headers: options?.headers,
  });

  return withCorsAndSecurityHeaders(response, request);
}
