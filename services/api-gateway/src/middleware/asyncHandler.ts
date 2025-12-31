import type { Request, Response, NextFunction } from 'express';

/**
 * Async error handling wrapper for Express route handlers.
 * Catches promise rejections and passes them to Express error handlers.
 * Based on Express.js best practices for async/await error handling.
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
