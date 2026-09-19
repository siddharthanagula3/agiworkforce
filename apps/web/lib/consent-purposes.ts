export interface ConsentPurpose {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly necessaryForRequest: boolean;
}

export const CONSENT_PURPOSES: readonly ConsentPurpose[] = [
  {
    id: 'enterprise_waitlist',
    label: 'Store my email address so AGI can discuss contract-scoped Enterprise access with me.',
    description:
      'Your address is stored so a person can discuss contract-scoped Enterprise access and contact you as additional Enterprise capabilities become available. Organisation, SSO, SCIM, audit export, and retention controls are already live for entitled workspaces. It is used for this Enterprise conversation and nothing else; nothing in the product mails this list automatically.',
    necessaryForRequest: true,
  },
  {
    id: 'platform_availability_waitlist',
    label: 'Store my email address so we can tell you when this platform ships.',
    description:
      'Your address is stored so we can email you once AGI Mobile, AGI in Chrome or AGI in VS Code has a verified installer to download. It is used for that and nothing else, and is unrelated to the Enterprise contract-access contact list.',
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

export const PLATFORM_AVAILABILITY_CONSENT_PURPOSE_IDS = [
  'platform_availability_waitlist',
  'product_updates',
] as const;

export const PLATFORM_AVAILABILITY_CONSENT_PURPOSES: readonly ConsentPurpose[] =
  CONSENT_PURPOSES.filter((purpose) =>
    (PLATFORM_AVAILABILITY_CONSENT_PURPOSE_IDS as readonly string[]).includes(purpose.id),
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
