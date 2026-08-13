/**
 * Single source of truth for legal-entity facts used across the policy pages.
 *
 * WHY THIS FILE EXISTS
 * Before this file, the entity name, the notice address, the contact mailbox
 * and each document's "last updated" date were hardcoded per page. They drifted:
 * `/terms` and `/privacy` published "AGI Automation LLC, Austin, Texas, USA"
 * while `/mobile/legal` published "1309 Coffeen Avenue STE 1200, Sheridan,
 * Wyoming 82801, USA". One company cannot publish two notice addresses across
 * its own terms — a procurement reviewer checking the entity finds the
 * discrepancy immediately.
 *
 * FOUNDER CONFIRMATION REQUIRED (do not resolve this from code):
 *  - `NOTICE_ADDRESS` below is the only COMPLETE postal address that appears
 *    anywhere in this repository, so it is the one used everywhere now. If the
 *    operating address is in fact Austin, Texas, change it here once.
 *  - `CONTACT_EMAIL` is the only mailbox proven in use across the marketing
 *    surface (it appears on every policy page today). `legal@`, `privacy@`,
 *    `support@` and `security@` are NOT provably provisioned — do not add a
 *    policy commitment to a mailbox until it is confirmed to receive mail.
 *    Subject-line routing is used instead, matching the existing convention on
 *    `/security`.
 *
 * RULE FOR EDITORS: every claim a policy page makes must be checkable in this
 * repository. If you cannot point at the code, cut the sentence.
 */

/** Registered legal entity that contracts with customers. */
export const LEGAL_ENTITY = 'AGI Automation LLC';

/** Entity descriptor used in contract preambles. */
export const LEGAL_ENTITY_DESCRIPTOR = 'a United States limited liability company';

/**
 * Postal address for legal notices. See the founder-confirmation note above.
 */
export const NOTICE_ADDRESS = '1309 Coffeen Avenue STE 1200, Sheridan, Wyoming 82801, USA';

/** Governing law selected by both the platform terms and the mobile terms. */
export const GOVERNING_LAW = 'the State of Texas, USA';

/** Contractual venue for disputes that leave arbitration. */
export const VENUE = 'Travis County, Texas';

/** Arbitration forum named in the terms. */
export const ARBITRATION_FORUM =
  'the American Arbitration Association under its Commercial Arbitration Rules';

/**
 * The one mailbox every policy page routes to. Subject lines are used to route
 * internally because only this address is proven in use.
 */
export const CONTACT_EMAIL = 'contact@agiworkforce.com';

/** Subject-line conventions so a single mailbox can route policy traffic. */
export const CONTACT_SUBJECTS = {
  security: 'Security',
  privacy: 'Privacy request',
  dpa: 'DPA request',
  abuse: 'Abuse report',
  appeal: 'Suspension appeal',
  arbitrationOptOut: 'Arbitration opt-out',
  ipComplaint: 'IP complaint',
} as const;

/** Build a `mailto:` link with a routing subject line. */
export function contactMailto(subject?: string): string {
  return subject
    ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${CONTACT_EMAIL}`;
}

/**
 * Per-document revision dates.
 *
 * A stale "last updated" is itself a procurement finding: it signals the terms
 * were not reviewed when the service changed. These were last revised together
 * when the policy set was completed — the AUP written, the DPA published in
 * full, the retention schedule reconciled with the jobs that actually run, and
 * the vulnerability-disclosure policy added.
 */
export const POLICY_LAST_UPDATED = {
  terms: '2026-08-11',
  privacy: '2026-08-11',
  acceptableUse: '2026-08-05',
  dpa: '2026-08-13',
  cookies: '2026-08-05',
  subprocessors: '2026-08-13',
  security: '2026-08-11',
  sla: '2026-08-05',
  refunds: '2026-08-13',
  accessibility: '2026-08-05',
  euRepresentative: '2026-08-05',
  mobile: '2026-08-13',
  copyright: '2026-08-06',
  modelLicenses: '2026-08-06',
} as const;

/**
 * Canonical route for each policy. The duplicate aliases (`/terms-of-service`,
 * `/privacy-policy`, `/cookie-policy`, `/aup`, `/acceptable-use-policy`) are
 * 308 redirects declared in `next.config.ts`, NOT separate pages — duplicate
 * legal text that drifts is a liability, not a convenience.
 */
export const CANONICAL_POLICY_ROUTES = {
  terms: '/terms',
  privacy: '/privacy',
  acceptableUse: '/acceptable-use',
  dpa: '/dpa',
  cookies: '/cookies',
  subprocessors: '/subprocessors',
  security: '/security',
  sla: '/sla',
  refunds: '/refund-policy',
  accessibility: '/accessibility',
  trust: '/trust',
  legalIndex: '/legal',
  euRepresentative: '/legal/eu-representative',
  mobile: '/mobile/legal',
  copyright: '/copyright',
  modelLicenses: '/model-licenses',
} as const;

/** Alias → canonical. Mirrored by the redirect table in `next.config.ts`. */
export const POLICY_ROUTE_ALIASES: Readonly<Record<string, string>> = {
  '/terms-of-service': '/terms',
  '/privacy-policy': '/privacy',
  '/cookie-policy': '/cookies',
  '/aup': '/acceptable-use',
  '/acceptable-use-policy': '/acceptable-use',
};

/**
 * Managed Cloud status, stated wherever it bears on a legal commitment.
 * Source: `apps/web/lib/managed-compute-gate.ts` — open by default since
 * 2026-06-27; the env var is retained only as an incident kill-switch.
 */
export const MANAGED_CLOUD_STATUS = 'public alpha';
