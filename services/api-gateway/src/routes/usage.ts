import { Router, type Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';

const router: Router = Router();

router.use(authenticateToken);

// Router-level floor. Every route below already declares its own, stricter
// limiter, so this changes no current limit — `default` is 100/min and the
// tightest here is 10/min. It exists so a route ADDED to this file later is
// never unlimited by omission, which is what `js/missing-rate-limiting`
// flagged and what the other nine gateway routers already do. Mounted after
// authenticateToken so keyGenerator resolves `user:<id>` rather than falling
// back to the caller's IP.
router.use(createRateLimiter('default'));

function retiredUsageResponse(res: Response): void {
  res.status(410).json({
    error: 'Detailed usage history is no longer available',
    code: 'PERCENTAGE_USAGE_REQUIRED',
    usage_url: '/api/credits/balance',
  });
}

router.get('/', createRateLimiter('usage-summary'), (_req, res) => retiredUsageResponse(res));
router.get('/summary', createRateLimiter('usage-summary'), (_req, res) =>
  retiredUsageResponse(res),
);
router.get('/history', createRateLimiter('usage-history'), (_req, res) =>
  retiredUsageResponse(res),
);

export { router as usageRouter };
