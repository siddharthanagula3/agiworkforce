/**
 * The purpose catalogue for DPDP consent — one list, read by both halves.
 *
 * India's DPDP Act, 2023 s.6(1) requires consent to be *specific*: it is given
 * for a purpose named in the notice, and it covers only the personal data
 * necessary for that purpose. A checkbox whose label and whose stored key can
 * drift apart cannot satisfy that, because the text a person read stops being
 * the text the record names. So the label the user reads, the description the
 * notice page renders, and the key the database stores all come from the
 * objects below.
 *
 * This module is deliberately isomorphic — no `server-only`, no database, no
 * secrets. The checkbox components import it directly; the server module
 * `lib/server/consent-records.ts` re-exports it so route code has one import.
 */

/** A named purpose a data principal can consent to, one at a time. */
export interface ConsentPurpose {
  /** Stable key stored in `consent_records.purpose`. Never renamed in place. */
  readonly id: string;
  /** Checkbox label. Written as the affirmative action the person is taking. */
  readonly label: string;
  /** What is actually done with the data if this box is ticked. */
  readonly description: string;
  /**
   * True when the purpose is what the person came to do — processing it is the
   * point of their own request — and false when it is an extra we would like to
   * do. DPDP s.6(1) forbids bundling: an optional purpose may never be a
   * precondition for a necessary one, so no form may require a `false` box.
   */
  readonly necessaryForRequest: boolean;
}

/**
 * Every purpose the product collects consent for. Adding one here is what makes
 * it selectable in the consent centre and describable in the notice — there is
 * no second list to update.
 */
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

/**
 * The purposes an anonymous waitlist submission asks about.
 *
 * `product_analytics` is not here on purpose: analytics consent belongs to the
 * cookie banner, which is where it is actually acted on. Asking for it a second
 * time in an unrelated form is the bundling DPDP s.6(1) prohibits.
 */
export const WAITLIST_CONSENT_PURPOSE_IDS = ['enterprise_waitlist', 'product_updates'] as const;

export const WAITLIST_CONSENT_PURPOSES: readonly ConsentPurpose[] = CONSENT_PURPOSES.filter(
  (purpose) => (WAITLIST_CONSENT_PURPOSE_IDS as readonly string[]).includes(purpose.id),
);

const PURPOSE_IDS: ReadonlySet<string> = new Set(CONSENT_PURPOSES.map((purpose) => purpose.id));

/** Whether a client-supplied string names a purpose this product recognises. */
export function isConsentPurpose(value: unknown): value is string {
  return typeof value === 'string' && PURPOSE_IDS.has(value);
}

export function findConsentPurpose(id: string): ConsentPurpose | undefined {
  return CONSENT_PURPOSES.find((purpose) => purpose.id === id);
}

/**
 * Surfaces that may collect consent. Stored verbatim so an investigation can
 * reconstruct which flow was on screen. A closed set because a free-text
 * surface written by a client is an unvalidated input.
 */
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

/** One decision as it travels over the wire, in both directions. */
export interface ConsentDecision {
  purpose: string;
  granted: boolean;
}
