/* eslint-disable @typescript-eslint/no-require-imports */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { ACCOUNT_MINIMUM_AGE, BILLING_PLAN_PRICING } from '@agiworkforce/types';
import { getAgeThreshold } from '../src/features/auth/services/ageGate';
import { FEATURES } from '../lib/v1FeatureFlags';

jest.mock('@/lib/mmkv', () => ({ storage: {} }));

const appConfig = require('../app.config.js') as {
  expo: { icon?: string; ios?: { infoPlist?: Record<string, unknown> } };
};

const PNG_COLOR_TYPE_RGB = 2;

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
  sharingBasis: string;
  collectedData: Array<{
    iosPrivacyManifestType: string;
    playCategory: string;
    playDataType: string;
    sharedWithThirdParties: boolean;
    purposes: string[];
    optional: boolean;
    ephemeral: boolean;
    backedBy: string;
  }>;
};

const SENT_BY_SDKS_WITHOUT_SIGN_IN = ['Device or other IDs', 'Diagnostics', 'Crash logs'];

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

  it('ships a square 1024 app icon with no transparency, which Apple refuses in an icon', () => {
    const png = readFileSync(join(__dirname, '..', appConfig.expo.icon ?? ''));
    const chunkTypes: string[] = [];
    for (let offset = 8; offset < png.length; offset += 12 + png.readUInt32BE(offset)) {
      chunkTypes.push(png.subarray(offset + 4, offset + 8).toString('ascii'));
    }
    const colorType = png.readUInt8(25);

    expect(chunkTypes[0]).toBe('IHDR');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1024, 1024]);
    expect(colorType).toBe(PNG_COLOR_TYPE_RGB);
    expect(chunkTypes).not.toContain('tRNS');
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
    const subscriptionShell = '<SettingsScreenShell title={SUBSCRIPTION_SCREEN_TITLE}>';
    const planScreen = screen.indexOf(subscriptionShell, branchStart);
    const purchaseScreen = screen.indexOf(subscriptionShell, planScreen + 1);
    expect(branchStart).toBeGreaterThan(-1);
    expect(planScreen).toBeGreaterThan(branchStart);
    expect(purchaseScreen).toBeGreaterThan(planScreen);
    const planBranch = screen.slice(branchStart, purchaseScreen);

    for (const label of [
      'title={SUBSCRIPTION_SCREEN_TITLE}',
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
        '**Subscription**',
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

  it('marks optional exactly the types that only a Cloud sign-in or a chosen feature sends', () => {
    for (const entry of dataSafety.collectedData) {
      const sentWithoutSignIn = SENT_BY_SDKS_WITHOUT_SIGN_IN.includes(entry.playDataType);
      expect([entry.playDataType, entry.optional]).toEqual([
        entry.playDataType,
        !sentWithoutSignIn,
      ]);
    }
    for (const entry of listingAndroid.data_safety.data_collected_types as Array<{
      type: string;
      optional?: boolean;
    }>) {
      expect([entry.type, entry.optional]).toEqual([
        entry.type,
        !SENT_BY_SDKS_WITHOUT_SIGN_IN.includes(entry.type),
      ]);
    }
    const labels = listingIos.privacy_nutrition_labels as Record<
      string,
      Array<{ data_types: string[]; optional: boolean; collected_when: string }>
    >;
    for (const row of [...labels.data_linked_to_you!, ...labels.data_not_linked_to_you!]) {
      expect([row.data_types, row.optional]).toEqual([
        row.data_types,
        !/every launch/.test(row.collected_when),
      ]);
    }
  });

  it('counts a Local Mode content report among the messages the app uploads', () => {
    const egressGuard = readFileSync(join(mobileRoot, 'lib/egressGuard.ts'), 'utf8');
    expect(egressGuard).toMatch(/opts\?\.consentedReport && isConsentedReportRequest/);
    const labels = listingIos.privacy_nutrition_labels as {
      data_linked_to_you: Array<{ data_types: string[]; collected_when: string }>;
    };
    const messageTexts = [
      dataSafety.collectedData.find((entry) => entry.playDataType === 'Other in-app messages')
        ?.backedBy,
      (
        listingAndroid.data_safety.data_collected_types as Array<{
          type: string;
          collected_when?: string;
        }>
      ).find((entry) => entry.type === 'Other in-app messages')?.collected_when,
      labels.data_linked_to_you.find((row) => row.data_types.includes('Other User Content'))
        ?.collected_when,
    ];
    for (const text of messageTexts) {
      expect(text).toMatch(/In Local Mode, only a content report the person chooses to send/);
      expect(text).not.toMatch(/^Only in AGI Cloud/);
    }
  });

  it('declares every type the code sends off the device, SDKs included', () => {
    const declared = new Map(dataSafety.collectedData.map((entry) => [entry.playDataType, entry]));
    for (const type of [
      'Calendar events',
      'In-app search history',
      'Diagnostics',
      'Crash logs',
      'Device or other IDs',
    ]) {
      expect([type, declared.has(type)]).toEqual([type, true]);
    }

    const calendarStep = readFileSync(
      join(mobileRoot, 'src/features/integrations/services/phoneDeviceSteps.ts'),
      'utf8',
    );
    expect(calendarStep).toMatch(/notes: event\.notes\.slice/);
    expect(declared.get('Calendar events')?.sharedWithThirdParties).toBe(true);

    const search = readFileSync(join(mobileRoot, 'stores/chat/chatViewStore.ts'), 'utf8');
    expect(search).toContain('/api/search?q=');
    expect(declared.get('In-app search history')?.ephemeral).toBe(false);

    for (const plugin of ['withAGIVisionOCR.cjs', 'withAGITranslate.cjs', 'withAGIAICore.cjs']) {
      expect(readFileSync(join(mobileRoot, 'native/android', plugin), 'utf8')).toMatch(
        /com\.google\.mlkit:/,
      );
    }
    expect(declared.get('Diagnostics')?.purposes).toEqual(['App functionality', 'Analytics']);
    expect(declared.get('Device or other IDs')?.purposes).toEqual([
      'App functionality',
      'Analytics',
    ]);
    expect(dataSafety.sharingBasis).toMatch(/ML Kit/);

    expect(appConfigSource).toContain("'expo-updates'");
    expect(appConfigSource).not.toMatch(/checkAutomatically/);
    expect(declared.get('Crash logs')?.backedBy).toMatch(/expo-updates/);
    expect(declared.get('Device or other IDs')?.backedBy).toMatch(/expo-updates/);
  });

  it('describes live voice the way the app’s own Privacy screen does, and keeps it stored', () => {
    const privacyScreen = readFileSync(
      join(mobileRoot, 'src/features/settings/cloud-privacy/DataUseScreen.tsx'),
      'utf8',
    );
    expect(privacyScreen).toContain('your audio streams directly between this device and');
    const voice = dataSafety.collectedData.find(
      (entry) => entry.playDataType === 'Voice or sound recordings',
    );
    expect(voice?.ephemeral).toBe(false);
    expect(voice?.backedBy).toMatch(/directly between the device and the voice provider/);
  });

  it('gives one sharing answer for the model providers on every surface', () => {
    const androidNote = String((listingAndroid.data_safety as { note?: string }).note ?? '');
    for (const text of [
      androidNote,
      dataSafety.sharingBasis,
      surfaceText('REVIEWER-NOTES-ANDROID.md'),
    ]) {
      expect(collapseWhitespace(text)).toMatch(/service-provider exception/);
      expect(collapseWhitespace(text)).not.toMatch(/answered false on the service-provider basis/);
    }
  });
});

describe('statements the build does not support', () => {
  const FALSE_CLAIMS: RegExp[] = [
    /uploads nothing/i,
    /collects no personal data/i,
    /Local Mode collects nothing/i,
    /No third party receives data directly/i,
    /Every outbound request from the device goes to an AGI-controlled host/i,
    /streams the microphone to AGI Cloud/i,
    /All cryptography is Apple/i,
    /no proprietary or bundled third-party cipher/i,
    /Created only when push is enabled/i,
    /Only after the user enables push notifications/i,
    /cloud-job completion/i,
    /model-download, reminder/i,
    /Paste the body of this file/i,
  ];

  it('makes none of the claims the code contradicts on any submission surface', () => {
    const surfaces = [...CLAIM_SURFACES, 'android/data-safety.json', 'ios/PrivacyInfo.xcprivacy'];
    for (const file of surfaces) {
      const text = collapseWhitespace(surfaceText(file));
      for (const claim of FALSE_CLAIMS) {
        expect([file, claim.exec(text)?.[0] ?? null]).toEqual([file, null]);
      }
    }
  });

  it('states the cryptography the binary carries beside the operating system’s', () => {
    const mmkv = readFileSync(join(mobileRoot, 'lib/mmkv.ts'), 'utf8');
    expect(mmkv).toMatch(/new MMKV\(\{[^}]*encryptionKey/);
    expect(
      existsSync(
        join(
          dirname(require.resolve('react-native-mmkv/package.json')),
          'MMKV/Core/aes/openssl/openssl_aes_core.cpp',
        ),
      ),
    ).toBe(true);
    const basis = String(
      (listingIos as { export_compliance?: { basis?: string } }).export_compliance?.basis ?? '',
    );
    for (const text of [basis, surfaceText('REVIEWER-NOTES-IOS.md')]) {
      expect(text).toMatch(/MMKV/);
      expect(text).toMatch(/BoringSSL/);
      expect(text).toMatch(/French encryption declaration/);
    }
  });

  it('ties the claim about pricing links to the web change that makes it true', () => {
    for (const file of REVIEWER_NOTES) {
      expect([file, surfaceText(file).includes('apps/web/lib/embedded-page.ts')]).toEqual([
        file,
        true,
      ]);
    }
    const iosNotes = listingIos as unknown as {
      age_rating: { note: string };
      pricing: { guideline_3_1_1_residual_risk: string };
    };
    for (const text of [iosNotes.age_rating.note, iosNotes.pricing.guideline_3_1_1_residual_risk]) {
      expect(text).toMatch(/pricing/);
      expect(text).toContain('apps/web/lib/embedded-page.ts');
      expect(text).toMatch(/\/contact-sales/);
    }
  });
});

describe('the text pasted into the store review fields', () => {
  const APPLE_NOTES_FIELD_BYTES = 4000;
  const NOTES_PASTE_BUDGET_BYTES = 3900;

  const pasteBlock = (file: string, heading: string): string => {
    const notes = readFileSync(join(storeListingDir, file), 'utf8');
    const start = notes.indexOf(heading);
    const firstSection = notes.indexOf('\n## ');
    expect([file, start]).not.toEqual([file, -1]);
    expect([file, start <= firstSection + 1]).toEqual([file, true]);
    const fence = /```text\n([\s\S]*?)\n```/.exec(notes.slice(start));
    expect(fence).not.toBeNull();
    return fence![1]!;
  };

  it('keeps the App Review notes text under Apple’s 4,000-byte limit with room to spare', () => {
    const text = pasteBlock('REVIEWER-NOTES-IOS.md', '## Paste this into App Review notes');
    const bytes = Buffer.byteLength(text, 'utf8');
    expect(NOTES_PASTE_BUDGET_BYTES).toBeLessThan(APPLE_NOTES_FIELD_BYTES);
    expect(bytes).toBeLessThanOrEqual(NOTES_PASTE_BUDGET_BYTES);
    expect(
      Buffer.byteLength(readFileSync(join(storeListingDir, 'REVIEWER-NOTES-IOS.md'))),
    ).toBeGreaterThan(APPLE_NOTES_FIELD_BYTES);
  });

  it('makes the App Review notes text complete on its own', () => {
    const text = pasteBlock('REVIEWER-NOTES-IOS.md', '## Paste this into App Review notes');
    for (const needed of [
      '[REVIEW ACCOUNT EMAIL]',
      '[REVIEW ACCOUNT PASSWORD]',
      'Local Mode',
      'AGI Cloud',
      'sells nothing',
      'Delete Account',
      'Report',
      'Share with AI providers?',
      'Remote Control',
      'review@agiworkforce.com',
    ]) {
      expect([needed, text.includes(needed)]).toEqual([needed, true]);
    }
    expect(text.includes(String.fromCodePoint(0x2014))).toBe(false);
  });

  it('gives Play a short App access text that is complete on its own', () => {
    const text = pasteBlock('REVIEWER-NOTES-ANDROID.md', '## Paste this into App access');
    for (const needed of [
      'Local Mode',
      'AGI Cloud',
      'Share with AI providers?',
      'Delete Account',
      'Report',
    ]) {
      expect([needed, text.includes(needed)]).toEqual([needed, true]);
    }
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(NOTES_PASTE_BUDGET_BYTES);
  });

  it('tells both stores that nothing is sold anywhere yet and that the review plan was granted', () => {
    const NOTHING_SOLD = /Nothing is sold on any platform before 1 January 2027/i;
    const REVIEW_PLAN_GRANTED =
      /plan was granted (?:to it )?for (?:this )?review without a purchase/;
    const surfaces: Array<[string, string]> = [
      [
        'iOS paste block',
        pasteBlock('REVIEWER-NOTES-IOS.md', '## Paste this into App Review notes'),
      ],
      [
        'Play paste block',
        pasteBlock('REVIEWER-NOTES-ANDROID.md', '## Paste this into App access'),
      ],
      ['iOS reviewer notes', surfaceText('REVIEWER-NOTES-IOS.md')],
      ['Android reviewer notes', surfaceText('REVIEWER-NOTES-ANDROID.md')],
      ['iOS listing purchase note', listingIos.pricing.in_app_purchase_note],
      ['Android listing product note', listingAndroid.in_app_products.note],
    ];
    for (const [surface, text] of surfaces) {
      const flat = collapseWhitespace(text);
      expect([surface, NOTHING_SOLD.test(flat)]).toEqual([surface, true]);
      expect([surface, REVIEW_PLAN_GRANTED.test(flat)]).toEqual([surface, true]);
    }
  });

  it('names the Billing line a granted plan shows wherever the review plan is described', () => {
    const screen = readFileSync(
      join(mobileRoot, 'src/features/settings/cloud-billing/index.tsx'),
      'utf8',
    );
    expect(screen).toMatch(/billingSource === 'manual'\s*\?\s*'Included with your account'/);
    for (const [surface, text] of [
      [
        'iOS paste block',
        pasteBlock('REVIEWER-NOTES-IOS.md', '## Paste this into App Review notes'),
      ],
      ['iOS listing purchase note', listingIos.pricing.in_app_purchase_note],
      ['Android listing product note', listingAndroid.in_app_products.note],
    ]) {
      expect([surface, text.includes('Included with your account')]).toEqual([surface, true]);
    }
  });
});

describe('Android dictation as the reviewer notes describe it', () => {
  it('states the Android version from which the app offers dictation', () => {
    const button = readFileSync(
      join(mobileRoot, 'src/features/voice/components/VoiceInputButton.tsx'),
      'utf8',
    );
    const voiceInput = readFileSync(
      join(mobileRoot, 'src/features/voice/services/voiceInput.ts'),
      'utf8',
    );
    const floor = /const ANDROID_ON_DEVICE_RECOGNIZER_API = (\d+);/.exec(voiceInput);
    expect(floor).not.toBeNull();
    expect(floor![1]).toBe('33');
    expect(voiceInput).toMatch(
      /export function onDeviceRecognizerGuaranteed\(\): boolean \{\s*return Platform\.OS !== 'android' \|\| Number\(Platform\.Version\) >= ANDROID_ON_DEVICE_RECOGNIZER_API;/,
    );
    expect(button).toMatch(/voiceSettingEnabled && onDeviceRecognizerGuaranteed\(\)/);
    const notes = collapseWhitespace(surfaceText('REVIEWER-NOTES-ANDROID.md'));
    expect(notes).toContain('Dictation is offered only on Android 13 (API 33) and later');
    expect(notes).toMatch(/On Android 8 to 12L the composer shows no dictation microphone/);
  });
});

describe('App Store age rating questionnaire', () => {
  type Answer = { answer: string; reason: string };
  const questionnaire = (
    listingIos.age_rating as unknown as { questionnaire: Record<string, Record<string, Answer>> }
  ).questionnaire;

  const APPLE_QUESTIONS: Record<string, string[]> = {
    'In-App Controls': ['Parental Controls', 'Age Assurance'],
    Capabilities: [
      'Unrestricted Web Access',
      'User-Generated Content',
      'Social Media',
      'Social Media Disabled for Users Under 13',
      'Messaging and Chat',
      'Advertising',
    ],
    'Mature Themes': [
      'Profanity or Crude Humor',
      'Horror/Fear Themes',
      'Alcohol, Tobacco, or Drug Use or References',
    ],
    'Medical or Wellness': ['Medical or Treatment Information', 'Health or Wellness Topics'],
    'Sexuality or Nudity': [
      'Mature or Suggestive Themes',
      'Sexual Content or Nudity',
      'Graphic Sexual Content and Nudity',
    ],
    Violence: [
      'Cartoon or Fantasy Violence',
      'Realistic Violence',
      'Prolonged Graphic or Sadistic Realistic Violence',
      'Guns or Other Weapons',
    ],
    'Chance-Based Activities': ['Gambling', 'Simulated Gambling', 'Contests', 'Loot Boxes'],
  };
  const YES_NO = new Set([
    ...APPLE_QUESTIONS['In-App Controls']!,
    ...APPLE_QUESTIONS.Capabilities!,
    'Health or Wellness Topics',
    'Gambling',
    'Loot Boxes',
  ]);
  const UNRATED = 99;
  const TIER: Record<string, Partial<Record<string, number>>> = {
    'Unrestricted Web Access': { Yes: 16 },
    'Social Media': { Yes: 13 },
    'Social Media Disabled for Users Under 13': { Yes: 13 },
    'Profanity or Crude Humor': { Infrequent: 9, Frequent: 13 },
    'Horror/Fear Themes': { Infrequent: 9, Frequent: 13 },
    'Alcohol, Tobacco, or Drug Use or References': { Infrequent: 13, Frequent: 18 },
    'Medical or Treatment Information': { Infrequent: 13, Frequent: 16 },
    'Health or Wellness Topics': { Yes: 9 },
    'Mature or Suggestive Themes': { Infrequent: 9, Frequent: 16 },
    'Sexual Content or Nudity': { Infrequent: 13, Frequent: 18 },
    'Graphic Sexual Content and Nudity': { Infrequent: UNRATED, Frequent: UNRATED },
    'Cartoon or Fantasy Violence': { Infrequent: 9, Frequent: 13 },
    'Realistic Violence': { Infrequent: 13, Frequent: 18 },
    'Prolonged Graphic or Sadistic Realistic Violence': {
      Infrequent: UNRATED,
      Frequent: UNRATED,
    },
    'Guns or Other Weapons': { Infrequent: 9, Frequent: 13 },
    Gambling: { Yes: 18 },
    'Simulated Gambling': { Infrequent: 13, Frequent: 18 },
    Contests: { Frequent: 13 },
    'Loot Boxes': { Yes: 9 },
  };

  it('asks exactly the questions on Apple’s current form, each answered with a level it offers', () => {
    expect(Object.keys(questionnaire).sort()).toEqual(Object.keys(APPLE_QUESTIONS).sort());
    for (const [section, questions] of Object.entries(APPLE_QUESTIONS)) {
      expect([section, Object.keys(questionnaire[section] ?? {}).sort()]).toEqual([
        section,
        [...questions].sort(),
      ]);
      for (const question of questions) {
        const { answer, reason } = questionnaire[section]![question]!;
        const allowed = YES_NO.has(question) ? ['Yes', 'No'] : ['None', 'Infrequent', 'Frequent'];
        expect([question, allowed.includes(answer)]).toEqual([question, true]);
        expect([question, reason.trim().length > 0]).toEqual([question, true]);
      }
    }
  });

  it('records the rating Apple calculates from those answers, never Unrated', () => {
    const answers = Object.values(questionnaire).flatMap((section) => Object.entries(section));
    const calculated = Math.max(
      4,
      ...answers.map(([question, { answer }]) => TIER[question]?.[answer] ?? 4),
    );
    expect(calculated).toBeLessThan(UNRATED);
    expect(
      (listingIos.age_rating as unknown as { calculated_rating: string }).calculated_rating,
    ).toBe(`${calculated}+`);

    const resolvedOptions = jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ timeZone: 'Etc/UTC' } as Intl.ResolvedDateTimeFormatOptions);
    const lowestAdmittedAge = getAgeThreshold();
    resolvedOptions.mockRestore();
    expect(listingIos.age_rating.rating).toBe(`${Math.max(calculated, lowestAdmittedAge)}+`);
  });

  it('compares the rating with the Terms minimum age, not a stricter regional gate', () => {
    const note = (listingIos.age_rating as unknown as { note: string }).note;
    const rating = Number.parseInt(listingIos.age_rating.rating, 10);
    expect(ACCOUNT_MINIMUM_AGE).toBeLessThan(rating);
    expect(note).toContain(`the Terms set the account minimum at ${ACCOUNT_MINIMUM_AGE}`);
    const belowClaim = /requirements"; ([\s\S]*?)below (\d+)\+, so no override is needed/.exec(
      note,
    );
    expect(belowClaim).not.toBeNull();
    expect(Number(belowClaim![2])).toBe(rating);
    const agesClaimedBelow = [...belowClaim![1]!.matchAll(/\b(\d+)\b/g)].map(([, age]) =>
      Number(age),
    );
    expect(agesClaimedBelow).toEqual([ACCOUNT_MINIMUM_AGE]);
  });

  it('answers web access from how the app opens a link in an answer', () => {
    const links = readFileSync(join(mobileRoot, 'lib/safeOpenURL.ts'), 'utf8');
    const opensAnyPageInApp =
      /export async function openUntrustedUrlInAppBrowser[\s\S]*?presentInAppBrowser/.test(links);
    expect(questionnaire.Capabilities!['Unrestricted Web Access']!.answer).toBe(
      opensAnyPageInApp ? 'Yes' : 'No',
    );
  });
});

describe('listing fields Apple checks', () => {
  it('uses only keywords longer than two characters, within 100 bytes', () => {
    const keywords = listingIos.keywords.split(',');
    for (const keyword of keywords) {
      expect([keyword, keyword.trim().length > 2]).toEqual([keyword, true]);
    }
    expect(Buffer.byteLength(listingIos.keywords, 'utf8')).toBeLessThanOrEqual(100);
  });

  it('leaves the copyright symbol to App Store Connect', () => {
    const copyright = (listingIos as unknown as { copyright: string }).copyright;
    expect(copyright).not.toContain('©');
    expect(copyright).toMatch(/^\d{4} \S/);
  });

  it('gives App Review the role address the listing names for it', () => {
    const contact = listingIos as unknown as {
      contact_information: { email: string };
      app_review_information: { review_contact_email: string };
    };
    expect(contact.contact_information.email).toBe(
      contact.app_review_information.review_contact_email,
    );
  });
});

describe('Play data safety declarations, continued', () => {
  it('rates both stores no lower than the lowest age the shipped age gate admits', () => {
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

    expect(Number.parseInt(listingIos.age_rating.rating, 10)).toBeGreaterThanOrEqual(
      lowestAdmittedAge,
    );
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

describe('v1 background modes', () => {
  type ExpoConfig = Record<string, unknown> & {
    plugins: unknown[];
    mods: {
      ios: {
        infoPlist: (config: Record<string, unknown>) => Promise<{
          modResults: Record<string, unknown>;
        }>;
      };
    };
  };
  const PRODUCTION_ENV = {
    APP_ENV: 'production',
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_contract_test',
    EXPO_PUBLIC_API_URL: 'https://agiworkforce.com',
  };
  const flagsPath = join(mobileRoot, 'lib', 'v1FeatureFlags.ts');

  const withProductionEnv = async <T>(run: () => Promise<T>): Promise<T> => {
    const previous = Object.fromEntries(
      Object.keys(PRODUCTION_ENV).map((name) => [name, process.env[name]]),
    );
    Object.assign(process.env, PRODUCTION_ENV);
    try {
      return await run();
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  };

  const productionInfoPlist = () =>
    withProductionEnv(async () => {
      jest.resetModules();
      const prebuildConfig = require(
        require.resolve('@expo/prebuild-config', {
          paths: [dirname(require.resolve('expo/package.json'))],
        }),
      ) as {
        getPrebuildConfigAsync: (
          projectRoot: string,
          options: { platforms: string[] },
        ) => Promise<{ exp: ExpoConfig }>;
      };
      const { exp } = await prebuildConfig.getPrebuildConfigAsync(mobileRoot, {
        platforms: ['ios'],
      });
      const { modResults } = await exp.mods.ios.infoPlist({
        ...exp,
        modRawConfig: exp,
        modResults: {},
        modRequest: {
          projectRoot: mobileRoot,
          platformProjectRoot: join(mobileRoot, 'ios'),
          platform: 'ios',
          modName: 'infoPlist',
          introspect: true,
        },
      });
      return modResults;
    });

  const pluginsWithDispatch = (dispatch: boolean) => {
    const flags = readFileSync(flagsPath, 'utf8').replace(
      /^(\s*dispatch:\s*)(?:true|false)(,?)$/m,
      `$1${dispatch}$2`,
    );
    let plugins: unknown[] = [];
    jest.isolateModules(() => {
      const fs = jest.requireActual<typeof import('node:fs')>('fs');
      jest.doMock('fs', () => ({
        ...fs,
        readFileSync: (file: string, ...rest: unknown[]) =>
          file === flagsPath
            ? flags
            : (fs.readFileSync as (...args: unknown[]) => unknown)(file, ...rest),
      }));
      plugins = (require('../app.config.js') as { expo: { plugins: unknown[] } }).expo.plugins;
    });
    jest.dontMock('fs');
    return plugins;
  };

  it('declares no background mode in the version 1 production Info.plist, since nothing runs in the background', async () => {
    expect(FEATURES.dispatch).toBe(false);
    const infoPlist = await productionInfoPlist();
    expect(infoPlist.UIBackgroundModes).toBeUndefined();
    expect(infoPlist.BGTaskSchedulerPermittedIdentifiers).toBeUndefined();
  }, 60_000);

  it('links the background task plugin to the dispatch flag, the only feature that registers a task', () => {
    expect(pluginsWithDispatch(FEATURES.dispatch).includes('expo-background-task')).toBe(
      FEATURES.dispatch,
    );
    expect(pluginsWithDispatch(true)).toContain('expo-background-task');
    expect(pluginsWithDispatch(false)).not.toContain('expo-background-task');
  });
});
