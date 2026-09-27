import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { absoluteUrl } from '@/lib/seo/site';

export const WITHDRAWAL_CONSENT_VERSION = '2026-09-27';
export const WITHDRAWAL_CONSENT_VERSION_KEY = 'withdrawal_consent_version';
export const WITHDRAWAL_CONSENT_AT_KEY = 'withdrawal_consent_at';

export const WITHDRAWAL_CONSENT_STATEMENT =
  'I ask for immediate access. I understand that if I withdraw within 14 days, my refund is reduced in proportion to the credits I have used.';

export function withdrawalConsentMessage(): string {
  return (
    `I agree to the [Terms of Service](${absoluteUrl(CANONICAL_POLICY_ROUTES.terms)}). ` +
    `${WITHDRAWAL_CONSENT_STATEMENT} ` +
    `See the [refund policy](${absoluteUrl(CANONICAL_POLICY_ROUTES.refunds)}).`
  );
}

export function withdrawalConsentMetadata(): Record<string, string> {
  return { [WITHDRAWAL_CONSENT_VERSION_KEY]: WITHDRAWAL_CONSENT_VERSION };
}
