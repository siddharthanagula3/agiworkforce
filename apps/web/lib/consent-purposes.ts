
export interface ConsentPurpose {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly necessaryForRequest: boolean;
}

export const CONSENT_PURPOSES: readonly ConsentPurpose[] = [
  {
    id: 'enterprise_waitlist',
    label: 'Store my email address on the enterprise early-access list.',
    description:
      'Your address is stored so we can reach you when enterprise organisation and SSO features open. It is used for that and nothing else. To be straight about the mechanism: nothing in the product mails this list automatically, so the announcement is sent by a person.',
    necessaryForRequest: true,
  },
  {
    id: 'product_updates',
    label: 'Also email me product updates and launch news.',
    description:
      'Occasional email about new releases and capabilities, sent by a person rather than an automated system. Separate from the early-access list, so you can withdraw it without leaving that list.',
    necessaryForRequest: false,
  },
  {
    id: 'product_analytics',
    label: 'Allow aggregated usage analytics.',
    description:
      'Aggregated page views via Google Analytics 4, used to understand which parts of the product get used. Off unless you turn it on. This is the same choice as the analytics switch in the cookie banner.',
    necessaryForRequest: false,
  },
] as const;

export const WAITLIST_CONSENT_PURPOSE_IDS = ['enterprise_waitlist', 'product_updates'] as const;

export const WAITLIST_CONSENT_PURPOSES: readonly ConsentPurpose[] = CONSENT_PURPOSES.filter(
  (purpose) => (WAITLIST_CONSENT_PURPOSE_IDS as readonly string[]).includes(purpose.id),
);

const PURPOSE_IDS: ReadonlySet<string> = new Set(CONSENT_PURPOSES.map((purpose) => purpose.id));

export function isConsentPurpose(value: unknown): value is string {
  return typeof value === 'string' && PURPOSE_IDS.has(value);
}

export function findConsentPurpose(id: string): ConsentPurpose | undefined {
  return CONSENT_PURPOSES.find((purpose) => purpose.id === id);
}

export const CONSENT_SURFACES = [
  'web-waitlist-inline',
  'web-waitlist-modal',
  'web-consent-centre',
  'web-cookie-banner',
] as const;

export type ConsentSurface = (typeof CONSENT_SURFACES)[number];

export function isConsentSurface(value: unknown): value is ConsentSurface {
  return typeof value === 'string' && (CONSENT_SURFACES as readonly string[]).includes(value);
}

export interface ConsentDecision {
  purpose: string;
  granted: boolean;
}
