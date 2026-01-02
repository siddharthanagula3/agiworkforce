import type { Request, Response, NextFunction } from 'express';

/**
 * Async error handling wrapper for Express route handlers.
 * Catches promise rejections and passes them to Express error handlers.
 * Based on Express.js best practices for async/await error handling.
 */
export const asyncHandler = (
  fn: (req: Request<any, any, any, any>, res: Response<any>, next: NextFunction) => Promise<any>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as any, res as any, next)).catch(next);
  };
};
