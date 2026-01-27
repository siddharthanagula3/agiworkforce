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
 *
 * @deprecated Express 5.x natively catches promise rejections in async route handlers.
 * You can use async route handlers directly without this wrapper.
 * This utility is kept for backwards compatibility only.
 *
 * Before (Express 4.x required this):
 * ```typescript
 * router.get('/endpoint', asyncHandler(async (req, res) => {
 *   const data = await fetchData();
 *   res.json(data);
 * }));
 * ```
 *
 * After (Express 5.x - asyncHandler not needed):
 * ```typescript
 * router.get('/endpoint', async (req, res) => {
 *   const data = await fetchData();
 *   res.json(data);
 * });
 * ```
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
