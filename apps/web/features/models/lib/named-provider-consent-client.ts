'use client';

import {
  isNamedProviderConsentCurrent,
  namedProviderConsentRecord,
  type NamedProviderNotice,
} from '@agiworkforce/compliance';
import { getProviderOffering, getProviderOfferings } from '@agiworkforce/types';
import { savePreferenceNamespace } from '@/app/settings/_lib/preferences-client';
import {
  NAMED_PROVIDER_CONSENT_NAMESPACE,
  freeModelProviderNotice,
  readNamedProviderConsent,
} from '@/lib/named-provider-consent';

export const NAMED_PROVIDER_CONSENT_CHANGED_EVENT = 'agi:named-provider-consent-changed';

export interface NamedProviderConsentChangedDetail {
  providerId: string;
  accepted: boolean;
}

function announceNamedProviderConsent(detail: NamedProviderConsentChangedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<NamedProviderConsentChangedDetail>(NAMED_PROVIDER_CONSENT_CHANGED_EVENT, {
      detail,
    }),
  );
}

function servedOfferingProvider(modelId: string | null | undefined): string | null {
  const offering = modelId ? getProviderOffering(modelId) : null;
  return offering?.identityStatus === 'exact' && offering.quotaProbeProtocol
    ? offering.provider
    : null;
}

export function freeModelNoticeFor(modelId: string | null | undefined): NamedProviderNotice | null {
  return freeModelProviderNotice(servedOfferingProvider(modelId));
}

export function freeModelNotices(): NamedProviderNotice[] {
  const providers = new Set(
    Object.keys(getProviderOfferings()).flatMap((key) => servedOfferingProvider(key) ?? []),
  );
  return [...providers].flatMap((provider) => freeModelProviderNotice(provider) ?? []);
}

export function namedProviderConsentGiven(
  namespace: unknown,
  notice: NamedProviderNotice,
): boolean {
  return isNamedProviderConsentCurrent(
    readNamedProviderConsent(namespace, notice.providerId),
    notice,
  );
}

export function namedProviderConsentRecorded(
  namespace: unknown,
  notice: NamedProviderNotice,
): boolean {
  return readNamedProviderConsent(namespace, notice.providerId) !== null;
}

export async function saveNamedProviderConsent(
  notice: NamedProviderNotice,
  accepted: boolean,
): Promise<void> {
  await savePreferenceNamespace(
    NAMED_PROVIDER_CONSENT_NAMESPACE,
    {
      [notice.providerId]: namedProviderConsentRecord({
        notice,
        accepted,
        surface: 'web',
        now: new Date(),
      }),
    },
    { merge: true },
  );
  announceNamedProviderConsent({ providerId: notice.providerId, accepted });
}

export const NAMED_PROVIDER_CONSENT_REQUIRED_EVENT = 'agi:named-provider-consent-required';

export interface NamedProviderConsentRequiredDetail {
  providerId: string;
  modelId: string;
}

export function announceNamedProviderConsentRequired(providerId: string, modelId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<NamedProviderConsentRequiredDetail>(NAMED_PROVIDER_CONSENT_REQUIRED_EVENT, {
      detail: { providerId, modelId },
    }),
  );
}
