import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { logger } from '../lib/logger';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const QUIET_PATHS = new Set(['/health', '/ready']);

export function resolveRequestId(candidate: string | string[] | undefined): string {
  if (typeof candidate === 'string' && REQUEST_ID_PATTERN.test(candidate)) {
    return candidate;
  }
  return randomUUID();
}

export function getRequestId(res: Response): string | undefined {
  const requestId = res.locals['requestId'];
  return typeof requestId === 'string' ? requestId : undefined;
}

/**
 * Establishes one bounded request identifier for every HTTP request.
 *
 * A caller-provided identifier is preserved only when it is safe to log and
 * forward. Invalid or oversized values are replaced instead of reflected.
 */
export const requestContext: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const requestId = resolveRequestId(req.headers['x-request-id']);
  const startedAt = process.hrtime.bigint();

  res.locals['requestId'] = requestId;
  res.setHeader('x-request-id', requestId);

  res.once('finish', () => {
    if (QUIET_PATHS.has(req.path)) {
      return;
    }

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info(
      {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      },
      'Request completed',
    );
  });

  next();
};
