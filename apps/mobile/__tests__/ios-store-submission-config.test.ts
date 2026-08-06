/* eslint-disable @typescript-eslint/no-require-imports */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const appConfig = require('../app.config.js') as {
  expo: { ios?: { infoPlist?: Record<string, unknown> } };
};

const listingIos = require('../store-listing/LISTING-METADATA-IOS.json') as {
  app_review_information: { notes_file: string };
  pricing: { in_app_purchase_note: string; guideline_3_1_1_residual_risk?: string };
  export_compliance?: { uses_non_exempt_encryption?: boolean };
};

const repoRoot = join(__dirname, '..', '..', '..');
const storeListingDir = join(__dirname, '..', 'store-listing');

describe('iOS submission config', () => {
  // Without this key App Store Connect holds every upload in "Missing
  // Compliance" until the questionnaire is answered by hand, per build.
  it('answers export compliance in Info.plist', () => {
    expect(appConfig.expo.ios?.infoPlist?.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it('keeps the listing export-compliance record agreeing with Info.plist', () => {
    expect(listingIos.export_compliance?.uses_non_exempt_encryption).toBe(
      appConfig.expo.ios?.infoPlist?.ITSAppUsesNonExemptEncryption,
    );
  });

  // 906fe5cda deleted the files these fields pointed at and left the JSON
  // referencing them, so App Review would have been handed a dead path.
  it('points app_review_information.notes_file at a file that exists', () => {
    const notesPath = join(repoRoot, listingIos.app_review_information.notes_file);
    expect(existsSync(notesPath)).toBe(true);
  });

  it('does not reference the deleted founder submission checklist', () => {
    const serialized = JSON.stringify(listingIos);
    expect(serialized).not.toContain('FOUNDER-SUBMISSION-CHECKLIST');
  });

  // The store description is itself a claim to App Review. Saying the app links
  // out for checkout is a self-reported Guideline 3.1.1 violation, and it is not
  // what cloud-billing/index.tsx does — handleUpgrade opens an in-app sheet.
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

  // HealthKit was fully removed in 93ca123df; the manifest carried a stale
  // "escalate before submission" block long after the code was gone.
  it('carries no HealthKit claims in the privacy manifest', () => {
    const manifest = readFileSync(join(storeListingDir, 'ios', 'PrivacyInfo.xcprivacy'), 'utf8');
    expect(manifest).not.toContain('OPEN GAP');
    expect(manifest).not.toMatch(/NSHealthShareUsageDescription|healthKitQuery/);
  });
});
