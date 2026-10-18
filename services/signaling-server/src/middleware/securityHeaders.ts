import type { Request, Response, NextFunction } from 'express';
import { HSTS_MAX_AGE_DEFAULT_SECONDS } from '../constants.js';
import { envPositiveInteger } from '../env.js';

const ENABLE_HSTS = process.env['ENABLE_HSTS'] === 'true';

const HSTS_MAX_AGE = envPositiveInteger('HSTS_MAX_AGE', HSTS_MAX_AGE_DEFAULT_SECONDS);

const HSTS_INCLUDE_SUBDOMAINS = process.env['HSTS_INCLUDE_SUBDOMAINS'] !== 'false';

const HSTS_PRELOAD = process.env['HSTS_PRELOAD'] === 'true';

const securityHeaders: Record<string, string | null> = {
  'X-Content-Type-Options': 'nosniff',

  'X-Frame-Options': 'DENY',

  'X-XSS-Protection': '1; mode=block',

  'Referrer-Policy': 'strict-origin-when-cross-origin',

  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",

  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',

  'X-DNS-Prefetch-Control': 'off',

  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',

  'X-Powered-By': null, // Will be removed
};

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  for (const [header, value] of Object.entries(securityHeaders)) {
    if (value === null) {
      res.removeHeader(header);
    } else {
      res.setHeader(header, value);
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
    res.setHeader('Strict-Transport-Security', hstsValue);
  }

  res.removeHeader('X-Powered-By');

  next();
}

export function disablePoweredBy(app: { disable: (setting: string) => void }): void {
  app.disable('x-powered-by');
}
