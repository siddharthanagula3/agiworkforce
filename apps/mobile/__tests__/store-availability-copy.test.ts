/**
 * store-availability-copy.test.ts — CRIT-007
 *
 * NO FALSE CAPABILITY, applied to distribution: while the release-state
 * registry says a store has no verified listing, no shipped mobile source file
 * may state or imply that the app can be installed from it, link to a listing,
 * or quote a store rating.
 *
 * This is GATED on `lib/mobileReleaseState.json`, not on wording. The day AGI
 * actually ships on a store, that store's record flips to `published` with the
 * verified listing id, this suite stops policing its phrasing, and the screens
 * are free to advertise the real listing — which is the outcome we want. What
 * it must never allow back is the state the app was in before: a billing alert
 * telling the user "You purchased this subscription through the Apple App
 * Store" and offering a store link, for an app that has never had a listing.
 *
 * Store-*policy* prose ("Google Play GenAI policy", "App Store Guideline
 * 3.1.1") is not an availability claim and stays legal — the patterns below
 * match claims of availability, install links, and ratings only.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

import { MOBILE_STORE_IDS, isStorePublished, type MobileStoreId } from '@/lib/releaseState';

const mobileRoot = join(__dirname, '..');

/** Directories whose contents can reach a user's screen. */
const SHIPPED_DIRS = ['app', 'components', 'hooks', 'lib', 'services', 'src', 'stores'];

const SKIP_DIR_NAMES = new Set(['__tests__', '__mocks__', 'node_modules', '.expo']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

/**
 * Generated third-party attribution (`licenses.generated.ts`) is verbatim OSS
 * license text, not product copy, and is regenerated from the dependency graph
 * by `scripts/generate-oss-licenses.mjs`.
 */
const SKIP_FILE_SUFFIXES = ['.generated.ts'];

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (entry.includes('.test.') || entry.includes('.spec.')) continue;
    if (SKIP_FILE_SUFFIXES.some((suffix) => entry.endsWith(suffix))) continue;
    if (SOURCE_EXTENSIONS.has(extname(entry))) out.push(full);
  }
  return out;
}

const shippedSources = SHIPPED_DIRS.flatMap((dir) => collectSourceFiles(join(mobileRoot, dir)));

/** Claims that are false for every store while none is published. */
const UNIVERSAL_CLAIM_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'store badge / install CTA', pattern: /download on the app store/i },
  { label: 'store badge / install CTA', pattern: /get it on google play/i },
  { label: 'availability claim', pattern: /available (?:now )?(?:on|in) the app store/i },
  { label: 'availability claim', pattern: /available (?:now )?on google play/i },
  { label: 'star rating claim', pattern: /\b[0-5](?:\.\d)?\s*(?:★|stars?\b)/i },
  { label: 'rating claim', pattern: /\brated\s+[0-5](?:\.\d)?\b/i },
  { label: 'review-count claim', pattern: /\b\d[\d,]*\+?\s*(?:ratings|reviews)\b/i },
];

/** Per-store install links and store attributions. */
const STORE_CLAIM_PATTERNS: Readonly<Record<MobileStoreId, ReadonlyArray<RegExp>>> = {
  // `apps.apple.com/account/subscriptions` is a store surface too: it is only
  // reachable for an app the store distributes.
  apple: [/apps\.apple\.com/i, /'the Apple App Store'/],
  google: [/play\.google\.com/i, /'Google Play'/],
};

/**
 * The only two files allowed to contain a store host or store name, and why.
 * The list is asserted below so a third file cannot join it quietly — that is
 * the whole point: every other module has to ask the registry.
 *
 *   lib/releaseState.ts — the registry reader. It holds the display names and
 *     returns them ONLY through `isStoreDistributionVerified`, which is null
 *     for every store today (see mobile-release-state.test.ts).
 *   lib/safeOpenURL.ts — the outbound-URL allowlist. Listing a host there
 *     permits nothing on its own; it only refuses everything else. Removing the
 *     hosts would not remove a claim, it would remove a security control.
 */
const REGISTRY_OWNED_FILES = ['lib/releaseState.ts', 'lib/safeOpenURL.ts'] as const;

function isRegistryOwned(relativePath: string): boolean {
  return (REGISTRY_OWNED_FILES as readonly string[]).includes(relativePath.split('\\').join('/'));
}

describe('mobile makes no store claim the release-state registry cannot back', () => {
  it('scans the shipped mobile source tree', () => {
    expect(shippedSources.length).toBeGreaterThan(200);
    expect(
      shippedSources.some((file) => file.endsWith(join('billing', 'subscriptionSource.ts'))),
    ).toBe(true);
  });

  it.each(UNIVERSAL_CLAIM_PATTERNS)(
    'no shipped file carries a $label ($pattern)',
    ({ pattern }) => {
      const offenders = shippedSources
        .filter((file) => pattern.test(readFileSync(file, 'utf8')))
        .map((file) => relative(mobileRoot, file));
      expect(offenders).toEqual([]);
    },
  );

  it.each(MOBILE_STORE_IDS)(
    'no shipped file outside the registry links to or names %s',
    (store) => {
      if (isStorePublished(store)) {
        // Published with a verified listing: naming it and linking to it is true.
        return;
      }
      const offenders: string[] = [];
      for (const file of shippedSources) {
        const relativePath = relative(mobileRoot, file);
        if (isRegistryOwned(relativePath)) continue;
        const source = readFileSync(file, 'utf8');
        for (const pattern of STORE_CLAIM_PATTERNS[store]) {
          if (pattern.test(source)) offenders.push(`${relativePath} :: ${pattern}`);
        }
      }
      expect(offenders).toEqual([]);
    },
  );

  it('keeps the exemption list to the registry reader and the URL allowlist', () => {
    // If a file stops mentioning a store it must leave this list, so the list
    // can never become a place to park a new claim.
    const stillMentionsAStore = REGISTRY_OWNED_FILES.filter((relativePath) => {
      const source = readFileSync(join(mobileRoot, relativePath), 'utf8');
      return MOBILE_STORE_IDS.some((store) =>
        STORE_CLAIM_PATTERNS[store].some((pattern) => pattern.test(source)),
      );
    });
    expect(stillMentionsAStore).toEqual([...REGISTRY_OWNED_FILES]);
  });
});
