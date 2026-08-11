import 'server-only';

import type { ManagedMediaVideoProvider } from '@agiworkforce/cloud-contracts';

/**
 * Release admission for paid managed video providers.
 *
 * Runway safety-moderated tasks are charged like successful tasks, while the
 * current managed-usage contract can only charge a delivered completion or
 * release a failed result. Until the founder chooses who bears that cost and
 * the ledger gains an explicit charged-without-asset outcome, admitting
 * Runway would either leak provider spend or charge users under a false
 * completion. Google and OpenRouter have durable deliverable-result billing;
 * Runway stays withheld until the charged-moderation outcome is represented.
 */
export function isVideoProviderReleaseEnabled(provider: ManagedMediaVideoProvider): boolean {
  return provider === 'google' || provider === 'openrouter';
}
