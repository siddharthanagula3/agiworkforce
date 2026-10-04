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
    label: 'Allow product analytics.',
    description:
      'Aggregated page views on this site via Google Analytics 4, and product usage events from the AGI apps on web, desktop, mobile, Chrome, VS Code and the command line, recorded against your account: that a response was stopped or regenerated, or that a suggested edit was accepted or dismissed, with fixed labels such as your plan or the model provider. Never your messages, code, files or file names. Used to understand which parts of the product work. Off unless you turn it on, and a workspace administrator can turn it off for every member. This is the same choice as the analytics switch in the cookie banner.',
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

const ENTERPRISE_WAITLIST_SOURCES = ['website', 'byok', 'sync', 'billing'] as const;

const PLATFORM_AVAILABILITY_WAITLIST_SOURCES = ['mobile', 'other'] as const;

export const WAITLIST_SOURCES = [
  ...ENTERPRISE_WAITLIST_SOURCES,
  ...PLATFORM_AVAILABILITY_WAITLIST_SOURCES,
] as const;

export type EnterpriseWaitlistSource = (typeof ENTERPRISE_WAITLIST_SOURCES)[number];

export type WaitlistSource = (typeof WAITLIST_SOURCES)[number];

export function isWaitlistSource(value: unknown): value is WaitlistSource {
  return typeof value === 'string' && (WAITLIST_SOURCES as readonly string[]).includes(value);
}

export function isEnterpriseWaitlistSource(
  source: WaitlistSource,
): source is EnterpriseWaitlistSource {
  return (ENTERPRISE_WAITLIST_SOURCES as readonly string[]).includes(source);
}

export function consentPurposesForWaitlistSource(
  source: WaitlistSource,
): readonly ConsentPurpose[] {
  return isEnterpriseWaitlistSource(source)
    ? WAITLIST_CONSENT_PURPOSES
    : PLATFORM_AVAILABILITY_CONSENT_PURPOSES;
}

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
  'web-settings',
  'mobile-settings',
] as const;

export type ConsentSurface = (typeof CONSENT_SURFACES)[number];

export function isConsentSurface(value: unknown): value is ConsentSurface {
  return typeof value === 'string' && (CONSENT_SURFACES as readonly string[]).includes(value);
}

export interface ConsentDecision {
  purpose: string;
  granted: boolean;
}
