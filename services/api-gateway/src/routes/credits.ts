import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';
import { supabase } from '../lib/supabase';

const router: Router = Router();

router.use(authenticateToken);

// Schema for deducting credits
const deductCreditsSchema = z.object({
  amount_cents: z.number().int().positive(),
  description: z.string().optional(),
  metadata: z
    .object({
      model: z.string().optional(),
      provider: z.string().optional(),
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      conversation_id: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

/**
 * GET /api/credits/balance
 * Get current credit balance for the authenticated user
 */
router.get(
  '/balance',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { data, error } = await supabase.rpc('get_credit_balance', {
      p_user_id: user.userId,
    });

    if (error) {
      console.error('Failed to get credit balance:', error);
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
 */
router.post(
  '/check',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { amount_cents } = z
      .object({ amount_cents: z.number().int().positive() })
      .parse(req.body);

    const { data, error } = await supabase.rpc('check_credits_available', {
      p_user_id: user.userId,
      p_amount_cents: amount_cents,
    });

    if (error) {
      console.error('Failed to check credits:', error);
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
 */
router.post(
  '/deduct',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const { amount_cents, description, metadata } = deductCreditsSchema.parse(req.body);

    const { data, error } = await supabase.rpc('deduct_credits', {
      p_user_id: user.userId,
      p_amount_cents: amount_cents,
      p_description: description || `LLM usage: ${metadata?.model || 'unknown model'}`,
      p_metadata: metadata || {},
    });

    if (error) {
      console.error('Failed to deduct credits:', error);
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
