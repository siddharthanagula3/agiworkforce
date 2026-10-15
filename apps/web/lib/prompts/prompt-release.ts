import routingPolicies from '@agiworkforce/model-registry/routing-policies.json';
import {
  currentRelease,
  type ReleaseLedger,
  type ReleaseRecord,
} from '@agiworkforce/routing/release-ledger';

import type { PromptId } from './prompt-manifest';
import { promptStamp } from './prompt-registry';

const RELEASE_LEDGER = routingPolicies.release as ReleaseLedger;

export type PromptReleaseChannel = ReleaseRecord['channel'];

export interface PromptAudience {
  readonly internalStaff: boolean;
}

export function promptReleaseChannel(id: PromptId, version: number): PromptReleaseChannel | null {
  return currentRelease(RELEASE_LEDGER, 'prompt', promptStamp(id, version))?.channel ?? null;
}

export function promptReleaseAdmits(
  channel: PromptReleaseChannel | null,
  audience: PromptAudience,
): boolean {
  if (channel === null) return false;
  return channel !== 'internal' || audience.internalStaff;
}
