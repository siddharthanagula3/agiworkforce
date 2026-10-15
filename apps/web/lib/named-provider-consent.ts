import { z } from 'zod';
import {
  CHINESE_HQ_PROVIDER_IDS,
  NAMED_PROVIDER_CONSENT_SURFACES,
  composeFreeModelProviderNotice,
  hasFreeModelProviderNotice,
  type ChineseHqProviderId,
  type NamedProviderConsent,
  type NamedProviderNotice,
} from '@agiworkforce/compliance';

export const NAMED_PROVIDER_CONSENT_NAMESPACE = 'provider_consent';

const MAX_DISCLOSURE_VERSION_LENGTH = 64;

export const NamedProviderConsentSchema = z.strictObject({
  providerId: z.enum(CHINESE_HQ_PROVIDER_IDS),
  accepted: z.boolean(),
  acceptedAt: z.string().datetime({ offset: true }),
  disclosureVersion: z.string().min(1).max(MAX_DISCLOSURE_VERSION_LENGTH),
  surface: z.enum(NAMED_PROVIDER_CONSENT_SURFACES),
});

export function readNamedProviderConsent(
  namespace: unknown,
  providerId: ChineseHqProviderId,
): NamedProviderConsent | null {
  if (!namespace || typeof namespace !== 'object' || Array.isArray(namespace)) return null;
  const parsed = NamedProviderConsentSchema.safeParse(
    (namespace as Record<string, unknown>)[providerId],
  );
  return parsed.success && parsed.data.providerId === providerId ? parsed.data : null;
}

export function freeModelProviderNotice(
  provider: string | null | undefined,
): NamedProviderNotice | null {
  return provider && hasFreeModelProviderNotice(provider)
    ? composeFreeModelProviderNotice(provider)
    : null;
}
