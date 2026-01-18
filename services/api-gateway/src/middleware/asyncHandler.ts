import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

/**
 * Type for async route handler functions.
 * Generic parameters allow typed request params, body, query, and response.
 */
type AsyncRouteHandler<
  P = ParamsDictionary,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = ParsedQs,
> = (
  req: Request<P, ResBody, ReqBody, ReqQuery>,
  res: Response<ResBody>,
  next: NextFunction,
) => Promise<void>;

/**
 * Async error handling wrapper for Express route handlers.
 * Catches promise rejections and passes them to Express error handlers.
 * Based on Express.js best practices for async/await error handling.
 */
export const asyncHandler = <
  P = ParamsDictionary,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = ParsedQs,
>(
  fn: AsyncRouteHandler<P, ResBody, ReqBody, ReqQuery>,
): RequestHandler<P, ResBody, ReqBody, ReqQuery> => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
