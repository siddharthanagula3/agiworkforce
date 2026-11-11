/* eslint-disable @typescript-eslint/no-require-imports */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { BILLING_PLAN_PRICING } from '@agiworkforce/types';
import { getAgeThreshold } from '../src/features/auth/services/ageGate';

jest.mock('@/lib/mmkv', () => ({ storage: {} }));

const appConfig = require('../app.config.js') as {
  expo: { ios?: { infoPlist?: Record<string, unknown> } };
};

const appConfigSource = readFileSync(join(__dirname, '..', 'app.config.js'), 'utf8');

const storePurchases = require('../src/features/billing/storePurchases.json') as {
  nativePurchases: boolean;
};

const listingIos = require('../store-listing/LISTING-METADATA-IOS.json') as {
  subtitle: string;
  promotional_text: string;
  keywords: string;
  description: string;
  whats_new: string;
  app_review_information: { notes_file: string };
  pricing: {
    in_app_purchases: boolean;
    in_app_purchase_note: string;
    guideline_3_1_1_residual_risk?: string;
  };
  export_compliance?: { uses_non_exempt_encryption?: boolean };
  privacy_nutrition_labels: unknown;
  age_rating: { rating: string };
};

const listingAndroid = require('../store-listing/LISTING-METADATA-ANDROID.json') as {
  short_description: string;
  full_description: string;
  release_notes_v0_0_1: string;
  pricing: { in_app_purchases: boolean };
  content_rating: { questionnaire: { in_app_purchases: boolean } };
  play_console_review_notes_file: string;
  target_audience: { age_group: string; play_age_bands: string[] };
  data_safety: { data_shared: boolean; data_collected_types: Array<{ type: string }> };
  in_app_products: { has_in_app_products: boolean; note: string };
};

const dataSafety = require('../store-listing/android/data-safety.json') as {
  collectedData: Array<{
    playDataType: string;
    sharedWithThirdParties: boolean;
    optional: boolean;
  }>;
};

const packageJson = require('../package.json') as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const repoRoot = join(__dirname, '..', '..', '..');
const mobileRoot = join(__dirname, '..');
const storeListingDir = join(mobileRoot, 'store-listing');

const HEALTH_DECLARATION =
  /NSHealth\w*UsageDescription|com\.apple\.developer\.healthkit|NSPrivacyCollectedDataType(?:Health|Fitness)|healthKitQuery|HealthKit|Health\s*&\s*Fitness|Health Records/i;

const HEALTH_INTEGRATION =
  /\bHKHealthStore\b|\bHKQuery\b|\bHKSampleType\b|react-native-health|expo-health|@kingstinct\/react-native-healthkit/;

const declaresHealth = (text: string) => HEALTH_DECLARATION.test(text);

const stripXmlComments = (xml: string) => xml.replace(/\x3c!--[\s\S]*?-->/g, '');

const SOURCE_ROOTS = [
  'app',
  'components',
  'hooks',
  'lib',
  'native',
  'services',
  'src',
  'storage',
  'stores',
];

const sourceFiles = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === '__tests__' ? [] : sourceFiles(full);
    }
    return /\.(ts|tsx|js|jsx|kt|swift|m|mm)$/.test(entry.name) ? [full] : [];
  });
};

const integratesHealth = () => {
  const manifests = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  if (Object.keys(manifests).some((name) => HEALTH_INTEGRATION.test(name))) return true;
  return SOURCE_ROOTS.flatMap((root) => sourceFiles(join(mobileRoot, root))).some((file) =>
    HEALTH_INTEGRATION.test(readFileSync(file, 'utf8')),
  );
};

type Listing = Record<string, unknown> & {
  _meta: { char_counts: Record<string, number>; char_limits: Record<string, number> };
};

const LISTING_FILES = ['LISTING-METADATA-ANDROID.json', 'LISTING-METADATA-IOS.json'];
const REVIEWER_NOTES = ['REVIEWER-NOTES-IOS.md', 'REVIEWER-NOTES-ANDROID.md'];
const CLAIM_SURFACES = [...LISTING_FILES, ...REVIEWER_NOTES];

const REGULATION = /\bDPDP\b|\bAI Act\b|\bGDPR\b|\bCCPA\b|\bSOC ?2\b|\bISO ?27001\b|\bHIPAA\b/i;
const COMPLIANCE_CLAIM = /\bcompl(?:y|ies|iant)\b|\bcertified\b/i;
const NEGATED = /\b(?:not|never|no)\b[^.]*(?:\bcompl(?:y|ies|iant)\b|\bcertified\b)/i;

const readListing = (file: string) =>
  JSON.parse(readFileSync(join(storeListingDir, file), 'utf8')) as Listing;

const stringsIn = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
};

const collapseWhitespace = (text: string) => text.replace(/\s+/g, ' ');

const surfaceText = (file: string) => {
  const raw = readFileSync(join(storeListingDir, file), 'utf8');
  return file.endsWith('.json') ? stringsIn(JSON.parse(raw)).join('\n') : raw;
};

const unqualifiedComplianceClaims = (text: string) =>
  text
    .split(/\n+|(?<=[.!?])\s+/)
    .filter(
      (sentence) =>
        REGULATION.test(sentence) && COMPLIANCE_CLAIM.test(sentence) && !NEGATED.test(sentence),
    );

describe('store listing regulatory copy', () => {
  it('claims no regulatory compliance on any submission surface', () => {
    for (const file of CLAIM_SURFACES) {
      expect([file, unqualifiedComplianceClaims(surfaceText(file))]).toEqual([file, []]);
    }
  });

  it('sends every DPDP mention to the published gap list', () => {
    for (const file of CLAIM_SURFACES) {
      const text = surfaceText(file);
      expect([file, /\bDPDP\b/i.test(text)]).toEqual([file, true]);
      expect([file, text.includes('agiworkforce.com/trust')]).toEqual([file, true]);
    }
  });

  it('detects a compliance claim wherever one is written', () => {
    expect(unqualifiedComplianceClaims("We comply with India's DPDP Act 2023.")).toHaveLength(1);
    expect(unqualifiedComplianceClaims('• DPDP Act 2023 compliant')).toHaveLength(1);
    expect(unqualifiedComplianceClaims('We do not claim to be DPDP compliant.')).toEqual([]);
  });

  it('keeps recorded char counts equal to the copy they describe', () => {
    for (const file of LISTING_FILES) {
      const listing = readListing(file);
      const { char_counts: counts, char_limits: limits } = listing._meta;
      for (const [field, declared] of Object.entries(counts)) {
        const copy = (listing[field] ?? listing[`app_${field}`]) as string;
        expect([file, field, copy.length]).toEqual([file, field, declared]);
        expect([file, field, copy.length <= limits[field]]).toEqual([file, field, true]);
      }
    }
  });
});

describe('iOS submission config', () => {
  it('answers export compliance in Info.plist', () => {
    expect(appConfig.expo.ios?.infoPlist?.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it('keeps the listing export-compliance record agreeing with Info.plist', () => {
    expect(listingIos.export_compliance?.uses_non_exempt_encryption).toBe(
      appConfig.expo.ios?.infoPlist?.ITSAppUsesNonExemptEncryption,
    );
  });

  it('points app_review_information.notes_file at a file that exists', () => {
    const notesPath = join(repoRoot, listingIos.app_review_information.notes_file);
    expect(existsSync(notesPath)).toBe(true);
  });

  it('points play_console_review_notes_file at a file that exists', () => {
    const notesPath = join(repoRoot, listingAndroid.play_console_review_notes_file);
    expect(existsSync(notesPath)).toBe(true);
  });

  it('does not reference the deleted founder submission checklist', () => {
    const serialized = JSON.stringify(listingIos);
    expect(serialized).not.toContain('FOUNDER-SUBMISSION-CHECKLIST');
  });

  it('never advertises an external checkout in either store listing', () => {
    for (const file of ['LISTING-METADATA-IOS.json', 'LISTING-METADATA-ANDROID.json']) {
      const raw = readFileSync(join(storeListingDir, file), 'utf8');
      expect(raw).not.toContain('to complete checkout');
      expect(raw).not.toContain('agiworkforce.com/pricing');
    }
  });

  it('keeps the residual Guideline 3.1.1 exposure recorded rather than silent', () => {
    const risk = listingIos.pricing.guideline_3_1_1_residual_risk;
    expect(risk).toMatch(/App Review purchase policy/);
    expect(risk).toMatch(/Contact Sales/);
    expect(risk).toMatch(/storePurchases\.json/);
    expect(risk).toMatch(/no in-app purchases/);
  });

  it('declares no in-app purchases on every listing answer, because the build sells nothing', () => {
    expect(storePurchases.nativePurchases).toBe(false);
    const availability = readFileSync(
      join(mobileRoot, 'src/features/billing/nativePurchaseAvailability.ts'),
      'utf8',
    );
    expect(availability).toContain(
      'export const NATIVE_PURCHASES_AVAILABLE: boolean = storePurchases.nativePurchases;',
    );
    expect(listingIos.pricing.in_app_purchases).toBe(false);
    expect(listingAndroid.pricing.in_app_purchases).toBe(false);
    expect(listingAndroid.in_app_products.has_in_app_products).toBe(false);
    expect(listingAndroid.content_rating.questionnaire.in_app_purchases).toBe(false);
  });

  it('offers no purchase, plan for sale or paid tier in any public listing copy', () => {
    const publicCopy: Array<[string, string]> = [
      ['iOS description', listingIos.description],
      ['iOS whats_new', listingIos.whats_new],
      ['iOS promotional_text', listingIos.promotional_text],
      ['iOS subtitle', listingIos.subtitle],
      ['iOS keywords', listingIos.keywords],
      ['Android full_description', listingAndroid.full_description],
      ['Android short_description', listingAndroid.short_description],
      ['Android release notes', listingAndroid.release_notes_v0_0_1],
    ];
    const paidTierLabels = Object.values(BILLING_PLAN_PRICING)
      .map((plan) => plan.label)
      .filter((label) => label !== 'Free');
    const OFFERS_PURCHASE =
      /purchas|\bbuy\b|\bsold\b|\bsells?\b|subscri|upgrade|top-?ups?|credits?|\bpaid\b|premium|pricing|\bprices?\b|\bplans\b|\bPro\b|[$€£₹]\s?\d/i;
    for (const [field, copy] of publicCopy) {
      const offered = copy.replace(/\bno in-app purchases\b/gi, '');
      expect([field, OFFERS_PURCHASE.exec(offered)?.[0] ?? null]).toEqual([field, null]);
      for (const label of paidTierLabels) {
        const named = new RegExp(`(?<![A-Za-z0-9])${label}(?![A-Za-z0-9])`).test(copy);
        expect([field, label, named]).toEqual([field, label, false]);
      }
    }
    for (const description of [listingIos.description, listingAndroid.full_description]) {
      expect(description).toMatch(/no in-app purchases/i);
    }
  });

  it('points the buyer at no purchase outside the app from the Billing screen', () => {
    const screen = readFileSync(
      join(mobileRoot, 'src/features/settings/cloud-billing/index.tsx'),
      'utf8',
    );
    expect(screen).not.toMatch(/bought on the web/i);
    expect(screen).not.toMatch(/managed on agiworkforce\.com/i);
    expect(screen).not.toMatch(/agiworkforce\.com\/pricing/);
  });

  it('draws the Plan screen the reviewer notes describe before any purchase or web billing link', () => {
    const screen = readFileSync(
      join(mobileRoot, 'src/features/settings/cloud-billing/index.tsx'),
      'utf8',
    );
    const branchStart = screen.indexOf('if (!NATIVE_PURCHASES_AVAILABLE) {');
    const purchaseScreen = screen.indexOf('<SettingsScreenShell title="Billing">', branchStart);
    expect(branchStart).toBeGreaterThan(-1);
    expect(purchaseScreen).toBeGreaterThan(branchStart);
    const planBranch = screen.slice(branchStart, purchaseScreen);

    for (const label of [
      'title="Plan"',
      'Current plan',
      'Managed on the web',
      'By your organization',
      'What your plan includes',
      'Usage',
      'Help with your plan',
      "'/(app)/support'",
    ]) {
      expect([label, planBranch.includes(label)]).toEqual([label, true]);
    }
    expect(planBranch).not.toMatch(
      /openExternalUrl|nativeIap\.|handleUpgrade|handleManageBilling|showSubscriptionOwnerGuard|paywallSheetRef|Upgrade|Adjust plan|Choose plan|Restore purchases|Compare plans|Contact Sales|View invoices/,
    );

    for (const file of REVIEWER_NOTES) {
      const notes = surfaceText(file);
      for (const label of [
        'Settings → Subscription',
        '**Plan**',
        'Current plan',
        'Managed on the web',
        'By your organization',
        'What your plan includes',
        'Usage',
        'Help with your plan',
      ]) {
        expect([file, label, notes.includes(label)]).toEqual([file, label, true]);
      }
    }
  });

  it('keeps the chat sheet and web billing links inert in a build without purchases', () => {
    const sheet = readFileSync(
      join(mobileRoot, 'src/features/chat/components/PaywallBottomSheet.tsx'),
      'utf8',
    );
    expect(sheet).toMatch(/const hasPrimaryAction =\s*NATIVE_PURCHASES_AVAILABLE &&/);
    expect(sheet).toMatch(/const showPlanComparison =\s*NATIVE_PURCHASES_AVAILABLE &&/);
    expect(sheet).toContain('isn’t included in your plan.');

    const service = readFileSync(
      join(mobileRoot, 'src/features/billing/mobileIapService.ts'),
      'utf8',
    );
    expect(service).toMatch(
      /export async function readStorefront\(\)[^{]*\{\s*if \(!NATIVE_PURCHASES_AVAILABLE\) return null;/,
    );
    expect(service).toMatch(/if \(!NATIVE_PURCHASES_AVAILABLE\) throw new Error\(/);

    const webLinks = readFileSync(
      join(mobileRoot, 'src/features/billing/webBillingLinks.ts'),
      'utf8',
    );
    expect(webLinks).toContain('readStorefront().then(');
    expect(webLinks).toMatch(/storefront !== null &&/);

    const workspace = readFileSync(join(mobileRoot, 'app/(app)/settings/workspace.tsx'), 'utf8');
    expect(workspace).toContain('useWebBillingLinksAllowed()');
    expect(workspace.match(/openExternalUrl\(WEB_TEAM_URL\)/g)?.length).toBe(
      workspace.match(/\{webLinksAllowed \? \(/g)?.length,
    );
  });

  it('states the no-purchase facts of the binary on every claim surface', () => {
    const NO_PURCHASE_DISCLOSURE = [
      /storePurchases\.json/,
      /\bexpo-iap\b/,
      /still linked/,
      /nothing calls it/,
      /\bMOBILE_IAP_ENABLED\b/,
      /mobile-iap-catalog\.ts/,
    ];
    for (const file of CLAIM_SURFACES) {
      const text = collapseWhitespace(surfaceText(file));
      for (const pattern of NO_PURCHASE_DISCLOSURE) {
        expect([file, String(pattern), pattern.test(text)]).toEqual([file, String(pattern), true]);
      }
    }
    const storeConnection: Record<string, RegExp> = {
      'LISTING-METADATA-IOS.json': /never opens a StoreKit connection/,
      'REVIEWER-NOTES-IOS.md': /never opens a StoreKit connection/,
      'LISTING-METADATA-ANDROID.json': /never opens a Play Billing connection/,
      'REVIEWER-NOTES-ANDROID.md': /never opens a Play Billing connection/,
    };
    for (const [file, pattern] of Object.entries(storeConnection)) {
      expect([file, pattern.test(collapseWhitespace(surfaceText(file)))]).toEqual([file, true]);
    }
    for (const file of ['LISTING-METADATA-ANDROID.json', 'REVIEWER-NOTES-ANDROID.md']) {
      expect([file, surfaceText(file).includes('com.android.vending.BILLING')]).toEqual([
        file,
        true,
      ]);
    }
    expect(appConfigSource).toContain(
      "...(nativePurchases ? [] : ['com.android.vending.BILLING']),",
    );
  });

  it('makes no claim that the app sells, restores or prices a plan on any claim surface', () => {
    const SALES_CLAIM =
      /sells (?:four|auto-renewing|subscriptions)|are sold (?:only )?(?:through|as)|How to buy|Restore purchases\*\* is always|App Store's own localized prices|Play's own localized price|Credit top-ups need/i;
    for (const file of CLAIM_SURFACES) {
      expect([file, SALES_CLAIM.exec(surfaceText(file))?.[0] ?? null]).toEqual([file, null]);
    }
  });

  it('discloses account and billing links in the current app', () => {
    const CALL_SITES: Array<[string, RegExp]> = [
      ['cloud-billing purchase screen', /src\/features\/settings\/cloud-billing\/index\.tsx/],
      ['paywall contact sales', /PaywallBottomSheet\.tsx/],
      ['web billing link gate', /webBillingLinks\.ts/],
      ['cloud-account change email', /cloud-account\/index\.tsx/],
      ['workspace web links', /app\/\(app\)\/settings\/workspace\.tsx/],
      ['auth legal links', /app\/\(auth\)\/login\.tsx/],
      ['signup legal links', /MobileSignUp\.tsx/],
    ];
    for (const file of REVIEWER_NOTES) {
      const text = surfaceText(file);
      for (const [label, pattern] of CALL_SITES) {
        expect([file, label, pattern.test(text)]).toEqual([file, label, true]);
      }
      expect([
        file,
        /No link in the app opens a page about pricing, billing/.test(collapseWhitespace(text)),
      ]).toEqual([file, true]);
    }
    expect(listingIos.pricing.guideline_3_1_1_residual_risk).not.toMatch(
      /cloud-usage\/index\.tsx:131/,
    );
    expect(listingIos.pricing.guideline_3_1_1_residual_risk).toMatch(/workspace administration/);
  });

  it('names every production openExternalUrl owner in both platform review notes', () => {
    const owners = SOURCE_ROOTS.flatMap((root) => sourceFiles(join(mobileRoot, root)))
      .filter((file) => file !== join(mobileRoot, 'lib', 'safeOpenURL.ts'))
      .filter((file) => /\bopenExternalUrl\s*\(/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(mobileRoot, file).split(sep).join('/'));

    expect(owners.length).toBeGreaterThan(0);
    for (const file of REVIEWER_NOTES) {
      const notes = surfaceText(file);
      for (const owner of owners) {
        expect([file, owner, notes.includes(owner)]).toEqual([file, owner, true]);
      }
    }
  });
});

describe('Play data safety declarations', () => {
  it('answers the sharing question the same way in both Android files', () => {
    const listedShared = new Map(
      (
        listingAndroid.data_safety.data_collected_types as Array<{ type: string; shared?: boolean }>
      ).map((entry) => [entry.type, entry.shared === true]),
    );
    for (const entry of dataSafety.collectedData) {
      expect([entry.playDataType, entry.sharedWithThirdParties]).toEqual([
        entry.playDataType,
        listedShared.get(entry.playDataType),
      ]);
    }
    expect(listingAndroid.data_safety.data_shared).toBe(
      dataSafety.collectedData.some((entry) => entry.sharedWithThirdParties),
    );
  });

  it('declares the same data types in both Android files', () => {
    const inListing = listingAndroid.data_safety.data_collected_types
      .map((entry) => entry.type)
      .sort();
    const inForm = dataSafety.collectedData.map((entry) => entry.playDataType).sort();
    expect(inForm).toEqual(inListing);
  });

  it('marks collection optional in both files, because cloud sign-in is optional', () => {
    for (const entry of dataSafety.collectedData) {
      expect([entry.playDataType, entry.optional]).toEqual([entry.playDataType, true]);
    }
    for (const entry of listingAndroid.data_safety.data_collected_types as Array<{
      type: string;
      optional?: boolean;
    }>) {
      expect([entry.type, entry.optional]).toEqual([entry.type, true]);
    }
  });

  it('rates both stores at the lowest age the shipped age gate admits', () => {
    const ageGate = readFileSync(join(mobileRoot, 'src/features/auth/services/ageGate.ts'), 'utf8');
    const fallback = /DEFAULT_RULE:\s*RegionAgeRule\s*=\s*\{[^}]*threshold:\s*(\d+)/.exec(ageGate);
    const regionalAges = [...ageGate.matchAll(/threshold:\s*(\d+)/g)].map(([, age]) => Number(age));
    expect(fallback).not.toBeNull();
    expect(Number(fallback![1])).toBe(Math.min(...regionalAges));

    const resolvedOptions = jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ timeZone: 'Etc/UTC' } as Intl.ResolvedDateTimeFormatOptions);
    const lowestAdmittedAge = getAgeThreshold();
    resolvedOptions.mockRestore();

    expect(listingIos.age_rating.rating).toBe(`${lowestAdmittedAge}+`);
    expect(listingAndroid.target_audience.age_group).toBe(`${lowestAdmittedAge}+`);
    expect(Number.parseInt(listingAndroid.target_audience.play_age_bands[0] ?? '', 10)).toBe(
      lowestAdmittedAge,
    );
  });

  it('carries no HealthKit claims in the privacy manifest', () => {
    const manifest = readFileSync(join(storeListingDir, 'ios', 'PrivacyInfo.xcprivacy'), 'utf8');
    expect(manifest).not.toContain('OPEN GAP');
    expect(manifest).not.toMatch(/NSHealthShareUsageDescription|healthKitQuery/);
  });

  it('detects a health declaration wherever one is written', () => {
    expect(
      declaresHealth(
        JSON.stringify({ infoPlist: { NSHealthShareUsageDescription: 'read steps' } }),
      ),
    ).toBe(true);
    expect(
      declaresHealth(JSON.stringify({ entitlements: { 'com.apple.developer.healthkit': true } })),
    ).toBe(true);
    expect(
      declaresHealth(JSON.stringify({ data_linked_to_you: [{ category: 'Health & Fitness' }] })),
    ).toBe(true);
    expect(declaresHealth(JSON.stringify(appConfig.expo.ios))).toBe(false);
  });

  it('declares health data on every submission surface only when the app integrates HealthKit', () => {
    const surfaces = {
      'app.config.js ios': JSON.stringify(appConfig.expo.ios),
      'PrivacyInfo.xcprivacy': stripXmlComments(
        readFileSync(join(storeListingDir, 'ios', 'PrivacyInfo.xcprivacy'), 'utf8'),
      ),
      'LISTING-METADATA-IOS.json privacy_nutrition_labels': JSON.stringify(
        listingIos.privacy_nutrition_labels,
      ),
    };

    const expected = integratesHealth();
    for (const [surface, text] of Object.entries(surfaces)) {
      expect([surface, declaresHealth(text)]).toEqual([surface, expected]);
    }
  });
});
