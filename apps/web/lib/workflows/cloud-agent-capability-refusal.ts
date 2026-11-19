import type { AppError } from '@/lib/errors';

/**
 * The capability switch answered no. Unlike a Workflow-platform failure this is
 * an admission verdict, so no transport fallback may turn it back into a run.
 */
export class CloudAgentCapabilityRefusedError extends Error {
  constructor(readonly refusal: AppError) {
    super(refusal.message, { cause: refusal });
    this.name = 'CloudAgentCapabilityRefusedError';
  }
}
