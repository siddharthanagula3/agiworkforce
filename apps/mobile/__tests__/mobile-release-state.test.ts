/**
 * mobile-release-state.test.ts — CRIT-007
 *
 * The mobile app used to assert its own distribution facts: `subscriptionSource`
 * named "the Apple App Store" and handed out `apps.apple.com` links for an app
 * with zero `v-mobile-*` release tags and no listing on either store.
 *
 * `lib/mobileReleaseState.json` is now the only record of that fact and
 * `lib/releaseState.ts` the only reader. This suite is the contract on both:
 *
 *   1. the registry may not claim more than the repository can prove (release
 *      tags, and the ids the app actually builds as);
 *   2. it may not disagree with the website's registry
 *      (`SURFACE_STATUS.mobile` in `apps/web/lib/marketing-constants.ts`), so
 *      the two surfaces cannot describe mobile's availability differently;
 *   3. the accessors fail closed — a status flipped without the verified
 *      listing id still surfaces no name, no link, nothing.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MOBILE_RELEASE_STATE,
  MOBILE_STORE_IDS,
  getStoreDistribution,
  isStoreDistributionVerified,
  isStorePublished,
  storeDisplayName,
  storeDisplayNameOf,
  storeListingUrl,
  storeListingUrlOf,
  storeSubscriptionManagementUrl,
  storeSubscriptionManagementUrlOf,
  type StoreDistributionRecord,
} from '@/lib/releaseState';

const mobileRoot = join(__dirname, '..');
const repoRoot = join(mobileRoot, '..', '..');

/** Release tags are the evidence a surface has shipped, per the web registry. */
function mobileReleaseTags(): string[] {
  const stdout = execFileSync('git', ['tag', '--list', 'v-mobile-*'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return stdout.split('\n').filter((line) => line.trim().length > 0);
}

const webMarketingConstants = readFileSync(
  join(repoRoot, 'apps', 'web', 'lib', 'marketing-constants.ts'),
  'utf8',
);

function webComingSoonLabel(): string {
  const match = webMarketingConstants.match(/export const COMING_SOON_LABEL = '([^']+)'/);
  if (!match?.[1]) throw new Error('apps/web/lib/marketing-constants.ts has no COMING_SOON_LABEL');
  return match[1];
}

function webMobileStatus(): string {
  const surfaceStatus = webMarketingConstants.match(
    /export const SURFACE_STATUS = \{([\s\S]*?)\} as const;/,
  )?.[1];
  if (!surfaceStatus) throw new Error('apps/web/lib/marketing-constants.ts has no SURFACE_STATUS');
  const mobile = surfaceStatus.match(/\bmobile:\s*([^,\n]+)/)?.[1]?.trim();
  if (!mobile) throw new Error('SURFACE_STATUS has no mobile entry');
  return mobile === 'COMING_SOON_LABEL' ? webComingSoonLabel() : mobile.replace(/^'|'$/g, '');
}

function publishedRecord(
  overrides: Partial<StoreDistributionRecord> = {},
): StoreDistributionRecord {
  return {
    store: 'apple',
    status: 'published',
    productionId: 'com.agiworkforce.app',
    listingId: '1234567890',
    listingUrl: 'https://apps.apple.com/us/app/agi/id1234567890',
    subscriptionManagementUrl: 'https://apps.apple.com/account/subscriptions',
    evidence: 'synthetic record for the published branch',
    ...overrides,
  };
}

describe('mobile release-state registry', () => {
  it('does not claim a release the repository has no tag for', () => {
    const tags = mobileReleaseTags();
    expect({ tags, released: MOBILE_RELEASE_STATE.released }).toMatchObject({
      released: tags.length > 0,
    });
  });

  it('states the same availability the website states', () => {
    // Website registry -> mobile registry. If /download and /mobile say "Coming
    // soon", the app may not behave as though it is installable, and vice versa.
    const websiteSaysUnreleased = webMobileStatus() === webComingSoonLabel();
    expect({
      website: webMobileStatus(),
      mobileReleased: MOBILE_RELEASE_STATE.released,
    }).toMatchObject({ mobileReleased: !websiteSaysUnreleased });
    expect(MOBILE_RELEASE_STATE.statusLabel).toBe(webComingSoonLabel());
  });

  it('records the ids the app actually builds as', () => {
    // app.config.js is CommonJS and evaluated for its side-effect-free export;
    // the same require is used by __tests__/ios-store-submission-config.test.ts.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appConfig = require('../app.config.js') as {
      expo: { ios?: { bundleIdentifier?: string }; android?: { package?: string } };
    };
    expect(getStoreDistribution('apple').productionId).toBe(appConfig.expo.ios?.bundleIdentifier);
    expect(getStoreDistribution('google').productionId).toBe(appConfig.expo.android?.package);
  });

  it.each(MOBILE_STORE_IDS)('exposes no store surface for %s while it is unpublished', (store) => {
    const record = getStoreDistribution(store);
    // Guard the guard: if a store is ever legitimately published this case must
    // stop asserting absence rather than silently pass on a stale expectation.
    expect(record.status).toBe('unpublished');
    expect(record.listingId).toBeNull();
    expect(record.listingUrl).toBeNull();
    expect(record.subscriptionManagementUrl).toBeNull();
    expect(isStorePublished(store)).toBe(false);
    expect(storeDisplayName(store)).toBeNull();
    expect(storeListingUrl(store)).toBeNull();
    expect(storeSubscriptionManagementUrl(store)).toBeNull();
    expect(record.evidence.length).toBeGreaterThan(0);
  });
});

describe('release-state accessors fail closed', () => {
  it('treats a published status without a verified listing id as unpublished', () => {
    const optimistic = publishedRecord({ listingId: null });
    expect(isStoreDistributionVerified(optimistic)).toBe(false);
    expect(storeDisplayNameOf(optimistic)).toBeNull();
    expect(storeListingUrlOf(optimistic)).toBeNull();
    expect(storeSubscriptionManagementUrlOf(optimistic)).toBeNull();
  });

  it('refuses a listing URL that does not name the verified listing', () => {
    expect(
      storeListingUrlOf(publishedRecord({ listingUrl: 'https://apps.apple.com/us/app/id999' })),
    ).toBeNull();
    expect(
      storeListingUrlOf(publishedRecord({ listingUrl: 'http://apps.apple.com/id1234567890' })),
    ).toBeNull();
  });

  it('serves the store name and URLs once the listing is verified', () => {
    const verified = publishedRecord();
    expect(isStoreDistributionVerified(verified)).toBe(true);
    expect(storeDisplayNameOf(verified)).toBe('the Apple App Store');
    expect(storeListingUrlOf(verified)).toBe('https://apps.apple.com/us/app/agi/id1234567890');
    expect(storeSubscriptionManagementUrlOf(verified)).toBe(
      'https://apps.apple.com/account/subscriptions',
    );
    expect(storeDisplayNameOf(publishedRecord({ store: 'google' }))).toBe('Google Play');
  });
});
