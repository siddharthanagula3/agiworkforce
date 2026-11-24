import {
  CloudProviderConsentDeclinedError,
  CloudProviderConsentRequiredError,
  ensureCloudSendConsent,
} from '@/services/llmGate';
import { hasCurrentCloudProviderConsent } from '@/services/providerConsent';

export async function sharingWithProvidersAllowed(onDeclined?: () => void): Promise<boolean> {
  try {
    await ensureCloudSendConsent();
  } catch (error) {
    if (error instanceof CloudProviderConsentRequiredError) {
      if (error instanceof CloudProviderConsentDeclinedError) onDeclined?.();
      return false;
    }
    throw error;
  }
  return true;
}

export function sharingWithProvidersAnswer(): true | Promise<boolean> {
  return hasCurrentCloudProviderConsent() || sharingWithProvidersAllowed();
}
