
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../lib/logger';

const ALLOWED_CONTENT_TYPES = ['application/json'];

/**
 * Middleware to validate Content-Type header for requests with bodies.
 *
 * SECURITY: OWASP recommendation - always validate Content-Type to prevent:
 * - Content-sniffing attacks
 * - Request smuggling
 * - Parser confusion vulnerabilities
 *
 * @example
 * app.use(validateContentType);
 */
export const validateContentType: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentLength = req.headers['content-length'];

    if (!contentLength || contentLength === '0') {
      next();
      return;
    }

    const contentType = req.headers['content-type'];

    if (!contentType) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Content-Type header is required for requests with body',
      });
      return;
    }

    const mediaType = contentType.split(';')[0].trim().toLowerCase();

    if (!ALLOWED_CONTENT_TYPES.includes(mediaType)) {
      res.status(415).json({
        error: 'UNSUPPORTED_MEDIA_TYPE',
        message: `Unsupported Content-Type: ${contentType}. Expected application/json`,
      });
      return;
    }
  }

  next();
};

const SUSPICIOUS_HEADERS = [
  'x-forwarded-host', // Potential host header injection
  'x-original-url', // Potential path traversal (IIS)
  'x-rewrite-url', // Potential path traversal (IIS)
  'x-http-method-override', // Method override attacks
];

/**
 * Middleware to monitor suspicious headers for security logging.
 *
 * SECURITY: Logs potential injection attempts without blocking legitimate requests.
 * In production, these logs should be monitored for anomalies.
 *
 * @example
 * app.use(validateSecurityHeaders);
 */
export const validateSecurityHeaders: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (process.env.NODE_ENV === 'production') {
    const foundHeaders = SUSPICIOUS_HEADERS.filter((header) => req.headers[header]);

    if (foundHeaders.length > 0) {
      logger.warn(
        {
          headers: foundHeaders.map((h) => ({ [h]: req.headers[h] })),
          ip: req.ip,
          path: req.path,
          method: req.method,
          userAgent: req.headers['user-agent'],
        },
        'SECURITY: Suspicious headers detected',
      );
    }
  }

  next();
};

/**
 * Factory function to create middleware that rejects unexpected fields in request body.
 *
 * SECURITY: Prevents mass assignment vulnerabilities by explicitly allowing only
 * expected fields. Any extra fields result in a 400 error.
 *
 * NOTE: Prefer using Zod's .strict() method on schemas instead of this middleware.
 * This is provided as a fallback for routes without Zod validation.
 *
 * @param allowedFields - Array of field names that are allowed in the request body
 * @returns Express middleware that validates body fields
 *
 * @example
 * router.post('/action', createStrictBodyValidator(['name', 'value']), handler);
 */
export function createStrictBodyValidator(allowedFields: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      const bodyKeys = Object.keys(req.body);
      const unexpectedFields = bodyKeys.filter((key) => !allowedFields.includes(key));

      if (unexpectedFields.length > 0) {
        if (process.env.NODE_ENV === 'production') {
          logger.warn(
            {
              unexpectedFields,
              ip: req.ip,
              path: req.path,
              method: req.method,
            },
            'SECURITY: Unexpected fields in request body',
          );
        }

        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: `Unexpected fields in request body: ${unexpectedFields.join(', ')}`,
        });
        return;
      }
    }

    next();
  };
}

/**
 * Middleware to validate request body exists for methods that require it.
 *
 * @example
 * router.post('/action', requireBody, handler);
 */
export const requireBody: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (!req.body || (typeof req.body === 'object' && Object.keys(req.body).length === 0)) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Request body is required',
      });
      return;
    }
  }

  next();
};

const CSRF_PROTECTED_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

const CSRF_EXEMPT_PATHS = ['/api/webhooks/', '/health', '/ready', '/api/v1/status'];

/**
 * Middleware that requires an `X-Requested-With: XMLHttpRequest` header
 * on all state-changing requests (POST, PUT, DELETE, PATCH).
 *
 * SECURITY: This is the custom-header CSRF mitigation pattern. Browsers
 * will not send custom headers on cross-origin form submissions or
 * simple CORS requests, so the presence of this header proves the
 * request originated from JavaScript running on an allowed origin
 * (already validated by the CORS middleware).
 *
 * Webhook endpoints are exempt because they authenticate via HMAC
 * signatures or shared secrets rather than browser cookies.
 *
 * @example
 * app.use(validateCsrf);
 */
export const validateCsrf: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!CSRF_PROTECTED_METHODS.includes(req.method)) {
    next();
    return;
  }

  if (CSRF_EXEMPT_PATHS.some((prefix) => req.path.startsWith(prefix))) {
    next();
    return;
  }

  const xRequestedWith = req.headers['x-requested-with'];

  if (xRequestedWith !== 'XMLHttpRequest') {
    if (process.env.NODE_ENV === 'production') {
      logger.warn(
        {
          ip: req.ip,
          path: req.path,
          method: req.method,
          userAgent: req.headers['user-agent'],
        },
        'SECURITY: CSRF check failed — missing X-Requested-With header',
      );
    }

    res.status(403).json({
      error: 'CSRF_ERROR',
      message: 'Missing required X-Requested-With header',
    });
    return;
  }

  next();
};
