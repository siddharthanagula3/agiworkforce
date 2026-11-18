import { logger } from '@/lib/logger';
import { settleFreeTrialRequest } from '@/lib/services/free-trial-service';
import type { ProcessedRequest } from './request-processor';

export async function settleRefusedFreeTrial(
  processed: Pick<ProcessedRequest, 'freeTrial' | 'requestId'>,
  errorClass: string,
): Promise<void> {
  if (!processed.freeTrial) return;
  try {
    await settleFreeTrialRequest({
      reservation: processed.freeTrial,
      outcome: 'failed',
      attempt: { outcome: 'failed', errorClass },
    });
  } catch (error) {
    logger.error(
      { event: 'free_trial_refusal_release_unrecorded', error, requestId: processed.requestId },
      'Free-tier reservation release could not be persisted',
    );
  }
}
