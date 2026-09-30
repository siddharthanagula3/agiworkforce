import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { enqueueJob } from '@/lib/jobs/job-service';
import { logger } from '@/lib/logger';
import {
  getResearchReportByRequestId,
  recordResearchReportSettledCost,
  type PersistedResearchReport,
} from '@/lib/services/research-report-service';

export async function recordResearchRunSettledCost(
  db: DatabaseAdapter,
  input: { userId: string; requestId: string; settledCostMicrousd: number },
): Promise<boolean> {
  try {
    await recordResearchReportSettledCost(db, input);
    return true;
  } catch (error) {
    logger.warn(
      { error, requestId: input.requestId },
      'Settled research cost could not be recorded on the report; queued for retry',
    );
    try {
      await enqueueJob(db, {
        kind: 'research.settle-report-cost',
        userId: input.userId,
        idempotencyKey: `research-cost:${input.requestId}`.slice(0, 255),
        payload: { requestId: input.requestId, settledCostMicrousd: input.settledCostMicrousd },
      });
    } catch (queueError) {
      logger.error(
        { error: queueError, requestId: input.requestId },
        'Settled research cost could neither be recorded nor queued',
      );
    }
    return false;
  }
}

export function readRunResearchReport(
  db: DatabaseAdapter,
  input: { userId: string; requestId: string },
): Promise<PersistedResearchReport | null> {
  return getResearchReportByRequestId(db, input);
}
