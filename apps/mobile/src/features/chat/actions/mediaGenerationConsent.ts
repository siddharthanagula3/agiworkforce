import { CloudProviderConsentRequiredError, ensureCloudSendConsent } from '@/services/llmGate';
import { hasCurrentCloudProviderConsent } from '@/services/providerConsent';

export async function sharingWithProvidersAllowed(): Promise<boolean> {
  try {
    await ensureCloudSendConsent();
  } catch (error) {
    if (error instanceof CloudProviderConsentRequiredError) return false;
    throw error;
  }
  return true;
}

export function sharingWithProvidersAnswer(): true | Promise<boolean> {
  return hasCurrentCloudProviderConsent() || sharingWithProvidersAllowed();
}
