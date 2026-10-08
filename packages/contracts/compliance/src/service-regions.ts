/**
 * @file Where AGI Workforce is not offered, read by the web proxy that refuses
 * those requests and by the page that publishes the list, so the two cannot
 * disagree.
 *
 * The rule is the owner's: copy where ChatGPT and Claude offer their services,
 * and where they differ the stricter wins, plus every place under a
 * comprehensive United States embargo. A place is listed when either company
 * leaves it off its published list or OFAC embargoes it. A territory or
 * dependency of a country both companies serve is served, as Claude's list says
 * outright, even where ChatGPT's list does not name it; a territory whose
 * sovereign is itself unserved, or whose status is disputed with no served
 * sovereign, stays listed.
 *
 * Re-derive from the sources below rather than editing one entry by memory;
 * docs/compliance/global-distribution.md records how the last derivation ran.
 */

export type UnservedReason = 'us-sanctions' | 'not-on-claude-list' | 'not-on-chatgpt-list';

export interface ServiceRegionSource {
  readonly id: UnservedReason;
  readonly publisher: string;
  readonly url: string;
  readonly checked: string;
}

export const SERVICE_REGION_SOURCES: readonly ServiceRegionSource[] = [
  {
    id: 'us-sanctions',
    publisher: 'US Treasury, Office of Foreign Assets Control',
    url: 'https://ofac.treasury.gov/sanctions-programs-and-country-information',
    checked: '2026-10-08',
  },
  {
    id: 'not-on-claude-list',
    publisher: 'Anthropic, supported countries and regions',
    url: 'https://www.anthropic.com/supported-countries',
    checked: '2026-10-08',
  },
  {
    id: 'not-on-chatgpt-list',
    publisher: 'OpenAI, supported countries and territories',
    url: 'https://help.openai.com/en/articles/7947663-chatgpt-supported-countries',
    checked: '2026-10-08',
  },
];

export interface UnservedCountry {
  readonly code: string;
  readonly name: string;
  readonly reasons: readonly UnservedReason[];
}

export interface UnservedSubdivision {
  readonly country: string;
  readonly subdivision: string;
  readonly name: string;
  readonly reasons: readonly UnservedReason[];
}

const SANCTIONED_AND_UNLISTED: readonly UnservedReason[] = [
  'us-sanctions',
  'not-on-claude-list',
  'not-on-chatgpt-list',
];
const UNLISTED_BY_BOTH: readonly UnservedReason[] = ['not-on-claude-list', 'not-on-chatgpt-list'];
const UNLISTED_BY_CLAUDE: readonly UnservedReason[] = ['not-on-claude-list'];

export const UNSERVED_COUNTRIES: readonly UnservedCountry[] = [
  { code: 'CU', name: 'Cuba', reasons: SANCTIONED_AND_UNLISTED },
  { code: 'IR', name: 'Iran', reasons: SANCTIONED_AND_UNLISTED },
  { code: 'KP', name: 'North Korea', reasons: SANCTIONED_AND_UNLISTED },
  { code: 'AQ', name: 'Antarctica', reasons: UNLISTED_BY_BOTH },
  { code: 'BY', name: 'Belarus', reasons: UNLISTED_BY_BOTH },
  { code: 'CN', name: 'China', reasons: UNLISTED_BY_BOTH },
  { code: 'EH', name: 'Western Sahara', reasons: UNLISTED_BY_BOTH },
  { code: 'HK', name: 'Hong Kong', reasons: UNLISTED_BY_BOTH },
  { code: 'MO', name: 'Macao', reasons: UNLISTED_BY_BOTH },
  { code: 'RU', name: 'Russia', reasons: UNLISTED_BY_BOTH },
  { code: 'SY', name: 'Syria', reasons: UNLISTED_BY_BOTH },
  { code: 'VE', name: 'Venezuela', reasons: UNLISTED_BY_BOTH },
  { code: 'XK', name: 'Kosovo', reasons: UNLISTED_BY_BOTH },
  { code: 'AF', name: 'Afghanistan', reasons: UNLISTED_BY_CLAUDE },
  { code: 'MM', name: 'Myanmar', reasons: UNLISTED_BY_CLAUDE },
  { code: 'YE', name: 'Yemen', reasons: UNLISTED_BY_CLAUDE },
];

// Subdivision codes are the region part of ISO 3166-2, the form Vercel's
// x-vercel-ip-country-region header carries. Claude excludes these five
// regions of Ukraine by name; ChatGPT says only "with certain exceptions".
export const UNSERVED_SUBDIVISIONS: readonly UnservedSubdivision[] = [
  {
    country: 'UA',
    subdivision: '43',
    name: 'Crimea (Ukraine)',
    reasons: ['us-sanctions', 'not-on-claude-list'],
  },
  {
    country: 'UA',
    subdivision: '40',
    name: 'Sevastopol (Ukraine)',
    reasons: ['us-sanctions', 'not-on-claude-list'],
  },
  {
    country: 'UA',
    subdivision: '14',
    name: 'Donetsk region (Ukraine)',
    reasons: ['us-sanctions', 'not-on-claude-list'],
  },
  {
    country: 'UA',
    subdivision: '09',
    name: 'Luhansk region (Ukraine)',
    reasons: ['us-sanctions', 'not-on-claude-list'],
  },
  {
    country: 'UA',
    subdivision: '65',
    name: 'Kherson region (Ukraine)',
    reasons: ['not-on-claude-list'],
  },
  {
    country: 'UA',
    subdivision: '23',
    name: 'Zaporizhzhia region (Ukraine)',
    reasons: ['not-on-claude-list'],
  },
];

export type ServiceRegionDecision = { served: true } | { served: false; place: string };

const UNSERVED_COUNTRY_CODES: ReadonlySet<string> = new Set(
  UNSERVED_COUNTRIES.map((country) => country.code),
);
const UNSERVED_SUBDIVISION_KEYS: ReadonlySet<string> = new Set(
  UNSERVED_SUBDIVISIONS.map((entry) => `${entry.country}-${entry.subdivision}`),
);

function normalise(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? '';
}

/**
 * An absent or unreadable country is served: the header is missing off Vercel,
 * and refusing a request whose place is unknown would refuse people the lists
 * do not name.
 */
export function decideServiceRegion(
  country: string | null | undefined,
  subdivision?: string | null,
): ServiceRegionDecision {
  const code = normalise(country);
  if (!code) return { served: true };
  if (UNSERVED_COUNTRY_CODES.has(code)) return { served: false, place: code };
  const region = normalise(subdivision);
  if (!region) return { served: true };
  const key = `${code}-${region}`;
  return UNSERVED_SUBDIVISION_KEYS.has(key) ? { served: false, place: key } : { served: true };
}

export function isUnderUsSanctions(entry: {
  readonly reasons: readonly UnservedReason[];
}): boolean {
  return entry.reasons.includes('us-sanctions');
}
