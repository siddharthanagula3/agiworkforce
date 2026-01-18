/**
 * @file Credits API Routes
 * @security
 * - Rate limiting: Applied per-endpoint based on financial sensitivity
 * - Input validation: Zod schemas with .strict() to reject unexpected fields
 * - Authentication: JWT required for all endpoints
 *
 * Rate limit rationale (OWASP compliant):
 * - GET /balance: 10/min - read operation, moderate limit
 * - POST /check: 10/min - read operation, moderate limit
 * - POST /deduct: 5/min - financial write operation, strictest limit
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';
import { supabase } from '../lib/supabase';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';

const router: Router = Router();

router.use(authenticateToken);

// Schema for checking credits - SECURITY: .strict() rejects unexpected fields
const checkCreditsSchema = z
  .object({
    amount_cents: z.number().int().positive(),
  })
  .strict();

// Schema for deducting credits - SECURITY: .strict() rejects unexpected fields
// Note: metadata uses .passthrough() for flexibility, but outer object is strict
const deductCreditsSchema = z
  .object({
    amount_cents: z.number().int().positive(),
    description: z.string().max(500).optional(),
    metadata: z
      .object({
        model: z.string().max(100).optional(),
        provider: z.string().max(50).optional(),
        input_tokens: z.number().int().nonnegative().optional(),
        output_tokens: z.number().int().nonnegative().optional(),
        conversation_id: z.string().max(100).optional(),
      })
      .passthrough()
      .optional(),
    // Idempotency key to prevent duplicate deductions on retry
    idempotency_key: z.string().max(256).optional(),
  })
  .strict();

/**
 * GET /api/credits/balance
 * Get current credit balance for the authenticated user
 *
 * SECURITY: Rate limited to 10 requests/minute per user
 */
router.get(
  '/balance',
  createRateLimiter('credits-balance'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { data, error } = await supabase.rpc('get_credit_balance', {
      p_user_id: user.userId,
    });

    if (error) {
      logger.error({ error }, 'Failed to get credit balance');
      throw new AppError('Failed to get credit balance', 500);
    }

    // The RPC returns an array, get the first row
    const balance = Array.isArray(data) ? data[0] : data;

    if (!balance || !balance.account_id) {
      res.json({
        has_credits: false,
        account_id: null,
        credits_allocated_cents: 0,
        credits_used_cents: 0,
        credits_remaining_cents: 0,
        daily_limit_cents: 0,
        daily_used_cents: 0,
        daily_remaining_cents: 0,
        period_start: null,
        period_end: null,
      });
      return;
    }

    res.json({
      has_credits: true,
      account_id: balance.account_id,
      credits_allocated_cents: balance.credits_allocated_cents,
      credits_used_cents: balance.credits_used_cents,
      credits_remaining_cents: balance.credits_remaining_cents,
      daily_limit_cents: balance.daily_limit_cents,
      daily_used_cents: balance.daily_used_cents,
      daily_remaining_cents: balance.daily_remaining_cents,
      period_start: balance.period_start,
      period_end: balance.period_end,
      last_daily_reset_at: balance.last_daily_reset_at,
    });
  }),
);

/**
 * POST /api/credits/check
 * Check if user has enough credits for a given amount
 *
 * SECURITY: Rate limited to 10 requests/minute per user
 */
router.post(
  '/check',
  createRateLimiter('credits-check'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    // SECURITY: Use strict schema to reject unexpected fields
    const { amount_cents } = checkCreditsSchema.parse(req.body);

    const { data, error } = await supabase.rpc('check_credits_available', {
      p_user_id: user.userId,
      p_amount_cents: amount_cents,
    });

    if (error) {
      logger.error({ error }, 'Failed to check credits');
      throw new AppError('Failed to check credits', 500);
    }

    res.json({
      available: data === true,
      requested_cents: amount_cents,
    });
  }),
);

/**
 * POST /api/credits/deduct
 * Deduct credits from the authenticated user's account
 * This should be called after each LLM usage from the desktop app
 *
 * SECURITY: Rate limited to 5 requests/minute per user (strictest - financial)
 */
router.post(
  '/deduct',
  createRateLimiter('credits-deduct'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { amount_cents, description, metadata, idempotency_key } = deductCreditsSchema.parse(
      req.body,
    );

    const { data, error } = await supabase.rpc('deduct_credits', {
      p_user_id: user.userId,
      p_amount_cents: amount_cents,
      p_description: description || `LLM usage: ${metadata?.model || 'unknown model'}`,
      p_metadata: metadata || {},
      p_idempotency_key: idempotency_key || null,
    });

    if (error) {
      logger.error({ error }, 'Failed to deduct credits');
      throw new AppError('Failed to deduct credits', 500);
    }

    // The RPC returns an array, get the first row
    const result = Array.isArray(data) ? data[0] : data;

    if (!result) {
      throw new AppError('No credit account found', 404);
    }

    // Check if deduction was successful
    if (!result.success) {
      res.status(402).json({
        success: false,
        error: result.error || 'Credit deduction failed',
        code: result.code,
        remaining_cents: result.remaining_cents,
        daily_limit: result.daily_limit,
        daily_used: result.daily_used,
        daily_remaining: result.daily_remaining,
        reset_in_hours: result.reset_in_hours,
      });
      return;
    }

    res.json({
      success: true,
      remaining_cents: result.remaining_cents,
      daily_limit: result.daily_limit,
      daily_used: result.daily_used,
      daily_remaining: result.daily_remaining,
      reset_in_hours: result.reset_in_hours,
    });
  }),
);

export { router as creditsRouter };
