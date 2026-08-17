/* eslint-disable @typescript-eslint/no-require-imports */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const appConfig = require('../app.config.js') as {
  expo: { ios?: { infoPlist?: Record<string, unknown> } };
};

const listingIos = require('../store-listing/LISTING-METADATA-IOS.json') as {
  app_review_information: { notes_file: string };
  pricing: { in_app_purchase_note: string; guideline_3_1_1_residual_risk?: string };
  export_compliance?: { uses_non_exempt_encryption?: boolean };
  privacy_nutrition_labels: unknown;
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

const stripXmlComments = (xml: string) => xml.replace(/<!--[\s\S]*?-->/g, '');

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
const CLAIM_SURFACES = [...LISTING_FILES, 'REVIEWER-NOTES-IOS.md'];

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
    expect(listingIos.pricing.guideline_3_1_1_residual_risk).toMatch(/known-flaws\.md/);
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
