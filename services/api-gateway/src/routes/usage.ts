import { Router, type Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';

const router: Router = Router();

router.use(authenticateToken);

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
